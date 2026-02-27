import axios from "axios";
import { NextResponse } from "next/server";

import { getApiEndpointStatusBySlug } from "@/lib/api-endpoints";
import { buildBanInfo, normalizeUserBanState } from "@/lib/ban";
import { prisma } from "@/lib/prisma";

const CREATOR = "JzProject";
const STICKERLY_SMART_SEARCH_ENDPOINT = "https://api.sticker.ly/v4/stickerPack/smartSearch";

type StickerlyPack = Record<string, unknown> & {
  resourceUrlPrefix?: string;
  resourceFiles?: string[];
  resourceZip?: string;
};

function errorResponse(code: number, message: string) {
  return NextResponse.json(
    {
      status: false,
      code,
      creator: CREATOR,
      message,
    },
    { status: code },
  );
}

function getUtcDateOnly(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function parseLimit(rawLimit: string | null) {
  if (!rawLimit) {
    return 20;
  }

  const parsed = Number.parseInt(rawLimit, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.min(parsed, 50);
}

function buildXduid() {
  return Buffer.from(String(Date.now())).toString("base64");
}

function normalizeStickerlyPack(pack: StickerlyPack) {
  const prefix = typeof pack.resourceUrlPrefix === "string" ? pack.resourceUrlPrefix : "";

  const files = Array.isArray(pack.resourceFiles)
    ? pack.resourceFiles
        .filter((file): file is string => typeof file === "string" && file.length > 0)
        .map((file) => (file.startsWith("http") ? file : `${prefix}${file}`))
    : [];

  const rawZip = typeof pack.resourceZip === "string" ? pack.resourceZip : "";
  const resourceZip = rawZip
    ? rawZip.startsWith("http")
      ? rawZip
      : `${prefix}${rawZip}`
    : "";

  return {
    ...pack,
    resourceFiles: files,
    resourceZip,
  };
}

async function smartSearchSticker(keyword: string, limit: number) {
  const response = await axios.post(
    STICKERLY_SMART_SEARCH_ENDPOINT,
    {
      keyword,
      enabledKeywordSearch: true,
      filter: {
        extendSearchResult: false,
        sortBy: "RECOMMENDED",
        languages: ["ALL"],
        minStickerCount: 5,
        searchBy: "ALL",
        stickerType: "ALL",
      },
    },
    {
      timeout: 30000,
      headers: {
        "User-Agent": "androidapp.stickerly/3.25.2 (220333QAG; U; Android 30; ms-MY; id;)",
        "Accept-Encoding": "gzip",
        "Content-Type": "application/json",
        "x-duid": buildXduid(),
      },
    },
  );

  const packs = response.data?.result?.stickerPacks;
  if (!Array.isArray(packs)) {
    return [];
  }

  return packs
    .filter((pack): pack is StickerlyPack => Boolean(pack && typeof pack === "object"))
    .map((pack) => normalizeStickerlyPack(pack))
    .slice(0, limit);
}

export async function handleStickerlySearchRequest(url: URL) {
  const endpoint = await getApiEndpointStatusBySlug("stickerly-search");
  if (endpoint?.status === "NON_ACTIVE") {
    return errorResponse(503, "Endpoint is currently non-active.");
  }

  if (endpoint?.status === "MAINTENANCE") {
    return errorResponse(503, "Endpoint is under maintenance.");
  }

  const keyword = (url.searchParams.get("keyword") || url.searchParams.get("query") || "anime").trim();
  const rawLimit = url.searchParams.get("limit");
  const apiKeyValue = (url.searchParams.get("apikey") || "").trim();

  if (!keyword) {
    return errorResponse(400, "Query parameter 'keyword' is required.");
  }

  if (keyword.length < 2) {
    return errorResponse(400, "Query parameter 'keyword' must be at least 2 characters.");
  }

  const limit = parseLimit(rawLimit);
  if (!limit) {
    return errorResponse(400, "Query parameter 'limit' must be a positive integer.");
  }

  if (!apiKeyValue) {
    return errorResponse(400, "Query parameter 'apikey' is required.");
  }

  const apiKey = await prisma.apiKey.findUnique({
    where: { key: apiKeyValue },
    include: {
      user: {
        select: {
          id: true,
          referralBonusDaily: true,
          isBlocked: true,
          blockedAt: true,
          banUntil: true,
          banReason: true,
        },
      },
    },
  });

  if (!apiKey) {
    return errorResponse(401, "Invalid API key.");
  }

  if (apiKey.status !== "ACTIVE") {
    return errorResponse(403, "API key is not active.");
  }

  const normalizedBan = await normalizeUserBanState(prisma, {
    id: apiKey.user.id,
    isBlocked: apiKey.user.isBlocked,
    blockedAt: apiKey.user.blockedAt,
    banUntil: apiKey.user.banUntil,
    banReason: apiKey.user.banReason,
  });

  if (normalizedBan.isBlocked) {
    const banInfo = buildBanInfo({
      isBlocked: normalizedBan.isBlocked,
      blockedAt: normalizedBan.blockedAt,
      banUntil: normalizedBan.banUntil,
      banReason: normalizedBan.banReason,
    });
    return errorResponse(403, banInfo.message || "User account is blocked.");
  }

  const effectiveLimit = apiKey.dailyLimit + apiKey.user.referralBonusDaily;
  const usageDate = getUtcDateOnly(new Date());

  const usageResult = await prisma.$transaction(async (tx) => {
    const existingUsage = await tx.usageLog.findUnique({
      where: {
        apiKeyId_date: {
          apiKeyId: apiKey.id,
          date: usageDate,
        },
      },
      select: {
        requestsCount: true,
      },
    });

    const usedCount = existingUsage?.requestsCount ?? 0;
    if (usedCount >= effectiveLimit) {
      return { limited: true, usedCount };
    }

    if (existingUsage) {
      const updated = await tx.usageLog.update({
        where: {
          apiKeyId_date: {
            apiKeyId: apiKey.id,
            date: usageDate,
          },
        },
        data: {
          requestsCount: {
            increment: 1,
          },
        },
        select: {
          requestsCount: true,
        },
      });

      return { limited: false, usedCount: updated.requestsCount };
    }

    const created = await tx.usageLog.create({
      data: {
        apiKeyId: apiKey.id,
        date: usageDate,
        requestsCount: 1,
      },
      select: {
        requestsCount: true,
      },
    });

    return { limited: false, usedCount: created.requestsCount };
  });

  if (usageResult.limited) {
    return errorResponse(429, "Daily limit reached.");
  }

  let packs: Array<Record<string, unknown>> = [];
  try {
    packs = await smartSearchSticker(keyword, limit);
  } catch {
    return errorResponse(502, "Failed to fetch data from source.");
  }

  if (packs.length === 0) {
    return errorResponse(404, "No sticker pack found.");
  }

  const remainingLimit = Math.max(effectiveLimit - usageResult.usedCount, 0);

  return NextResponse.json(
    {
      status: true,
      code: 200,
      creator: CREATOR,
      query: keyword,
      limit,
      total_packs: packs.length,
      result: packs,
      remaining_limit: remainingLimit,
    },
    { status: 200 },
  );
}

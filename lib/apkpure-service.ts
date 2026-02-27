import { NextResponse } from "next/server";
import { load } from "cheerio";

import { getApiEndpointStatusBySlug } from "@/lib/api-endpoints";
import { buildBanInfo, normalizeUserBanState } from "@/lib/ban";
import { prisma } from "@/lib/prisma";

const cloudscraper = require("cloudscraper") as {
  get: (url: string, options?: Record<string, unknown>) => Promise<string>;
};

const CREATOR = "JzProject";
const APKPURE_SEARCH_ENDPOINT = "https://apkpure.com/api/v1/search_suggestion_new";

type ApkPureResultItem = Record<string, unknown> & {
  packageName?: string;
  downloadUrlFile: string;
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

function decodeHtmlValue(value: string | undefined | null) {
  if (!value) {
    return null;
  }

  return value.replace(/&amp;/g, "&").replace(/&#38;/g, "&").trim() || null;
}

function buildApkPureSearchUrl(keyword: string, limit: number) {
  const encodedKeyword = encodeURIComponent(keyword);
  return `${APKPURE_SEARCH_ENDPOINT}?key=${encodedKeyword}&limit=${limit}`;
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

async function searchApkPureViaApi(keyword: string, limit: number): Promise<ApkPureResultItem[]> {
  const targetUrl = buildApkPureSearchUrl(keyword, limit);

  const rawResponse = await cloudscraper.get(targetUrl, {
    timeout: 30000,
    headers: {
      accept: "application/json,text/plain,*/*",
      "accept-language": "en-US,en;q=0.9,id;q=0.8",
      origin: "https://apkpure.com",
      referer: "https://apkpure.com/",
      "user-agent":
        "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36",
    },
  });

  const parsed = JSON.parse(rawResponse) as unknown;
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as Record<string, unknown>;
      const packageName = typeof record.packageName === "string" ? record.packageName : "";
      if (!packageName) {
        return null;
      }

      return {
        ...record,
        downloadUrlFile: `https://d.apkpure.com/b/APK/${packageName}?version=latest`,
      } as ApkPureResultItem;
    })
    .filter((item): item is ApkPureResultItem => Boolean(item));
}

async function searchApkPureViaWeb(keyword: string, limit: number): Promise<ApkPureResultItem[]> {
  const targetUrl = `https://apkpure.net/search?q=${encodeURIComponent(keyword)}`;
  const response = await fetch(targetUrl, {
    method: "GET",
    cache: "no-store",
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9,id;q=0.8",
      "user-agent":
        "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36",
      referer: "https://apkpure.net/",
    },
  });

  if (!response.ok) {
    return [];
  }

  const html = await response.text();
  const $ = load(html);
  const results: ApkPureResultItem[] = [];

  $("a.apk-item").each((index, element) => {
    if (index >= limit) {
      return;
    }

    const packageName = ($(element).attr("data-dt-pkg") || "").trim();
    if (!packageName) {
      return;
    }

    const href = ($(element).attr("href") || "").trim();
    const title = ($(element).attr("title") || $(element).find(".title").text() || "").trim();
    const developer = ($(element).find(".dev").text() || "").trim();
    const ratingText = ($(element).find(".stars").text() || "").trim();
    const icon =
      decodeHtmlValue(
        $(element).find("img").attr("data-original") ||
          $(element).find("img").attr("data-src") ||
          $(element).find("img").attr("src"),
      ) || "";

    const appUrl = href ? new URL(href, "https://apkpure.net").toString() : "";

    results.push({
      packageName,
      title,
      developer,
      rating: ratingText || null,
      icon,
      appUrl,
      downloadUrlFile: `https://d.apkpure.com/b/APK/${packageName}?version=latest`,
    });
  });

  return results;
}

export async function handleApkPureDownloadRequest(url: URL) {
  const endpoint = await getApiEndpointStatusBySlug("apkpure-dl");
  if (endpoint?.status === "NON_ACTIVE") {
    return errorResponse(503, "Endpoint is currently non-active.");
  }

  if (endpoint?.status === "MAINTENANCE") {
    return errorResponse(503, "Endpoint is under maintenance.");
  }

  const keyword =
    (url.searchParams.get("query") ||
      url.searchParams.get("keyword") ||
      url.searchParams.get("key") ||
      "")
      .trim();
  const rawLimit = url.searchParams.get("limit");
  const apiKeyValue = (url.searchParams.get("apikey") || "").trim();

  if (!keyword) {
    return errorResponse(400, "Query parameter 'query' is required.");
  }

  if (keyword.length < 2) {
    return errorResponse(400, "Query parameter 'query' must be at least 2 characters.");
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

  let results: ApkPureResultItem[] = [];
  let source = "apkpure-api";
  try {
    results = await searchApkPureViaApi(keyword, limit);
  } catch {
    results = [];
  }

  if (results.length === 0) {
    try {
      results = await searchApkPureViaWeb(keyword, limit);
      source = "apkpure-web";
    } catch {
      return errorResponse(502, "Failed to fetch data from source.");
    }
  }

  if (results.length === 0) {
    return errorResponse(404, "No APK result found.");
  }

  const remainingLimit = Math.max(effectiveLimit - usageResult.usedCount, 0);

  return NextResponse.json(
    {
      status: true,
      code: 200,
      creator: CREATOR,
      query: keyword,
      limit,
      source,
      total_results: results.length,
      result: results,
      remaining_limit: remainingLimit,
    },
    { status: 200 },
  );
}

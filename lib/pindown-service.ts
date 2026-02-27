import axios from "axios";
import { load } from "cheerio";
import FormData from "form-data";
import { NextResponse } from "next/server";

import { getApiEndpointStatusBySlug } from "@/lib/api-endpoints";
import { buildBanInfo, normalizeUserBanState } from "@/lib/ban";
import { prisma } from "@/lib/prisma";

const CREATOR = "JzProject";
const PINDOWN_BASE_URL = "https://pindown.io";
const PINDOWN_PAGE_URL = `${PINDOWN_BASE_URL}/en1`;
const PINDOWN_ACTION_URL = `${PINDOWN_BASE_URL}/action`;

type PindownLink = {
  quality: string;
  url: string;
};

type PindownResult = {
  success?: boolean;
  error?: boolean;
  html?: string;
  message?: string;
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

function normalizePinterestUrl(value: string) {
  try {
    const parsed = new URL(value);
    const protocol = parsed.protocol.toLowerCase();
    const hostname = parsed.hostname.toLowerCase();

    if (protocol !== "http:" && protocol !== "https:") {
      return null;
    }

    const isPinterest =
      hostname === "pinterest.com" ||
      hostname.endsWith(".pinterest.com") ||
      hostname === "pin.it" ||
      hostname.endsWith(".pin.it");

    if (!isPinterest) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

async function preparePindownSession(userAgent: string) {
  const response = await axios.get<string>(PINDOWN_PAGE_URL, {
    timeout: 25000,
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
      "user-agent": userAgent,
    },
  });

  const cookie = (response.headers["set-cookie"] || [])
    .map((item) => item.split(";")[0])
    .join("; ");

  const $ = load(response.data);
  const hiddenInputs = $("form")
    .first()
    .find("input[type='hidden']")
    .toArray()
    .map((element) => ({
      name: $(element).attr("name")?.trim() || "",
      value: $(element).attr("value")?.trim() || "",
    }));

  const tokenInput = hiddenInputs.find((input) => input.name && input.name !== "lang");
  const langInput = hiddenInputs.find((input) => input.name === "lang");

  if (!tokenInput) {
    throw new Error("Token input not found.");
  }

  return {
    cookie,
    tokenName: tokenInput.name,
    tokenValue: tokenInput.value,
    lang: langInput?.value || "en",
  };
}

function parsePindownLinks(html: string) {
  const $ = load(html);
  const links: PindownLink[] = [];
  const seen = new Set<string>();

  $("a[href*='https://dl.pincdn.app/v2?token=']").each((_, element) => {
    const url = ($(element).attr("href") || "").trim();
    if (!url || seen.has(url)) {
      return;
    }

    const qualityCell = $(element)
      .closest("td")
      .prev("td")
      .text()
      .replace(/\s+/g, " ")
      .trim();

    const quality = qualityCell || "Download";

    links.push({
      quality,
      url,
    });

    seen.add(url);
  });

  const uploadedBy = $(".media .content p")
    .first()
    .text()
    .replace(/\s+/g, " ")
    .trim();
  const previewImage = $("img[src*='pinimg.com']").first().attr("src")?.trim() || "";

  return {
    links,
    meta: {
      uploaded_by: uploadedBy,
      preview_image: previewImage,
    },
  };
}

async function fetchPindownResult(targetUrl: string, lang = "en") {
  const userAgent =
    "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Mobile Safari/537.36";
  const session = await preparePindownSession(userAgent);

  const formData = new FormData();
  formData.append("url", targetUrl);
  formData.append(session.tokenName, session.tokenValue);
  formData.append("lang", lang || session.lang);

  const response = await axios.post<PindownResult>(PINDOWN_ACTION_URL, formData, {
    timeout: 30000,
    headers: {
      accept: "*/*",
      "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
      cookie: session.cookie,
      origin: PINDOWN_BASE_URL,
      referer: PINDOWN_PAGE_URL,
      "sec-ch-ua": '"Not(A:Brand";v="8", "Chromium";v="144", "Google Chrome";v="144"',
      "sec-ch-ua-mobile": "?1",
      "sec-ch-ua-platform": '"Android"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "user-agent": userAgent,
      ...formData.getHeaders(),
    },
    validateStatus: () => true,
  });

  if (response.status !== 200) {
    throw new Error("Pindown upstream error.");
  }

  return response.data;
}

export async function handlePindownRequest(url: URL) {
  const endpoint = await getApiEndpointStatusBySlug("pindown");
  if (endpoint?.status === "NON_ACTIVE") {
    return errorResponse(503, "Endpoint is currently non-active.");
  }

  if (endpoint?.status === "MAINTENANCE") {
    return errorResponse(503, "Endpoint is under maintenance.");
  }

  const pinterestUrl = (url.searchParams.get("url") || "").trim();
  const apiKeyValue = (url.searchParams.get("apikey") || "").trim();
  const lang = (url.searchParams.get("lang") || "en").trim().toLowerCase();

  if (!pinterestUrl) {
    return errorResponse(400, "Query parameter 'url' is required.");
  }

  const normalizedUrl = normalizePinterestUrl(pinterestUrl);
  if (!normalizedUrl) {
    return errorResponse(400, "Query parameter 'url' must be a valid Pinterest URL.");
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

  let upstreamResult: PindownResult;
  try {
    upstreamResult = await fetchPindownResult(normalizedUrl, lang || "en");
  } catch {
    return errorResponse(502, "Failed to fetch data from source.");
  }

  if (!upstreamResult.success || !upstreamResult.html) {
    return errorResponse(404, upstreamResult.message || "No downloadable media found.");
  }

  const parsed = parsePindownLinks(upstreamResult.html);
  if (parsed.links.length === 0) {
    return errorResponse(404, "No downloadable media found.");
  }

  const remainingLimit = Math.max(effectiveLimit - usageResult.usedCount, 0);

  return NextResponse.json(
    {
      status: true,
      code: 200,
      creator: CREATOR,
      result: {
        source_url: normalizedUrl,
        uploaded_by: parsed.meta.uploaded_by,
        preview_image: parsed.meta.preview_image,
        links: parsed.links,
      },
      total_links: parsed.links.length,
      remaining_limit: remainingLimit,
    },
    { status: 200 },
  );
}

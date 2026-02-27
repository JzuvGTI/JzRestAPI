import axios from "axios";
import { load } from "cheerio";
import { NextResponse } from "next/server";

import { getApiEndpointStatusBySlug } from "@/lib/api-endpoints";
import { buildBanInfo, normalizeUserBanState } from "@/lib/ban";
import { prisma } from "@/lib/prisma";

const CREATOR = "JzProject";
const TIKTOKIO_ENDPOINT = "https://tiktokio.com/api/v1/tk/html";
const TIKTOKIO_PREFIX = "tiktokio.com";

type TikTokImageItem = {
  index: number;
  url: string;
};

type TikTokDownloadResult = {
  title: string | null;
  cover: string | null;
  images: TikTokImageItem[];
  videos: {
    nowm: string | null;
    nowm_hd: string | null;
    wm: string | null;
  };
  mp3: string | null;
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

function decodeHtmlUrl(url: string | undefined) {
  if (!url) {
    return null;
  }

  return url.replace(/&#38;/g, "&").replace(/&amp;/g, "&").trim() || null;
}

function normalizeTikTokUrl(value: string) {
  try {
    const parsed = new URL(value);
    const protocol = parsed.protocol.toLowerCase();
    const hostname = parsed.hostname.toLowerCase();

    if (protocol !== "http:" && protocol !== "https:") {
      return null;
    }

    const isTikTok =
      hostname === "tiktok.com" ||
      hostname.endsWith(".tiktok.com") ||
      hostname === "vt.tiktok.com" ||
      hostname.endsWith(".vt.tiktok.com") ||
      hostname === "vm.tiktok.com" ||
      hostname.endsWith(".vm.tiktok.com");

    if (!isTikTok) {
      return null;
    }

    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function parseTikTokioHtml(html: string): TikTokDownloadResult {
  const $ = load(html);

  const result: TikTokDownloadResult = {
    title: null,
    cover: null,
    images: [],
    videos: {
      nowm: null,
      nowm_hd: null,
      wm: null,
    },
    mp3: null,
  };

  const title = $(".video-info h3").first().text().trim();
  result.title = title || null;

  const cover = decodeHtmlUrl($(".video-info > img").attr("src") || $(".video-info img").first().attr("src"));
  result.cover = cover;

  $(".images-grid .image-item").each((index, element) => {
    const rawUrl = $(element).find("a").attr("href") || $(element).find("img").attr("src");
    const imageUrl = decodeHtmlUrl(rawUrl);
    if (!imageUrl) {
      return;
    }

    result.images.push({
      index: index + 1,
      url: imageUrl,
    });
  });

  $(".download-links a").each((_, element) => {
    const text = $(element).text().toLowerCase();
    const href = decodeHtmlUrl($(element).attr("href"));
    if (!href) {
      return;
    }

    if (text.includes("without watermark") && text.includes("hd")) {
      result.videos.nowm_hd = href;
    } else if (text.includes("without watermark")) {
      result.videos.nowm = href;
    } else if (text.includes("watermark")) {
      result.videos.wm = href;
    } else if (text.includes("mp3")) {
      result.mp3 = href;
    }
  });

  return result;
}

function hasDownloadableContent(result: TikTokDownloadResult) {
  return Boolean(
    result.videos.nowm || result.videos.nowm_hd || result.videos.wm || result.mp3 || result.images.length > 0,
  );
}

async function scrapeTikTokMedia(tiktokUrl: string) {
  const headers = {
    accept: "*/*",
    "accept-language": "ms-MY",
    "cache-control": "no-cache",
    "content-type": "application/json",
    origin: "https://tiktokio.com",
    pragma: "no-cache",
    referer: "https://tiktokio.com/",
    "user-agent":
      "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36",
  };

  const response = await axios.post(TIKTOKIO_ENDPOINT, {
    vid: tiktokUrl,
    prefix: TIKTOKIO_PREFIX,
  }, {
    headers,
    timeout: 30000,
    maxRedirects: 5,
  });

  const html =
    typeof response.data === "string"
      ? response.data
      : typeof response.data?.html === "string"
        ? response.data.html
        : "";

  if (!html) {
    throw new Error("Invalid response from source.");
  }

  return parseTikTokioHtml(html);
}

export async function handleTikTokDownloadRequest(url: URL) {
  const endpoint = await getApiEndpointStatusBySlug("tiktok-dl");
  if (endpoint?.status === "NON_ACTIVE") {
    return errorResponse(503, "Endpoint is currently non-active.");
  }

  if (endpoint?.status === "MAINTENANCE") {
    return errorResponse(503, "Endpoint is under maintenance.");
  }

  const targetUrl = (url.searchParams.get("url") || "").trim();
  const apiKeyValue = (url.searchParams.get("apikey") || "").trim();

  if (!targetUrl) {
    return errorResponse(400, "Query parameter 'url' is required.");
  }

  const normalizedUrl = normalizeTikTokUrl(targetUrl);
  if (!normalizedUrl) {
    return errorResponse(400, "Query parameter 'url' must be a valid TikTok URL.");
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

  let parsedResult: TikTokDownloadResult;
  try {
    parsedResult = await scrapeTikTokMedia(normalizedUrl);
  } catch {
    return errorResponse(502, "Failed to fetch data from source.");
  }

  if (!hasDownloadableContent(parsedResult)) {
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
        title: parsedResult.title,
        cover: parsedResult.cover,
        images: parsedResult.images,
        videos: parsedResult.videos,
        mp3: parsedResult.mp3,
      },
      total_images: parsedResult.images.length,
      remaining_limit: remainingLimit,
    },
    { status: 200 },
  );
}

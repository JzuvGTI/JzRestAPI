import { NextResponse } from "next/server";

import { getApiEndpointStatusBySlug } from "@/lib/api-endpoints";
import { buildBanInfo, normalizeUserBanState } from "@/lib/ban";
import { prisma } from "@/lib/prisma";

const CREATOR = "JzProject";
const SAVETHEVIDEO_BASE_URL = "https://api.v02.savethevideo.com";
const TASKS_ENDPOINT = `${SAVETHEVIDEO_BASE_URL}/tasks`;
const MAX_POLL_RETRY = 12;
const POLL_DELAY_MS = 1500;

type SaveTheVideoFormat = {
  url?: string;
  format?: string;
  resolution?: string;
};

type SaveTheVideoInfoResult = {
  title?: string;
  duration_string?: string;
  thumbnail?: string;
  url?: string;
  format?: string;
  resolution?: string;
  formats?: SaveTheVideoFormat[];
};

type SaveTheVideoTaskResponse = {
  id?: string;
  href?: string;
  state?: "pending" | "completed" | "failed" | string;
  result?: SaveTheVideoInfoResult[];
  error?: string;
  message?: string;
};

class SourceRateLimitError extends Error {}

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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getSaveTheVideoHeaders() {
  return {
    accept: "application/json",
    "content-type": "application/json",
    origin: "https://www.savethevideo.com",
    referer: "https://www.savethevideo.com/",
    "user-agent":
      "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Mobile Safari/537.36",
    "sec-ch-ua": '"Not(A:Brand";v="8", "Chromium";v="144", "Google Chrome";v="144"',
    "sec-ch-ua-mobile": "?1",
    "sec-ch-ua-platform": '"Android"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
  };
}

function normalizeDailymotionUrl(value: string) {
  try {
    const parsed = new URL(value);
    const protocol = parsed.protocol.toLowerCase();
    const hostname = parsed.hostname.toLowerCase();

    if (protocol !== "http:" && protocol !== "https:") {
      return null;
    }

    const isDailymotion =
      hostname === "dailymotion.com" ||
      hostname.endsWith(".dailymotion.com") ||
      hostname === "dai.ly" ||
      hostname.endsWith(".dai.ly");

    if (!isDailymotion) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function extractFirstResult(data: SaveTheVideoTaskResponse) {
  if (Array.isArray(data.result) && data.result.length > 0) {
    return data.result[0];
  }
  return null;
}

async function requestSaveTheVideoTask(url: string): Promise<SaveTheVideoTaskResponse> {
  const response = await fetch(TASKS_ENDPOINT, {
    method: "POST",
    headers: getSaveTheVideoHeaders(),
    body: JSON.stringify({
      type: "info",
      url,
    }),
    cache: "no-store",
  });

  if (response.status === 429) {
    throw new SourceRateLimitError("Source rate limited.");
  }

  let parsed: SaveTheVideoTaskResponse;
  try {
    parsed = (await response.json()) as SaveTheVideoTaskResponse;
  } catch {
    throw new Error("Invalid response from source.");
  }

  return parsed;
}

async function pollSaveTheVideoTask(hrefOrId: string) {
  const taskPath = hrefOrId.startsWith("/")
    ? hrefOrId
    : hrefOrId.startsWith("http")
      ? new URL(hrefOrId).pathname
      : `/tasks/${hrefOrId}`;
  const taskUrl = `${SAVETHEVIDEO_BASE_URL}${taskPath}`;

  for (let attempt = 0; attempt < MAX_POLL_RETRY; attempt += 1) {
    await sleep(POLL_DELAY_MS);

    const response = await fetch(taskUrl, {
      method: "GET",
      headers: {
        accept: "application/json",
        origin: "https://www.savethevideo.com",
        referer: "https://www.savethevideo.com/",
        "user-agent": getSaveTheVideoHeaders()["user-agent"],
      },
      cache: "no-store",
    });

    if (response.status === 429) {
      throw new SourceRateLimitError("Source rate limited.");
    }

    if (response.status === 404) {
      continue;
    }

    let data: SaveTheVideoTaskResponse;
    try {
      data = (await response.json()) as SaveTheVideoTaskResponse;
    } catch {
      continue;
    }

    if (data.state === "completed") {
      const firstResult = extractFirstResult(data);
      if (firstResult) {
        return firstResult;
      }
      throw new Error("Completed without result.");
    }

    if (data.state === "failed") {
      throw new Error(data.message || "Task failed.");
    }
  }

  throw new Error("Task timeout.");
}

async function extractDailymotionInfo(url: string) {
  const task = await requestSaveTheVideoTask(url);

  if (task.state === "completed") {
    const firstResult = extractFirstResult(task);
    if (firstResult) {
      return firstResult;
    }
    throw new Error("Failed to extract video information.");
  }

  if (task.state === "pending") {
    const ref = task.href || task.id;
    if (!ref) {
      throw new Error("Task reference missing.");
    }
    return pollSaveTheVideoTask(ref);
  }

  throw new Error(task.message || "Failed to extract video information.");
}

function mapFormats(formats: SaveTheVideoFormat[] | undefined) {
  if (!Array.isArray(formats)) {
    return [];
  }

  const seen = new Set<string>();
  const rawMapped: Array<{ url: string; quality: string; resolution: string }> = [];
  const resolutionPattern = /^\d{2,5}x\d{2,5}$/i;
  const extractResolutionFromQuality = (quality: string) => {
    const match = quality.match(/(\d{2,5}x\d{2,5})/i);
    return match ? match[1] : "";
  };

  for (const format of formats) {
    const url = (format.url || "").trim();
    if (!url || seen.has(url)) {
      continue;
    }

    const quality = (format.format || "").trim();
    const rawResolution = (format.resolution || "").trim();
    const parsedResolution = resolutionPattern.test(rawResolution)
      ? rawResolution
      : extractResolutionFromQuality(quality);

    rawMapped.push({
      url,
      quality: quality || "unknown",
      resolution: parsedResolution || "unknown",
    });

    seen.add(url);
  }

  const strict = rawMapped
    .filter((item) => item.quality !== "unknown" && resolutionPattern.test(item.resolution))
    .sort((a, b) => {
      const aHeight = Number.parseInt(a.resolution.split("x")[1], 10);
      const bHeight = Number.parseInt(b.resolution.split("x")[1], 10);
      return aHeight - bHeight;
    });

  return strict.length > 0 ? strict : rawMapped;
}

export async function handleDailymotionDownloadRequest(url: URL) {
  const endpoint = await getApiEndpointStatusBySlug("dailymotion-dl");
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

  const normalizedUrl = normalizeDailymotionUrl(targetUrl);
  if (!normalizedUrl) {
    return errorResponse(400, "Query parameter 'url' must be a valid Dailymotion URL.");
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

  let videoInfo: SaveTheVideoInfoResult;
  try {
    videoInfo = await extractDailymotionInfo(normalizedUrl);
  } catch (error) {
    if (error instanceof SourceRateLimitError) {
      return errorResponse(429, "Source service is rate limited. Please retry in a moment.");
    }
    return errorResponse(502, "Failed to fetch data from source.");
  }

  const formatCandidates: SaveTheVideoFormat[] = [];
  if (Array.isArray(videoInfo.formats)) {
    formatCandidates.push(...videoInfo.formats);
  }
  if (videoInfo.url) {
    formatCandidates.push({
      url: videoInfo.url,
      format: videoInfo.format,
      resolution: videoInfo.resolution,
    });
  }

  const formats = mapFormats(formatCandidates);
  if (formats.length === 0) {
    return errorResponse(404, "No downloadable formats found.");
  }

  const remainingLimit = Math.max(effectiveLimit - usageResult.usedCount, 0);

  return NextResponse.json(
    {
      status: true,
      code: 200,
      creator: CREATOR,
      result: {
        source_url: normalizedUrl,
        title: videoInfo.title || "",
        duration: videoInfo.duration_string || "",
        thumbnail: videoInfo.thumbnail || "",
        formats,
      },
      total_formats: formats.length,
      remaining_limit: remainingLimit,
    },
    { status: 200 },
  );
}

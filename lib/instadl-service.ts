import axios from "axios";
import { NextResponse } from "next/server";

import { getApiEndpointStatusBySlug } from "@/lib/api-endpoints";
import { buildBanInfo, normalizeUserBanState } from "@/lib/ban";
import { prisma } from "@/lib/prisma";

const CREATOR = "JzProject";

const IG_API = {
  base: "https://snapinsta.to",
  endpoint: {
    verify: "/api/userverify",
    download: "/api/ajaxSearch",
  },
};

const IG_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 11; vivo 1901) AppleWebKit/537.36 Chrome/143.0.7499.192 Mobile Safari/537.36",
  "Content-Type": "application/x-www-form-urlencoded",
  Accept: "*/*",
  Origin: "https://snapinsta.to",
  Referer: "https://snapinsta.to/",
  "X-Requested-With": "XMLHttpRequest",
  "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
};

type PhotoResolutionUrl = {
  resolution: string;
  url: string;
};

type InstaResultItem = {
  type: "video" | "photo" | "profile-picture";
  thumbnail: string;
  url: string | PhotoResolutionUrl[];
};

type InstaDownloadResult =
  | {
      success: true;
      count: number;
      results: InstaResultItem[];
    }
  | {
      success: false;
      error: string;
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

function normalizeInstagramUrl(value: string) {
  try {
    const parsed = new URL(value);
    const protocol = parsed.protocol.toLowerCase();
    const hostname = parsed.hostname.toLowerCase();

    if (protocol !== "http:" && protocol !== "https:") {
      return null;
    }

    const isInstagram =
      hostname === "instagram.com" ||
      hostname === "www.instagram.com" ||
      hostname.endsWith(".instagram.com");

    if (!isInstagram) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function toStringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function extractEncryptedPayload(data: string) {
  const patterns = [
    /decodeURIComponent\(r\)\}\("([^"]+)"/,
    /decodeURIComponent\(r\)\}\('([^']+)'/,
    /decodeURIComponent\(r\)\}\(\\"([^\\"]+)\\"/,
  ];

  for (const pattern of patterns) {
    const match = data.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

function decryptPayload(h: string, n = "abcdefghi", e = 2, t = 1) {
  const B = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ+/";
  const toDec = (s: string, b: number) =>
    [...s].reverse().reduce((acc, char, i) => acc + Number.parseInt(char, 10) * b ** i, 0);
  const fromDec = (num: number, base: number) => {
    if (!num) {
      return "0";
    }
    let nValue = num;
    let result = "";
    while (nValue) {
      result = B[nValue % base] + result;
      nValue = (nValue / base) | 0;
    }
    return result;
  };

  let r = "";
  let i = 0;
  while (i < h.length) {
    let s = "";
    while (h[i] !== n[e]) {
      s += h[i++];
      if (i >= h.length) {
        break;
      }
    }
    i++;

    for (let j = 0; j < n.length; j += 1) {
      s = s.split(n[j]).join(String(j));
    }

    const decimal = toDec(s, e);
    const charCode = Number.parseInt(fromDec(decimal, 10), 10) - t;
    r += String.fromCharCode(charCode);
  }

  return decodeURIComponent(r);
}

function extractRealUrl(tokenUrl: string) {
  try {
    const urlObj = new URL(tokenUrl);
    const token = urlObj.searchParams.get("token");
    if (!token) {
      return tokenUrl;
    }

    const parts = token.split(".");
    if (parts.length < 2) {
      return tokenUrl;
    }

    const payload = parts[1];
    const padding = 4 - (payload.length % 4);
    const paddedPayload = padding !== 4 ? payload + "=".repeat(padding) : payload;
    const decoded = JSON.parse(Buffer.from(paddedPayload, "base64").toString("utf-8")) as {
      url?: unknown;
    };

    return typeof decoded.url === "string" && decoded.url.trim() ? decoded.url.trim() : tokenUrl;
  } catch {
    return tokenUrl;
  }
}

function parseResultHtml(html: string): InstaResultItem[] {
  const unescaped = html
    .replace(/\\r/g, "\r")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");

  const output: InstaResultItem[] = [];
  const seen = new Set<string>();
  const itemPattern =
    /<div[^>]*class=["'][^"']*download-items[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*(?:<\/div>)?/gi;
  const items = [...unescaped.matchAll(itemPattern)];

  for (const itemMatch of items) {
    const itemHtml = itemMatch[1];
    const hasVideoIcon = itemHtml.includes("icon-dlvideo");
    const hasImageIcon = itemHtml.includes("icon-dlimage");

    if (!hasVideoIcon && !hasImageIcon) {
      continue;
    }

    const isAvatar = itemHtml.includes('title="Download Avatar"') || itemHtml.includes(">Unduh Avatar<");
    const type: InstaResultItem["type"] = isAvatar ? "profile-picture" : hasVideoIcon ? "video" : "photo";

    const thumbMatch = itemHtml.match(/<img[^>]+src="([^"]+)"[^>]*alt="SnapInsta"/i);
    const thumbnail = thumbMatch ? extractRealUrl(thumbMatch[1]) : "";
    if (!thumbnail) {
      continue;
    }

    if (hasVideoIcon) {
      const dlMatch = itemHtml.match(/<a[^>]+href="([^"]+)"[^>]*class="[^"]*abutton[^"]*"/i);
      const url = dlMatch ? extractRealUrl(dlMatch[1]) : "";
      if (!url) {
        continue;
      }

      if (!seen.has(url)) {
        seen.add(url);
        output.push({
          type,
          thumbnail,
          url,
        });
      }
      continue;
    }

    const photoUrls: PhotoResolutionUrl[] = [];
    const optionPattern = /<option[^>]+value=["']([^"']+)["'][^>]*>([^<]+)<\/option>/gi;
    const options = [...itemHtml.matchAll(optionPattern)];

    if (options.length > 0) {
      for (const option of options) {
        const optionUrl = extractRealUrl(option[1]);
        const resolution = option[2].trim() || "default";
        if (!optionUrl || seen.has(optionUrl)) {
          continue;
        }
        seen.add(optionUrl);
        photoUrls.push({
          resolution,
          url: optionUrl,
        });
      }
    } else {
      const dlMatch = itemHtml.match(/<a[^>]+href=["']([^"']+)["'][^>]*title=["'][^"']*["']/i);
      if (dlMatch) {
        const optionUrl = extractRealUrl(dlMatch[1]);
        if (optionUrl && !seen.has(optionUrl)) {
          seen.add(optionUrl);
          photoUrls.push({
            resolution: "default",
            url: optionUrl,
          });
        }
      }
    }

    if (photoUrls.length > 0) {
      output.push({
        type,
        thumbnail,
        url: photoUrls,
      });
    }
  }

  if (output.length === 0) {
    const anchorPattern = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi;
    const anchors = [...unescaped.matchAll(anchorPattern)];
    for (const anchor of anchors) {
      const href = extractRealUrl(anchor[1]);
      if (!href || seen.has(href)) {
        continue;
      }

      const lowerHref = href.toLowerCase();
      const looksLikeMedia =
        lowerHref.includes(".mp4") ||
        lowerHref.includes(".jpg") ||
        lowerHref.includes(".jpeg") ||
        lowerHref.includes(".png") ||
        lowerHref.includes("cdninstagram.com") ||
        lowerHref.includes("instagram");
      if (!looksLikeMedia) {
        continue;
      }

      seen.add(href);
      output.push({
        type: lowerHref.includes(".mp4") ? "video" : "photo",
        thumbnail: href,
        url: href,
      });
    }
  }

  return output;
}

async function postForm(url: string, data: Record<string, string>) {
  const response = await axios.post(url, new URLSearchParams(data), {
    headers: IG_HEADERS,
    timeout: 45000,
    maxRedirects: 5,
  });
  return response.data as unknown;
}

function readVerifyToken(data: unknown) {
  if (!data || typeof data !== "object") {
    return "";
  }

  const payload = data as Record<string, unknown>;
  const candidates = [payload.token, payload.cftoken, payload.cfToken];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return "";
}

async function downloadInstagram(url: string): Promise<InstaDownloadResult> {
  try {
    const verifyResponse = await postForm(`${IG_API.base}${IG_API.endpoint.verify}`, { url });
    const verifyPayload = verifyResponse as { success?: unknown };
    const verifyToken = readVerifyToken(verifyResponse);
    if (verifyPayload?.success !== true || !verifyToken) {
      return {
        success: false,
        error: `Verify failed: ${JSON.stringify(verifyResponse)}`,
      };
    }

    const requestSearch = async (version: "v1" | "v2") =>
      postForm(`${IG_API.base}${IG_API.endpoint.download}`, {
        q: url,
        t: "media",
        v: version,
        lang: "id",
        cftoken: verifyToken,
      });

    let searchResponse = await requestSearch("v2");
    let searchPayload = searchResponse as { status?: unknown; v?: unknown; data?: unknown };
    if (searchPayload?.status !== "ok") {
      searchResponse = await requestSearch("v1");
      searchPayload = searchResponse as { status?: unknown; v?: unknown; data?: unknown };
    }
    if (searchPayload?.status !== "ok") {
      return {
        success: false,
        error: `Search failed: ${JSON.stringify(searchResponse)}`,
      };
    }

    let html = "";
    if (searchPayload.v === "v1") {
      html = toStringValue(searchPayload.data);
    } else {
      const encrypted = extractEncryptedPayload(toStringValue(searchPayload.data));
      if (!encrypted) {
        const asRawHtml = toStringValue(searchPayload.data);
        if (asRawHtml.includes("download-items")) {
          html = asRawHtml;
        } else {
          return {
            success: false,
            error: "No encrypted data found in v2 response",
          };
        }
      } else {
        html = decryptPayload(encrypted);
      }
    }

    const results = parseResultHtml(html);
    return {
      success: true,
      count: results.length,
      results,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const message = error.response?.data ? JSON.stringify(error.response.data) : error.message;
      return {
        success: false,
        error: message,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error.",
    };
  }
}

function mapSourceErrorMessage(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("enotfound") || normalized.includes("dns")) {
    return errorResponse(503, "Source host unavailable (DNS lookup failed). Please retry later.");
  }
  if (normalized.includes("econnrefused") || normalized.includes("econnreset")) {
    return errorResponse(503, "Source service temporarily unavailable. Please retry later.");
  }
  if (normalized.includes("timeout") || normalized.includes("etimedout") || normalized.includes("econnaborted")) {
    return errorResponse(504, "Source request timeout. Please retry later.");
  }
  if (normalized.includes("no encrypted data") || normalized.includes("verify failed") || normalized.includes("search failed")) {
    const compactMessage = message.length > 240 ? `${message.slice(0, 240)}...` : message;
    return errorResponse(502, `Failed to parse downloader source response. ${compactMessage}`);
  }

  const compactMessage = message.length > 200 ? `${message.slice(0, 200)}...` : message;
  return errorResponse(502, `Failed to fetch data from source. ${compactMessage}`);
}

export async function handleInstaDownloadRequest(url: URL) {
  const endpoint = await getApiEndpointStatusBySlug("insta-dl");
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

  const normalizedUrl = normalizeInstagramUrl(targetUrl);
  if (!normalizedUrl) {
    return errorResponse(400, "Query parameter 'url' must be a valid Instagram URL.");
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

  const sourceResult = await downloadInstagram(normalizedUrl);
  if (!sourceResult.success) {
    return mapSourceErrorMessage(sourceResult.error);
  }

  if (sourceResult.count < 1) {
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
        count: sourceResult.count,
        results: sourceResult.results,
      },
      total_media: sourceResult.count,
      remaining_limit: remainingLimit,
    },
    { status: 200 },
  );
}

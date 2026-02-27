import axios from "axios";
import { NextResponse } from "next/server";

import { getApiEndpointStatusBySlug } from "@/lib/api-endpoints";
import { buildBanInfo, normalizeUserBanState } from "@/lib/ban";
import { prisma } from "@/lib/prisma";

const CREATOR = "JzProject";

const YTDL_API = {
  base: "https://embed.dlsrv.online",
  jina: "https://r.jina.ai/",
  endpoint: {
    info: "/api/info",
    downloadMp4: "/api/download/mp4",
    downloadMp3: "/api/download/mp3",
    full: "/v1/full",
  },
};

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36",
  "Content-Type": "application/json",
  "Accept-Encoding": "gzip, deflate, br, zstd",
} as const;

type RequestMethod = "GET" | "POST";
type MediaType = "video" | "audio";

type DownloadLinkResult = {
  url: string;
  filename: string | null;
  duration: number | null;
};

type YtdlInfo = {
  videoId: string;
  title: string;
  author: string;
  channelId: string;
  duration: number | null;
  thumbnail: string;
};

type YtdlFormat = {
  type: string;
  quality?: string;
  format: string;
  fileSize?: number | null;
  url: string;
  filename: string | null;
  duration: number | null;
};

type YtdlDownloadResponse =
  | {
      success: true;
      results: {
        info: YtdlInfo;
        formats: YtdlFormat[];
      };
    }
  | {
      success: false;
      message: string;
      results: null;
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

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function toRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function normalizeHeaders(customHeaders: Record<string, string | undefined>) {
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries({ ...DEFAULT_HEADERS, ...customHeaders })) {
    if (typeof value === "string" && value.trim() !== "") {
      merged[key] = value;
    }
  }
  return merged;
}

function getErrorNetworkCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") {
      return code;
    }
  }
  return "";
}

function mapSourceError(error: unknown) {
  if (axios.isAxiosError(error)) {
    const statusCode = error.response?.status ?? 0;
    const networkCode = getErrorNetworkCode(error);

    if (networkCode === "ENOTFOUND") {
      return errorResponse(503, "Source host unavailable (DNS lookup failed). Please retry later.");
    }

    if (networkCode === "ECONNREFUSED" || networkCode === "ECONNRESET") {
      return errorResponse(503, "Source service temporarily unavailable. Please retry later.");
    }

    if (networkCode === "ETIMEDOUT" || networkCode === "ECONNABORTED") {
      return errorResponse(504, "Source request timeout. Please retry later.");
    }

    if (statusCode === 429) {
      return errorResponse(429, "Source service is rate limited. Please retry in a moment.");
    }

    if (statusCode === 404) {
      return errorResponse(404, "Video not found.");
    }

    if (statusCode === 400) {
      return errorResponse(400, "Invalid request to source service.");
    }
  }

  return errorResponse(502, "Failed to fetch data from source.");
}

class YtdlClient {
  private extractVideoId(input: string) {
    const trimmed = input.trim();
    if (!trimmed) {
      return null;
    }

    const directIdMatch = trimmed.match(/^[0-9A-Za-z_-]{11}$/);
    if (directIdMatch) {
      return directIdMatch[0];
    }

    try {
      const parsed = new URL(trimmed);
      const hostname = parsed.hostname.toLowerCase();

      if (hostname === "youtu.be" || hostname.endsWith(".youtu.be")) {
        const candidate = parsed.pathname.split("/").filter(Boolean)[0];
        if (candidate?.match(/^[0-9A-Za-z_-]{11}$/)) {
          return candidate;
        }
      }

      if (
        hostname === "youtube.com" ||
        hostname === "www.youtube.com" ||
        hostname === "m.youtube.com" ||
        hostname === "music.youtube.com" ||
        hostname.endsWith(".youtube.com")
      ) {
        const v = parsed.searchParams.get("v");
        if (v?.match(/^[0-9A-Za-z_-]{11}$/)) {
          return v;
        }

        const pathSegments = parsed.pathname.split("/").filter(Boolean);
        const lastSegment = pathSegments[pathSegments.length - 1] || "";
        if (lastSegment.match(/^[0-9A-Za-z_-]{11}$/)) {
          return lastSegment;
        }
      }
    } catch {
      // ignore URL parse failure, regex fallback below will handle it
    }

    const fallbackMatch = trimmed.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/);
    return fallbackMatch ? fallbackMatch[1] : null;
  }

  private async request(
    method: RequestMethod,
    url: string,
    data?: unknown,
    customHeaders: Record<string, string | undefined> = {},
  ) {
    const response = await axios({
      method,
      url,
      data,
      headers: normalizeHeaders(customHeaders),
      timeout: 45000,
    });
    return response.data as unknown;
  }

  private async getDownloadUrl(
    videoId: string,
    type: MediaType,
    format: string,
    quality: string,
  ): Promise<DownloadLinkResult | null> {
    const endpoint =
      type === "video"
        ? `${YTDL_API.base}${YTDL_API.endpoint.downloadMp4}`
        : `${YTDL_API.base}${YTDL_API.endpoint.downloadMp3}`;

    const data = await this.request("POST", endpoint, {
      videoId,
      format,
      quality,
    });

    const payload = toRecord(data);
    if (!payload || readString(payload.status) !== "tunnel") {
      return null;
    }

    const url = readString(payload.url);
    if (!url) {
      return null;
    }

    return {
      url,
      filename: readString(payload.filename) || null,
      duration: readNumber(payload.duration),
    };
  }

  private async getMp3Formats(videoId: string): Promise<YtdlFormat[]> {
    try {
      const url = `${YTDL_API.jina}${YTDL_API.base}${YTDL_API.endpoint.full}?videoId=${encodeURIComponent(videoId)}`;
      const pageData = await this.request("GET", url, undefined, { "Content-Type": undefined });
      const text = typeof pageData === "string" ? pageData : "";
      const rows = text.match(/\|\s*(\d+kbps)\s*\|\s*mp3\s*\|[^|]+\|/gi) || [];

      const mapped = await Promise.all(
        rows.map(async (row) => {
          const quality = row.match(/(\d+kbps)/i)?.[1];
          if (!quality) {
            return null;
          }

          const link = await this.getDownloadUrl(videoId, "audio", "mp3", quality.replace(/kbps/gi, ""));
          if (!link) {
            return null;
          }

          return {
            type: "audio",
            quality,
            format: "mp3",
            fileSize: null,
            ...link,
          } satisfies YtdlFormat;
        }),
      );

      const filtered = mapped.filter((item): item is NonNullable<typeof item> => Boolean(item));
      return filtered;
    } catch {
      return [];
    }
  }

  async download(input: string): Promise<YtdlDownloadResponse> {
    const videoId = this.extractVideoId(input);
    if (!videoId) {
      return {
        success: false,
        message: "Invalid YouTube URL",
        results: null,
      };
    }

    const infoData = await this.request("POST", `${YTDL_API.base}${YTDL_API.endpoint.info}`, { videoId });
    const infoRoot = toRecord(infoData);
    const infoStatus = readString(infoRoot?.status);
    const infoNode = toRecord(infoRoot?.info);
    if (!infoRoot || infoStatus !== "info" || !infoNode) {
      return {
        success: false,
        message: "Failed to fetch info",
        results: null,
      };
    }

    const rawFormats = Array.isArray(infoNode.formats) ? infoNode.formats : [];

    const videoFormatsPromise = rawFormats
      .map((item) => toRecord(item))
      .filter((item): item is Record<string, unknown> => Boolean(item))
      .filter((item) => readString(item.type).toLowerCase() === "video")
      .map(async (formatItem) => {
        const format = readString(formatItem.format);
        const qualityRaw = readString(formatItem.quality);
        if (!format || !qualityRaw) {
          return null;
        }

        const quality = qualityRaw.replace(/[^\d]/g, "");
        const link = await this.getDownloadUrl(videoId, "video", format, quality);
        if (!link) {
          return null;
        }

        return {
          type: readString(formatItem.type) || "video",
          quality: qualityRaw,
          format,
          fileSize: readNumber(formatItem.fileSize ?? formatItem.filesize),
          ...link,
        } satisfies YtdlFormat;
      });

    const audioFormatsPromise = rawFormats
      .map((item) => toRecord(item))
      .filter((item): item is Record<string, unknown> => Boolean(item))
      .filter((item) => {
        const type = readString(item.type).toLowerCase();
        const format = readString(item.format).toLowerCase();
        return type === "audio" && format !== "mp3";
      })
      .map(async (formatItem) => {
        const format = readString(formatItem.format);
        if (!format) {
          return null;
        }

        const link = await this.getDownloadUrl(videoId, "audio", format, "");
        if (!link) {
          return null;
        }

        const quality = readString(formatItem.quality);
        return {
          type: readString(formatItem.type) || "audio",
          quality: quality || undefined,
          format,
          fileSize: readNumber(formatItem.fileSize ?? formatItem.filesize),
          ...link,
        } satisfies YtdlFormat;
      });

    const [videoFormats, audioFormats, mp3Formats] = await Promise.all([
      Promise.all(videoFormatsPromise),
      Promise.all(audioFormatsPromise),
      this.getMp3Formats(videoId),
    ]);

    const formats = [...videoFormats, ...audioFormats, ...mp3Formats].filter(
      (item): item is YtdlFormat => Boolean(item),
    );

    const info: YtdlInfo = {
      videoId,
      title: readString(infoNode.title),
      author: readString(infoNode.author),
      channelId: readString(infoNode.channelId),
      duration: readNumber(infoNode.duration),
      thumbnail: readString(infoNode.thumbnail),
    };

    return {
      success: true,
      results: {
        info,
        formats,
      },
    };
  }
}

async function checkEndpointAvailability(slug: string) {
  const endpoint = await getApiEndpointStatusBySlug(slug);

  if (endpoint?.status === "NON_ACTIVE") {
    return errorResponse(503, "Endpoint is currently non-active.");
  }

  if (endpoint?.status === "MAINTENANCE") {
    return errorResponse(503, "Endpoint is under maintenance.");
  }

  return null;
}

async function authorizeAndConsume(apiKeyValue: string) {
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
    return { error: errorResponse(401, "Invalid API key.") } as const;
  }

  if (apiKey.status !== "ACTIVE") {
    return { error: errorResponse(403, "API key is not active.") } as const;
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

    return { error: errorResponse(403, banInfo.message || "User account is blocked.") } as const;
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
    return { error: errorResponse(429, "Daily limit reached.") } as const;
  }

  return {
    effectiveLimit,
    usedCount: usageResult.usedCount,
  } as const;
}

export async function handleYoutubeDownloadRequest(url: URL) {
  const endpointError = await checkEndpointAvailability("youtube-dl");
  if (endpointError) {
    return endpointError;
  }

  const input = (url.searchParams.get("url") || url.searchParams.get("id") || "").trim();
  const apiKeyValue = (url.searchParams.get("apikey") || "").trim();

  if (!input) {
    return errorResponse(400, "Query parameter 'url' or 'id' is required.");
  }

  if (!apiKeyValue) {
    return errorResponse(400, "Query parameter 'apikey' is required.");
  }

  const accessResult = await authorizeAndConsume(apiKeyValue);
  if ("error" in accessResult) {
    return accessResult.error;
  }

  const client = new YtdlClient();
  let payload: YtdlDownloadResponse;

  try {
    payload = await client.download(input);
  } catch (error) {
    return mapSourceError(error);
  }

  if (!payload.success || !payload.results) {
    const message = payload.message || "Failed to process YouTube request.";
    const statusCode = message.toLowerCase().includes("invalid youtube") ? 400 : 502;
    return errorResponse(statusCode, message);
  }

  const remainingLimit = Math.max(accessResult.effectiveLimit - accessResult.usedCount, 0);

  return NextResponse.json(
    {
      status: true,
      code: 200,
      creator: CREATOR,
      result: {
        source_input: input,
        video_id: payload.results.info.videoId,
        info: payload.results.info,
        formats: payload.results.formats,
      },
      total_formats: payload.results.formats.length,
      remaining_limit: remainingLimit,
    },
    { status: 200 },
  );
}

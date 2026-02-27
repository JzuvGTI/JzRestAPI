import axios from "axios";
import { NextResponse } from "next/server";

import { getApiEndpointStatusBySlug } from "@/lib/api-endpoints";
import { buildBanInfo, normalizeUserBanState } from "@/lib/ban";
import { prisma } from "@/lib/prisma";

const CREATOR = "JzProject";
const SPOTIDOWNLOADER_ORIGIN = "https://spotidownloader.com";
const SPOTIDOWNLOADER_API_BASE = "https://api.spotidownloader.com";
const TURNSTILE_PAGE = `${SPOTIDOWNLOADER_ORIGIN}/en13`;
const TURNSTILE_SITE_KEY = "0x4AAAAAAA8QAiFfE5GuBRRS";

class MissingDependencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MissingDependencyError";
  }
}

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

function randomUserAgent() {
  const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    "Mozilla/5.0 (X11; Linux x86_64)",
    "Mozilla/5.0 (Android 13; Mobile)",
  ];

  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

function baseHeaders(extra: Record<string, string> = {}) {
  return {
    "user-agent": randomUserAgent(),
    "content-type": "application/json",
    origin: SPOTIDOWNLOADER_ORIGIN,
    referer: `${SPOTIDOWNLOADER_ORIGIN}/`,
    ...extra,
  };
}

function getZencfClient() {
  try {
    const zencfModule = require("zencf") as {
      zencf?: {
        turnstileMin?: (url: string, siteKey: string) => Promise<{ token?: string }>;
      };
    };

    if (!zencfModule?.zencf?.turnstileMin) {
      throw new MissingDependencyError("Package 'zencf' is missing or invalid.");
    }

    return zencfModule.zencf as {
      turnstileMin: (url: string, siteKey: string) => Promise<{ token?: string }>;
    };
  } catch {
    throw new MissingDependencyError("Package 'zencf' is not installed. Run: npm i zencf");
  }
}

async function getSpotifyBearerToken() {
  const zencfClient = getZencfClient();
  const turnstileResult = await zencfClient.turnstileMin(TURNSTILE_PAGE, TURNSTILE_SITE_KEY);
  const turnstileToken = (turnstileResult?.token || "").trim();

  if (!turnstileToken) {
    throw new Error("Failed to solve turnstile token.");
  }

  const response = await axios.post(
    `${SPOTIDOWNLOADER_API_BASE}/session`,
    { token: turnstileToken },
    {
      headers: baseHeaders(),
      timeout: 30000,
    },
  );

  const bearer = response.data?.token;
  if (typeof bearer !== "string" || !bearer.trim()) {
    throw new Error("Invalid bearer token response.");
  }

  return bearer.trim();
}

async function searchSpotify(query: string, bearer: string) {
  const response = await axios.post(
    `${SPOTIDOWNLOADER_API_BASE}/search`,
    { query },
    {
      headers: baseHeaders({
        authorization: `Bearer ${bearer}`,
      }),
      timeout: 30000,
    },
  );

  return response.data as Record<string, unknown>;
}

async function downloadSpotify(trackId: string, bearer: string) {
  const response = await axios.post(
    `${SPOTIDOWNLOADER_API_BASE}/download`,
    { id: trackId },
    {
      headers: baseHeaders({
        authorization: `Bearer ${bearer}`,
      }),
      timeout: 30000,
    },
  );

  return response.data as Record<string, unknown>;
}

function normalizeSpotifyTrackId(input: string) {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const directIdMatch = trimmed.match(/^[A-Za-z0-9]{22}$/);
  if (directIdMatch) {
    return directIdMatch[0];
  }

  const urlMatch = trimmed.match(/spotify\.com\/(?:intl-[^/]+\/)?track\/([A-Za-z0-9]{22})/i);
  if (urlMatch) {
    return urlMatch[1];
  }

  return null;
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

function parseBoolean(value: string | null) {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function pickSearchResultArray(payload: Record<string, unknown>) {
  const asAny = payload as {
    result?: {
      tracks?: unknown[];
      items?: unknown[];
      songs?: unknown[];
      results?: unknown[];
      data?: unknown[];
    };
    tracks?: unknown[];
    items?: unknown[];
    songs?: unknown[];
    results?: unknown[];
    data?: unknown[];
  };

  const candidates = [
    asAny.result?.tracks,
    asAny.result?.items,
    asAny.result?.songs,
    asAny.result?.results,
    asAny.result?.data,
    asAny.tracks,
    asAny.items,
    asAny.songs,
    asAny.results,
    asAny.data,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return null;
}

function applySearchLimit(payload: Record<string, unknown>, limit: number) {
  const candidate = pickSearchResultArray(payload);
  if (candidate) {
    candidate.splice(limit);
  }
  return payload;
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

function pickFirstString(values: unknown[]) {
  for (const value of values) {
    const parsed = readString(value);
    if (parsed) {
      return parsed;
    }
  }
  return "";
}

function toSpotifyTrackUrl(urlOrUri: string, trackId: string) {
  const trimmed = urlOrUri.trim();
  if (!trimmed) {
    return `https://open.spotify.com/track/${trackId}`;
  }

  if (/^spotify:track:/i.test(trimmed)) {
    const idFromUri = trimmed.split(":").pop() || trackId;
    return `https://open.spotify.com/track/${idFromUri}`;
  }

  return trimmed;
}

function extractArtistNames(raw: Record<string, unknown>) {
  const candidates = [raw.artists, raw.artist, raw.artist_name, raw.artistName];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      const names = candidate
        .map((item) => {
          if (typeof item === "string") {
            return item.trim();
          }
          if (item && typeof item === "object" && "name" in item) {
            const name = (item as { name?: unknown }).name;
            return typeof name === "string" ? name.trim() : "";
          }
          return "";
        })
        .filter(Boolean);
      if (names.length > 0) {
        return names;
      }
    }

    if (typeof candidate === "string" && candidate.trim()) {
      return [candidate.trim()];
    }
  }

  return [] as string[];
}

function extractImageUrl(raw: Record<string, unknown>) {
  const direct = pickFirstString([raw.image, raw.cover, raw.thumbnail, raw.photo, raw.pic]);
  if (direct) {
    return direct;
  }

  const album = raw.album;
  if (album && typeof album === "object") {
    const albumObject = album as { images?: unknown[]; image?: unknown; cover?: unknown };
    const albumDirect = pickFirstString([albumObject.image, albumObject.cover]);
    if (albumDirect) {
      return albumDirect;
    }

    if (Array.isArray(albumObject.images)) {
      for (const entry of albumObject.images) {
        if (entry && typeof entry === "object" && "url" in entry) {
          const url = readString((entry as { url?: unknown }).url);
          if (url) {
            return url;
          }
        }
      }
    }
  }

  return "";
}

function normalizeSearchTrackItem(
  item: unknown,
  requestUrl: URL,
  apiKeyValue: string,
) {
  if (!item || typeof item !== "object") {
    return null;
  }

  const raw = item as Record<string, unknown>;
  const idCandidate = pickFirstString([raw.id, raw.trackId, raw.track_id, raw.spotifyId, raw.spotify_id]);
  const urlCandidate = pickFirstString([
    raw.url,
    raw.track_url,
    raw.trackUrl,
    raw.uri,
    (raw as { external_urls?: { spotify?: unknown } }).external_urls?.spotify,
  ]);

  const normalizedTrackId = idCandidate || normalizeSpotifyTrackId(urlCandidate || "") || "";
  if (!normalizedTrackId) {
    return null;
  }

  const trackUrl = toSpotifyTrackUrl(urlCandidate, normalizedTrackId);
  const title = pickFirstString([raw.title, raw.name, raw.track, raw.track_name]) || `Spotify Track ${normalizedTrackId}`;
  const artists = extractArtistNames(raw);
  const album = (() => {
    const direct = pickFirstString([raw.album_name, raw.albumName]);
    if (direct) {
      return direct;
    }

    const albumValue = raw.album;
    if (albumValue && typeof albumValue === "object") {
      return pickFirstString([
        (albumValue as { name?: unknown }).name,
        (albumValue as { title?: unknown }).title,
      ]);
    }

    return "";
  })();
  const durationMs = readNumber(raw.duration_ms ?? raw.durationMs ?? raw.duration) ?? undefined;
  const image = extractImageUrl(raw) || undefined;
  const endpointBase = `${requestUrl.origin}/api/spotifydl`;
  const downloadEndpoint = `${endpointBase}?id=${encodeURIComponent(normalizedTrackId)}&apikey=${encodeURIComponent(apiKeyValue)}`;
  const streamEndpoint = `${downloadEndpoint}&stream=true`;

  return {
    id: normalizedTrackId,
    title,
    artists,
    album: album || undefined,
    duration_ms: durationMs,
    image,
    track_url: trackUrl,
    download_endpoint: downloadEndpoint,
    download_stream_endpoint: streamEndpoint,
  };
}

function normalizeSearchTrackList(
  payload: Record<string, unknown>,
  requestUrl: URL,
  apiKeyValue: string,
) {
  const list = pickSearchResultArray(payload);
  if (!list) {
    return [] as Array<ReturnType<typeof normalizeSearchTrackItem>>;
  }

  return list
    .map((item) => normalizeSearchTrackItem(item, requestUrl, apiKeyValue))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function extractDownloadUrl(payload: Record<string, unknown>) {
  const directLink = payload.link;
  if (typeof directLink === "string" && directLink.trim()) {
    return directLink.trim();
  }

  const nested = payload.data;
  if (nested && typeof nested === "object" && "link" in nested) {
    const nestedLink = (nested as { link?: unknown }).link;
    if (typeof nestedLink === "string" && nestedLink.trim()) {
      return nestedLink.trim();
    }
  }

  return "";
}

function mapSourceError(error: unknown) {
  if (error instanceof MissingDependencyError) {
    return errorResponse(503, error.message);
  }

  if (axios.isAxiosError(error)) {
    const statusCode = error.response?.status ?? 0;
    const networkCode = error.code || "";

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

    if (statusCode === 401 || statusCode === 403) {
      return errorResponse(502, "Source authorization failed.");
    }

    if (statusCode === 404) {
      return errorResponse(404, "Data not found on source.");
    }
  }

  return errorResponse(502, "Failed to fetch data from source.");
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

export async function handleSpotifySearchRequest(url: URL) {
  const endpointError = await checkEndpointAvailability("spotify-search");
  if (endpointError) {
    return endpointError;
  }

  const query = (url.searchParams.get("query") || url.searchParams.get("keyword") || "").trim();
  const limit = parseLimit(url.searchParams.get("limit"));
  const apiKeyValue = (url.searchParams.get("apikey") || "").trim();

  if (!query) {
    return errorResponse(400, "Query parameter 'query' is required.");
  }

  if (query.length < 2) {
    return errorResponse(400, "Query parameter 'query' must be at least 2 characters.");
  }

  if (!limit) {
    return errorResponse(400, "Query parameter 'limit' must be a positive integer.");
  }

  if (!apiKeyValue) {
    return errorResponse(400, "Query parameter 'apikey' is required.");
  }

  const accessResult = await authorizeAndConsume(apiKeyValue);
  if ("error" in accessResult) {
    return accessResult.error;
  }

  let payload: Record<string, unknown>;

  try {
    const bearerToken = await getSpotifyBearerToken();
    const sourcePayload = await searchSpotify(query, bearerToken);
    payload = applySearchLimit(sourcePayload, limit);
  } catch (error) {
    return mapSourceError(error);
  }

  const resultArray = pickSearchResultArray(payload);
  const totalResults = resultArray?.length ?? 0;
  const normalizedTracks = normalizeSearchTrackList(payload, url, apiKeyValue);
  const remainingLimit = Math.max(accessResult.effectiveLimit - accessResult.usedCount, 0);

  return NextResponse.json(
    {
      status: true,
      code: 200,
      creator: CREATOR,
      query,
      limit,
      total_results: totalResults,
      tracks: normalizedTracks,
      result: payload,
      remaining_limit: remainingLimit,
    },
    { status: 200 },
  );
}

export async function handleSpotifyDownloadRequest(url: URL) {
  const endpointError = await checkEndpointAvailability("spotify-dl");
  if (endpointError) {
    return endpointError;
  }

  const input = (url.searchParams.get("url") || url.searchParams.get("id") || url.searchParams.get("input") || "").trim();
  const shouldStream = parseBoolean(url.searchParams.get("stream"));
  const apiKeyValue = (url.searchParams.get("apikey") || "").trim();

  if (!input) {
    return errorResponse(400, "Query parameter 'url' or 'id' is required.");
  }

  const trackId = normalizeSpotifyTrackId(input);
  if (!trackId) {
    return errorResponse(400, "Input must be a valid Spotify track URL or 22-char track ID.");
  }

  if (!apiKeyValue) {
    return errorResponse(400, "Query parameter 'apikey' is required.");
  }

  const accessResult = await authorizeAndConsume(apiKeyValue);
  if ("error" in accessResult) {
    return accessResult.error;
  }

  let payload: Record<string, unknown>;

  try {
    const bearerToken = await getSpotifyBearerToken();
    payload = await downloadSpotify(trackId, bearerToken);
  } catch (error) {
    return mapSourceError(error);
  }

  const downloadUrl = extractDownloadUrl(payload);
  if (!downloadUrl) {
    return errorResponse(404, "No downloadable audio found.");
  }

  const remainingLimit = Math.max(accessResult.effectiveLimit - accessResult.usedCount, 0);

  if (shouldStream) {
    try {
      const audioResponse = await axios.get<ArrayBuffer>(downloadUrl, {
        responseType: "arraybuffer",
        timeout: 60000,
      });

      const contentTypeHeader = audioResponse.headers["content-type"];
      const contentType = typeof contentTypeHeader === "string" ? contentTypeHeader : "audio/mpeg";

      return new NextResponse(audioResponse.data, {
        status: 200,
        headers: {
          "content-type": contentType,
          "content-disposition": `attachment; filename="spotify-${trackId}.mp3"`,
          "x-remaining-limit": String(remainingLimit),
        },
      });
    } catch (error) {
      return mapSourceError(error);
    }
  }

  return NextResponse.json(
    {
      status: true,
      code: 200,
      creator: CREATOR,
      result: {
        input,
        track_id: trackId,
        download_url: downloadUrl,
        download: payload,
      },
      remaining_limit: remainingLimit,
    },
    { status: 200 },
  );
}

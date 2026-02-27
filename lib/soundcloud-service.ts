import axios from "axios";
import { load } from "cheerio";
import { NextResponse } from "next/server";

import { getApiEndpointStatusBySlug } from "@/lib/api-endpoints";
import { buildBanInfo, normalizeUserBanState } from "@/lib/ban";
import { prisma } from "@/lib/prisma";

const CREATOR = "JzProject";
const DOWNCLOUD_BASE = "https://downcloudme.com";
const DOWNCLOUD_ENDPOINT = `${DOWNCLOUD_BASE}/download`;

type SoundCloudTrack = {
  title: string;
  image: string;
  duration: string;
  likes: string;
  download_url: string;
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

function getNormalizedSoundCloudUrl(value: string) {
  try {
    const parsed = new URL(value);
    const protocol = parsed.protocol.toLowerCase();
    const hostname = parsed.hostname.toLowerCase();

    if (protocol !== "http:" && protocol !== "https:") {
      return null;
    }

    if (hostname === "soundcloud.com" || hostname.endsWith(".soundcloud.com") || hostname === "on.soundcloud.com") {
      // Strip tracking query/hash so downloader gets canonical track/playlist URL.
      parsed.search = "";
      parsed.hash = "";
      return parsed.toString();
    }

    return null;
  } catch {
    return null;
  }
}

function parsePlaylistLikeTracks(html: string) {
  const $ = load(html);
  const tracks: SoundCloudTrack[] = [];

  $(".custom-track-container").each((_, element) => {
    const title = $(element).find(".custom-track-title").text().trim();
    const image = $(element).find(".custom-track-image").attr("src")?.trim() || "";
    const detailsText = $(element).find(".custom-track-details").text();
    const durationMatch = detailsText.match(/Duration:\s*([^\n\r]+)/i);
    const likesMatch = detailsText.match(/Likes:\s*([^\n\r]+)/i);
    const duration = durationMatch ? durationMatch[1].trim() : "";
    const likes = likesMatch ? likesMatch[1].trim() : "";
    const href = $(element).find(".custom-download-btn").attr("href")?.trim() || "";

    if (!href) {
      return;
    }

    tracks.push({
      title,
      image,
      duration,
      likes,
      download_url: href.startsWith("http") ? href : `${DOWNCLOUD_BASE}${href}`,
    });
  });

  return tracks;
}

function parseSingleTrackFallback(html: string) {
  const $ = load(html);
  const directUrl = $("#fastDownloadBtn").attr("data-direct")?.trim() || "";
  if (!directUrl) {
    return [];
  }

  const filename = $("#fastDownloadBtn").attr("data-filename")?.trim() || "";
  const headingTitle = $("h3").first().text().trim();
  const derivedTitle = filename
    .replace(/-\d+\.mp3$/i, "")
    .replace(/\.mp3$/i, "")
    .trim();
  const title = headingTitle || derivedTitle || "SoundCloud Track";
  const image = $("img[src*='sndcdn.com']").first().attr("src")?.trim() || "";

  return [
    {
      title,
      image,
      duration: "",
      likes: "",
      download_url: directUrl,
    },
  ] satisfies SoundCloudTrack[];
}

async function scrapeSoundCloudDownloadLinks(soundCloudUrl: string) {
  const headers = {
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.9",
    origin: DOWNCLOUD_BASE,
    referer: `${DOWNCLOUD_BASE}/soundcloud-playlist-downloader/`,
    "user-agent": "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:147.0) Gecko/20100101 Firefox/147.0",
    "content-type": "application/x-www-form-urlencoded",
  };

  const params = new URLSearchParams();
  params.append("url", soundCloudUrl);

  const response = await axios.post<string>(DOWNCLOUD_ENDPOINT, params.toString(), {
    headers,
    timeout: 30000,
    maxRedirects: 5,
  });

  const html = response.data;
  const playlistTracks = parsePlaylistLikeTracks(html);
  if (playlistTracks.length > 0) {
    return playlistTracks;
  }

  return parseSingleTrackFallback(html);
}

export async function handleSoundCloudDownloadRequest(url: URL) {
  const endpoint = await getApiEndpointStatusBySlug("soundcloud-dl");
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

  const normalizedUrl = getNormalizedSoundCloudUrl(targetUrl);
  if (!normalizedUrl) {
    return errorResponse(400, "Query parameter 'url' must be a valid SoundCloud URL.");
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

  let tracks: SoundCloudTrack[] = [];

  try {
    tracks = await scrapeSoundCloudDownloadLinks(normalizedUrl);
  } catch {
    return errorResponse(502, "Failed to fetch data from source.");
  }

  if (tracks.length === 0) {
    return errorResponse(404, "No downloadable tracks found.");
  }

  const remainingLimit = Math.max(effectiveLimit - usageResult.usedCount, 0);

  return NextResponse.json(
    {
      status: true,
      code: 200,
      creator: CREATOR,
      result: tracks,
      total_tracks: tracks.length,
      remaining_limit: remainingLimit,
    },
    { status: 200 },
  );
}

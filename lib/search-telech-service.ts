import axios from "axios";
import { load } from "cheerio";
import { NextResponse } from "next/server";

import { getApiEndpointStatusBySlug } from "@/lib/api-endpoints";
import { buildBanInfo, normalizeUserBanState } from "@/lib/ban";
import { prisma } from "@/lib/prisma";

const CREATOR = "JzProject";
const TGRAMSEARCH_BASE_URL = "https://en.tgramsearch.com";
const TGRAMSEARCH_SEARCH_URL = `${TGRAMSEARCH_BASE_URL}/search`;
const REQUEST_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9,id;q=0.8",
};

type TelegramChannel = {
  name: string;
  link: string;
  image: string | null;
  members: string;
  description: string;
  category: string;
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

function parseLimit(value: string | null) {
  if (!value) {
    return 10;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.min(parsed, 30);
}

function toAbsoluteUrl(value: string | undefined | null) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }

  if (trimmed.startsWith("/")) {
    return `${TGRAMSEARCH_BASE_URL}${trimmed}`;
  }

  return trimmed;
}

function extractUsernameFromResolveUrl(resolveUrl: string) {
  if (!resolveUrl.startsWith("tg://resolve?")) {
    return null;
  }

  const queryPart = resolveUrl.slice("tg://resolve?".length);
  const params = new URLSearchParams(queryPart);
  const username = (params.get("domain") || "").trim();
  return username || null;
}

async function getRealTelegramLink(joinUrl: string) {
  try {
    const response = await axios.get(joinUrl, {
      timeout: 20000,
      headers: REQUEST_HEADERS,
    });
    const $ = load(response.data);
    const resolveUrl = ($('a[href^="tg://resolve?domain="]').attr("href") || "").trim();
    const username = extractUsernameFromResolveUrl(resolveUrl);
    if (username) {
      return `https://t.me/${username}`;
    }
  } catch {
    return joinUrl;
  }

  return joinUrl;
}

async function normalizeTelegramLink(rawLink: string | undefined) {
  const value = (rawLink || "").trim();
  if (!value) {
    return "";
  }

  if (value.startsWith("/join/")) {
    return getRealTelegramLink(`${TGRAMSEARCH_BASE_URL}${value}`);
  }

  if (value.startsWith("tg://resolve?domain=")) {
    const username = extractUsernameFromResolveUrl(value);
    return username ? `https://t.me/${username}` : value;
  }

  if (value.startsWith("/")) {
    return `${TGRAMSEARCH_BASE_URL}${value}`;
  }

  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }

  return value.startsWith("@") ? `https://t.me/${value.slice(1)}` : value;
}

async function searchTelegramChannels(query: string, limit: number): Promise<TelegramChannel[]> {
  const response = await axios.get(TGRAMSEARCH_SEARCH_URL, {
    timeout: 30000,
    params: { query },
    headers: REQUEST_HEADERS,
  });

  const $ = load(response.data);
  const wrappers = $(".tg-channel-wrapper").toArray().slice(0, limit);

  const channels = await Promise.all(
    wrappers.map(async (el) => {
      const name = $(el).find(".tg-channel-link a").first().text().trim();
      const rawLink = $(el).find(".tg-channel-link a").first().attr("href");
      const image = toAbsoluteUrl($(el).find(".tg-channel-img img").first().attr("src"));
      const members = $(el).find(".tg-user-count").first().text().trim();
      const description = $(el).find(".tg-channel-description").first().text().trim();
      const category = $(el).find(".tg-channel-categories a").first().text().trim();
      const link = await normalizeTelegramLink(rawLink);

      return {
        name: name || "-",
        link,
        image,
        members: members || "-",
        description: description || "-",
        category: category || "-",
      } satisfies TelegramChannel;
    }),
  );

  return channels.filter((item) => item.link.length > 0);
}

function mapSourceError(error: unknown) {
  if (axios.isAxiosError(error)) {
    const statusCode = error.response?.status ?? 0;
    const networkCode = typeof error.code === "string" ? error.code : "";

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
      select: { requestsCount: true },
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
        select: { requestsCount: true },
      });
      return { limited: false, usedCount: updated.requestsCount };
    }

    const created = await tx.usageLog.create({
      data: {
        apiKeyId: apiKey.id,
        date: usageDate,
        requestsCount: 1,
      },
      select: { requestsCount: true },
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

export async function handleSearchTelechRequest(url: URL) {
  const endpointError = await checkEndpointAvailability("search-telech");
  if (endpointError) {
    return endpointError;
  }

  const query = (url.searchParams.get("query") || url.searchParams.get("q") || "").trim();
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

  try {
    const channels = await searchTelegramChannels(query, limit);
    if (channels.length === 0) {
      return errorResponse(404, "No Telegram channel found.");
    }

    const remainingLimit = Math.max(accessResult.effectiveLimit - accessResult.usedCount, 0);

    return NextResponse.json(
      {
        status: true,
        code: 200,
        creator: CREATOR,
        result: {
          query,
          limit,
          total_results: channels.length,
          channels,
        },
        remaining_limit: remainingLimit,
      },
      { status: 200 },
    );
  } catch (error) {
    return mapSourceError(error);
  }
}

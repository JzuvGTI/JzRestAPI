import axios from "axios";
import { NextResponse } from "next/server";

import { getApiEndpointStatusBySlug } from "@/lib/api-endpoints";
import { buildBanInfo, normalizeUserBanState } from "@/lib/ban";
import { prisma } from "@/lib/prisma";

const CREATOR = "JzProject";
const IMEI_CHECK_URL = "https://dash.imei.info/api/check/0/";

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

function sanitizeImei(value: string) {
  return value.replace(/\D/g, "");
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
    if (statusCode === 401 || statusCode === 403) {
      return errorResponse(502, "Source authentication failed.");
    }
    if (statusCode === 404) {
      return errorResponse(404, "IMEI data not found.");
    }
    if (statusCode === 429) {
      return errorResponse(429, "Source service is rate limited. Please retry in a moment.");
    }
  }

  return errorResponse(502, "Failed to fetch data from source.");
}

async function checkImei(imei: string, sourceKey: string) {
  const response = await axios.get(IMEI_CHECK_URL, {
    timeout: 10000,
    params: {
      imei,
      API_KEY: sourceKey,
    },
    headers: {
      Accept: "application/json, text/plain, */*",
      "User-Agent": "Gienetic/1.0.1",
    },
  });

  return response.data;
}

export async function handleInfoImeiRequest(url: URL) {
  const endpointError = await checkEndpointAvailability("info-imei");
  if (endpointError) {
    return endpointError;
  }

  const rawImei = (url.searchParams.get("imei") || "").trim();
  const imei = sanitizeImei(rawImei);
  const apiKeyValue = (url.searchParams.get("apikey") || "").trim();
  const sourceKey = process.env.IMEI_API_KEY?.trim() || "";

  if (!rawImei) {
    return errorResponse(400, "Query parameter 'imei' is required.");
  }
  if (!imei || imei.length < 14 || imei.length > 17) {
    return errorResponse(400, "Query parameter 'imei' must contain 14-17 digits.");
  }
  if (!apiKeyValue) {
    return errorResponse(400, "Query parameter 'apikey' is required.");
  }
  if (!sourceKey) {
    return errorResponse(500, "IMEI source API key is not configured.");
  }

  const accessResult = await authorizeAndConsume(apiKeyValue);
  if ("error" in accessResult) {
    return accessResult.error;
  }

  try {
    const sourceResult = await checkImei(imei, sourceKey);
    const remainingLimit = Math.max(accessResult.effectiveLimit - accessResult.usedCount, 0);

    return NextResponse.json(
      {
        status: true,
        code: 200,
        creator: CREATOR,
        result: {
          imei,
          source: sourceResult,
        },
        remaining_limit: remainingLimit,
      },
      { status: 200 },
    );
  } catch (error) {
    return mapSourceError(error);
  }
}

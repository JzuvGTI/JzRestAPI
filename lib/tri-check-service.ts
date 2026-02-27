import { NextResponse } from "next/server";
import { createHash } from "crypto";

import { getApiEndpointStatusBySlug } from "@/lib/api-endpoints";
import { buildBanInfo, normalizeUserBanState } from "@/lib/ban";
import { prisma } from "@/lib/prisma";

const CREATOR = "JzProject";
const TRI_SIM_STATUS_URL = "https://tri.co.id/api/v1/information/sim-status";

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

function normalizeMsisdn(value: string) {
  return value.replace(/\D/g, "");
}

function toNumericToken(value: string, length: number) {
  const safeLength = Math.max(8, Math.min(length, 24));
  const hashHex = createHash("sha256").update(value).digest("hex");

  let token = "";
  for (const char of hashHex) {
    token += (Number.parseInt(char, 16) % 10).toString();
    if (token.length >= safeLength) {
      break;
    }
  }

  return token.padEnd(safeLength, "0");
}

function anonymizeTriResultData(result: Record<string, unknown>) {
  const sourceData = result.data;
  if (!sourceData || typeof sourceData !== "object" || Array.isArray(sourceData)) {
    return result;
  }

  const nextData = { ...(sourceData as Record<string, unknown>) };

  if (typeof nextData.msisdn === "string" && nextData.msisdn.trim()) {
    nextData.msisdn = toNumericToken(nextData.msisdn.trim(), nextData.msisdn.trim().length);
  }

  if (typeof nextData.iccid === "string" && nextData.iccid.trim()) {
    nextData.iccid = toNumericToken(nextData.iccid.trim(), nextData.iccid.trim().length);
  }

  return {
    ...result,
    data: nextData,
  };
}

async function requestTriSimStatus(msisdn: string) {
  const headers = {
    "Content-Type": "application/json",
    "sec-ch-ua-platform": '"Android"',
    "User-Agent":
      "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36",
    Accept: "application/json, text/plain, */*",
    "sec-ch-ua": '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
    "sec-ch-ua-mobile": "?1",
    Origin: "https://tri.co.id",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Dest": "empty",
    Referer: "https://tri.co.id/",
    "Accept-Language": "id,en-US;q=0.9,en;q=0.8,ar;q=0.7",
  };

  const payload = {
    action: "MSISDN_STATUS_WEB",
    input1: "",
    input2: "",
    language: "ID",
    msisdn,
  };

  const response = await fetch(TRI_SIM_STATUS_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const rawText = await response.text();
  try {
    const parsedJson = JSON.parse(rawText) as Record<string, unknown>;
    return {
      ok: response.ok,
      statusCode: response.status,
      data: parsedJson,
    };
  } catch {
    return {
      ok: false,
      statusCode: 502,
      data: {
        status: false,
        message: "Invalid response from Tri service.",
      } as Record<string, unknown>,
    };
  }
}

export async function handleTriCheckRequest(url: URL) {
  const endpoint = await getApiEndpointStatusBySlug("tri-check");
  if (endpoint?.status === "NON_ACTIVE") {
    return errorResponse(503, "Endpoint is currently non-active.");
  }

  if (endpoint?.status === "MAINTENANCE") {
    return errorResponse(503, "Endpoint is under maintenance.");
  }

  const msisdnParam = (url.searchParams.get("msisdn") || "").trim();
  const apiKeyValue = (url.searchParams.get("apikey") || "").trim();

  if (!msisdnParam) {
    return errorResponse(400, "Query parameter 'msisdn' is required.");
  }

  const normalizedMsisdn = normalizeMsisdn(msisdnParam);
  if (!/^\d{10,16}$/.test(normalizedMsisdn)) {
    return errorResponse(400, "Query parameter 'msisdn' must contain 10-16 digits.");
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

  let triResult: {
    ok: boolean;
    statusCode: number;
    data: Record<string, unknown>;
  };

  try {
    triResult = await requestTriSimStatus(normalizedMsisdn);
  } catch {
    return errorResponse(502, "Failed to fetch data from Tri service.");
  }

  const remainingLimit = Math.max(effectiveLimit - usageResult.usedCount, 0);
  const responseCode = triResult.ok ? 200 : 502;
  const safeTriResult = anonymizeTriResultData(triResult.data);

  return NextResponse.json(
    {
      status: triResult.ok,
      code: responseCode,
      creator: CREATOR,
      tri_status_code: triResult.statusCode,
      result: safeTriResult,
      remaining_limit: remainingLimit,
    },
    { status: responseCode },
  );
}

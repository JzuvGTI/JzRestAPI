import axios from "axios";
import { NextResponse } from "next/server";

import { getApiEndpointStatusBySlug } from "@/lib/api-endpoints";
import { buildBanInfo, normalizeUserBanState } from "@/lib/ban";
import { prisma } from "@/lib/prisma";

const CREATOR = "JzProject";
const JOB_SEARCH_URL = "https://jobsearch-api.cloud.seek.com.au/v5/search";

type JobItem = {
  id: string;
  title: string;
  company: string;
  location: string;
  listing_date: string | null;
  salary: string;
  teaser: string;
  logo: string | null;
  job_url: string;
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

function toRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function toStringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseAmount(value: string | null) {
  if (!value) {
    return 10;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.min(parsed, 25);
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
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

async function searchJobs(pekerjaan: string, kota: string, jumlah: number) {
  const response = await axios.get(JOB_SEARCH_URL, {
    timeout: 30000,
    params: {
      keywords: pekerjaan,
      where: kota,
      sitekey: "ID",
      sourcesystem: "houston",
      pageSize: jumlah,
      page: 1,
      locale: "id-ID",
    },
    headers: {
      "user-agent":
        "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36",
      accept: "application/json",
    },
  });

  const payload = toRecord(response.data);
  const rows = Array.isArray(payload?.data) ? payload.data : [];

  return rows
    .map((row) => toRecord(row))
    .filter((row): row is Record<string, unknown> => Boolean(row))
    .map((row) => {
      const locationNode = Array.isArray(row.locations) ? toRecord(row.locations[0]) : null;
      const brandingNode = toRecord(row.branding);
      const id = toStringValue(row.id);

      return {
        id,
        title: toStringValue(row.title) || "-",
        company: toStringValue(row.companyName) || "-",
        location: toStringValue(locationNode?.label) || "-",
        listing_date: row.listingDate ? formatDate(toStringValue(row.listingDate)) : null,
        salary: toStringValue(row.salaryLabel) || "Tidak dicantumkan",
        teaser: toStringValue(row.teaser) || "-",
        logo: toStringValue(brandingNode?.serpLogoUrl) || null,
        job_url: id ? `https://id.jobstreet.com/job/${id}` : "",
      } satisfies JobItem;
    });
}

export async function handleInfoLokerRequest(url: URL) {
  const endpointError = await checkEndpointAvailability("info-loker");
  if (endpointError) {
    return endpointError;
  }

  const pekerjaan = (url.searchParams.get("pekerjaan") || "").trim();
  const kota = (url.searchParams.get("kota") || "").trim();
  const jumlah = parseAmount(url.searchParams.get("jumlah"));
  const apiKeyValue = (url.searchParams.get("apikey") || "").trim();

  if (!pekerjaan) {
    return errorResponse(400, "Query parameter 'pekerjaan' is required.");
  }
  if (!kota) {
    return errorResponse(400, "Query parameter 'kota' is required.");
  }
  if (!jumlah) {
    return errorResponse(400, "Query parameter 'jumlah' must be a positive integer.");
  }
  if (!apiKeyValue) {
    return errorResponse(400, "Query parameter 'apikey' is required.");
  }

  const accessResult = await authorizeAndConsume(apiKeyValue);
  if ("error" in accessResult) {
    return accessResult.error;
  }

  try {
    const jobs = await searchJobs(pekerjaan, kota, jumlah);
    const remainingLimit = Math.max(accessResult.effectiveLimit - accessResult.usedCount, 0);

    return NextResponse.json(
      {
        status: true,
        code: 200,
        creator: CREATOR,
        result: {
          pekerjaan,
          kota,
          jumlah,
          total_result: jobs.length,
          jobs,
        },
        remaining_limit: remainingLimit,
      },
      { status: 200 },
    );
  } catch (error) {
    return mapSourceError(error);
  }
}

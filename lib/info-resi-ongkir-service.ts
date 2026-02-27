import axios from "axios";
import { NextResponse } from "next/server";

import { getApiEndpointStatusBySlug } from "@/lib/api-endpoints";
import { buildBanInfo, normalizeUserBanState } from "@/lib/ban";
import { prisma } from "@/lib/prisma";

const CREATOR = "JzProject";
const BASE_URL_RESI = "https://loman.id/resapp/";
const BASE_URL_ONGKIR = "https://loeman.loman.id/";

const SOURCE_HEADERS = {
  "user-agent": "Dart/3.6 (dart:io)",
  "accept-encoding": "gzip",
  "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
} as const;

type ActionType = "resi" | "ongkir" | "ekspedisi";

type CityCandidate = {
  id: string;
  nama: string;
  [key: string]: unknown;
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

function toNumberValue(value: unknown) {
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

function parseAction(value: string | null) {
  const normalized = (value || "ekspedisi").trim().toLowerCase();
  if (normalized === "resi") {
    return "resi" as const;
  }
  if (normalized === "ongkir") {
    return "ongkir" as const;
  }
  if (normalized === "ekspedisi") {
    return "ekspedisi" as const;
  }
  return null;
}

function normalizeCourierCode(value: string) {
  return value.trim().toLowerCase();
}

function normalizeWeight(value: string | null) {
  if (!value) {
    return null;
  }
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function parseTrackingPayload(raw: unknown) {
  const payload = toRecord(raw);
  if (!payload) {
    return {
      status: "gagal",
      message: "Respons pelacakan tidak valid.",
    };
  }

  const statusValue = toStringValue(payload.status).toLowerCase();
  if (statusValue !== "berhasil") {
    return {
      status: "gagal",
      message:
        toStringValue(payload.message) ||
        toStringValue(payload.details) ||
        "Resi tidak ditemukan",
    };
  }

  const detailsNode = toRecord(payload.details) || toRecord(payload.infopengiriman) || {};
  const rawHistory =
    (Array.isArray(payload.history) ? payload.history : null) ||
    (Array.isArray(payload.tracking) ? payload.tracking : null) ||
    [];

  const history = rawHistory
    .map((entry) => toRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map((entry) => ({
      tanggal:
        toStringValue(entry.tanggal) ||
        toStringValue(entry.date) ||
        "-",
      details:
        toStringValue(entry.details) ||
        toStringValue(entry.desc) ||
        toStringValue(entry.keterangan) ||
        "-",
    }));

  return {
    status: "berhasil",
    details: {
      status: toStringValue(detailsNode.status) || toStringValue(payload.status) || "-",
      infopengiriman:
        toStringValue(detailsNode.infopengiriman) ||
        toStringValue(payload.infopengiriman) ||
        "Tidak ada info pengiriman",
      ucapan:
        toStringValue(detailsNode.ucapan) ||
        toStringValue(payload.ucapan) ||
        "Selamat paket berhasil dilacak",
    },
    history,
  };
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

async function getExpeditions() {
  const response = await axios.get(`${BASE_URL_RESI}getdropdown.php`, {
    timeout: 30000,
    headers: SOURCE_HEADERS,
  });

  const payload = toRecord(response.data);
  const status = toStringValue(payload?.status).toLowerCase();
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  if (status !== "berhasil") {
    return [];
  }

  return rows
    .map((row) => toRecord(row))
    .filter((row): row is Record<string, unknown> => Boolean(row))
    .map((row) => ({
      title: toStringValue(row.title),
      value: toStringValue(row.value),
    }))
    .filter((row) => row.title || row.value);
}

async function checkTracking(resi: string, ekspedisi: string) {
  const payload = new URLSearchParams({
    resi,
    ex: ekspedisi,
  });

  const response = await axios.post(BASE_URL_RESI, payload.toString(), {
    timeout: 30000,
    headers: {
      ...SOURCE_HEADERS,
      "content-type": "application/x-www-form-urlencoded; charset=utf-8",
    },
  });

  return parseTrackingPayload(response.data);
}

async function searchCities(keyword: string) {
  const response = await axios.get(BASE_URL_ONGKIR, {
    timeout: 30000,
    params: {
      cari: keyword,
    },
    headers: SOURCE_HEADERS,
  });

  const rows = Array.isArray(response.data) ? response.data : [];
  return rows
    .map((row) => toRecord(row))
    .filter((row): row is CityCandidate => Boolean(row?.id) && Boolean(row?.nama));
}

async function findCityWithSuggestion(cityName: string) {
  const keywords = cityName.toLowerCase().split(/\s+/).filter(Boolean);
  const candidates = await Promise.all(keywords.map((keyword) => searchCities(keyword)));
  const merged = Object.values(
    candidates.flat().reduce<Record<string, CityCandidate>>((acc, item) => {
      acc[toStringValue(item.id)] = item;
      return acc;
    }, {}),
  );

  const matched =
    merged.find((item) => {
      const name = toStringValue(item.nama).toLowerCase();
      return keywords.every((keyword) => name.includes(keyword));
    }) || null;

  return {
    id: matched ? toStringValue(matched.id) : null,
    nama: matched ? toStringValue(matched.nama) : cityName,
    saran: matched ? [] : merged.slice(0, 5).map((item) => ({ id: item.id, nama: item.nama })),
  };
}

async function checkShippingCost(asal: string, tujuan: string, beratKg: number) {
  const [originData, destinationData] = await Promise.all([
    findCityWithSuggestion(asal),
    findCityWithSuggestion(tujuan),
  ]);

  if (!originData.id || !destinationData.id) {
    return {
      status: "gagal",
      message: "Lokasi asal/tujuan tidak ditemukan.",
      origin: originData,
      destination: destinationData,
      ongkir: null,
    };
  }

  const response = await axios.post(
    BASE_URL_ONGKIR,
    {
      idAsal: originData.id,
      idTujuan: destinationData.id,
      berat: String(beratKg),
    },
    {
      timeout: 30000,
      headers: {
        ...SOURCE_HEADERS,
        "content-type": "application/json; charset=utf-8",
      },
    },
  );

  const payload = toRecord(response.data) || {};
  return {
    status: "berhasil",
    detail: {
      dari: originData.nama,
      menuju: destinationData.nama,
      berat: `${beratKg} kg`,
      id_asal: originData.id,
      id_tujuan: destinationData.id,
    },
    ongkir: payload,
  };
}

export async function handleInfoResiOngkirRequest(url: URL) {
  const endpointError = await checkEndpointAvailability("info-resi-ongkir");
  if (endpointError) {
    return endpointError;
  }

  const action = parseAction(url.searchParams.get("action"));
  const apiKeyValue = (url.searchParams.get("apikey") || "").trim();

  if (!action) {
    return errorResponse(400, "Query parameter 'action' must be 'resi', 'ongkir', or 'ekspedisi'.");
  }
  if (!apiKeyValue) {
    return errorResponse(400, "Query parameter 'apikey' is required.");
  }

  const accessResult = await authorizeAndConsume(apiKeyValue);
  if ("error" in accessResult) {
    return accessResult.error;
  }

  try {
    const resi = (url.searchParams.get("resi") || "").trim();
    const ekspedisi = normalizeCourierCode(url.searchParams.get("ekspedisi") || "");
    const asal = (url.searchParams.get("asal") || "").trim();
    const tujuan = (url.searchParams.get("tujuan") || "").trim();
    const berat = normalizeWeight(url.searchParams.get("berat"));

    let result: Record<string, unknown>;

    if (action === "ekspedisi") {
      const couriers = await getExpeditions();
      result = {
        action: "ekspedisi",
        total_ekspedisi: couriers.length,
        ekspedisi: couriers,
      };
    } else if (action === "resi") {
      if (!resi || !ekspedisi) {
        return errorResponse(400, "Action 'resi' requires query params 'resi' and 'ekspedisi'.");
      }

      const tracking = await checkTracking(resi, ekspedisi);
      result = {
        action: "resi",
        resi,
        ekspedisi,
        tracking,
      };
    } else {
      if (!asal || !tujuan || !berat) {
        return errorResponse(400, "Action 'ongkir' requires query params 'asal', 'tujuan', and 'berat'.");
      }

      const ongkir = await checkShippingCost(asal, tujuan, berat);
      result = {
        action: "ongkir",
        asal,
        tujuan,
        berat_kg: berat,
        ...ongkir,
      };
    }

    const remainingLimit = Math.max(accessResult.effectiveLimit - accessResult.usedCount, 0);

    return NextResponse.json(
      {
        status: true,
        code: 200,
        creator: CREATOR,
        result,
        remaining_limit: remainingLimit,
      },
      { status: 200 },
    );
  } catch (error) {
    return mapSourceError(error);
  }
}

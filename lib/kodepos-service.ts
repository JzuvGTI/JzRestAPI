import { NextResponse } from "next/server";

import { getApiEndpointStatusBySlug } from "@/lib/api-endpoints";
import { buildBanInfo, normalizeUserBanState } from "@/lib/ban";
import { prisma } from "@/lib/prisma";

const CREATOR = "JzProject";
const KODEPOS_BASE_URL = "https://kodepos.co.id/data";
const CACHE_TTL_MS = 10 * 60 * 1000;

type ProvinsiRow = {
  nama: string;
  kode_kemendagri?: string | null;
  zona_waktu?: string | null;
};

type KotaRow = {
  nama: string;
  provinsi_nama: string;
  kode_kemendagri?: string | null;
  lat?: number | string | null;
  lng?: number | string | null;
};

type KecamatanRow = {
  nama: string;
  kota_nama: string;
  kode_kemendagri?: string | null;
  zona_waktu?: string | null;
};

type KelurahanRow = {
  nama: string;
  kode_pos: number | string;
  kecamatan_nama: string;
  kota_nama: string;
  provinsi_nama: string;
  kode_kemendagri?: string | null;
  lat?: number | string | null;
  lng?: number | string | null;
  elevasi?: number | string | null;
};

type KodeposDataset = {
  fetchedAt: number;
  provinsiData: ProvinsiRow[];
  kotaData: KotaRow[];
  kecamatanData: KecamatanRow[];
  kelurahanData: KelurahanRow[];
};

const globalCache = globalThis as unknown as {
  __kodeposDataset?: KodeposDataset;
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

async function fetchKodeposJson<T>(endpoint: string): Promise<T[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(`${KODEPOS_BASE_URL}${endpoint}`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return [];
    }

    const parsed = await response.json();
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed as T[];
  } catch {
    return [];
  }
}

async function loadKodeposDataset() {
  const cached = globalCache.__kodeposDataset;
  const now = Date.now();

  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached;
  }

  const [provinsiData, kotaData, kecamatanData, kelurahanData] = await Promise.all([
    fetchKodeposJson<ProvinsiRow>("/provinsi.json"),
    fetchKodeposJson<KotaRow>("/kota.json"),
    fetchKodeposJson<KecamatanRow>("/kecamatan.json"),
    fetchKodeposJson<KelurahanRow>("/kelurahan.json"),
  ]);

  const dataset: KodeposDataset = {
    fetchedAt: now,
    provinsiData,
    kotaData,
    kecamatanData,
    kelurahanData,
  };

  globalCache.__kodeposDataset = dataset;
  return dataset;
}

function normalizeText(value: string | number | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function mapKodeposSearchResult(
  query: string,
  dataset: KodeposDataset,
) {
  const keyword = normalizeText(query);

  const matches = dataset.kelurahanData.filter((item) => {
    const namaKelurahan = normalizeText(item.nama);
    const kodePos = normalizeText(item.kode_pos);
    const namaKecamatan = normalizeText(item.kecamatan_nama);
    const namaKota = normalizeText(item.kota_nama);
    const namaProvinsi = normalizeText(item.provinsi_nama);

    return (
      namaKelurahan.includes(keyword) ||
      kodePos.includes(keyword) ||
      namaKecamatan.includes(keyword) ||
      namaKota.includes(keyword) ||
      namaProvinsi.includes(keyword)
    );
  });

  const formattedResult = matches.map((kel) => {
    const kecamatan = dataset.kecamatanData.find(
      (item) => item.nama === kel.kecamatan_nama && item.kota_nama === kel.kota_nama,
    );
    const kota = dataset.kotaData.find(
      (item) => item.nama === kel.kota_nama && item.provinsi_nama === kel.provinsi_nama,
    );
    const provinsi = dataset.provinsiData.find((item) => item.nama === kel.provinsi_nama);

    return {
      kodePos: kel.kode_pos,
      detailKelurahan: {
        nama: kel.nama,
        kodeKemendagri: kel.kode_kemendagri || null,
        lat: kel.lat ?? null,
        lng: kel.lng ?? null,
        elevasi: kel.elevasi ?? null,
      },
      detailKecamatan: kecamatan
        ? {
            nama: kecamatan.nama,
            kodeKemendagri: kecamatan.kode_kemendagri || null,
            zonaWaktu: kecamatan.zona_waktu || null,
          }
        : null,
      detailKota: kota
        ? {
            nama: kota.nama,
            kodeKemendagri: kota.kode_kemendagri || null,
            lat: kota.lat ?? null,
            lng: kota.lng ?? null,
          }
        : null,
      detailProvinsi: provinsi
        ? {
            nama: provinsi.nama,
            kodeKemendagri: provinsi.kode_kemendagri || null,
            zonaWaktu: provinsi.zona_waktu || null,
          }
        : null,
    };
  });

  return {
    totalResult: formattedResult.length,
    query,
    results: formattedResult,
  };
}

export async function handleKodeposCheckRequest(url: URL) {
  const endpoint = await getApiEndpointStatusBySlug("kodepos-check");
  if (endpoint?.status === "NON_ACTIVE") {
    return errorResponse(503, "Endpoint is currently non-active.");
  }

  if (endpoint?.status === "MAINTENANCE") {
    return errorResponse(503, "Endpoint is under maintenance.");
  }

  const query = (url.searchParams.get("query") || "").trim();
  const apiKeyValue = (url.searchParams.get("apikey") || "").trim();

  if (!query) {
    return errorResponse(400, "Query parameter 'query' is required.");
  }

  if (query.length < 3) {
    return errorResponse(400, "Query minimal 3 karakter.");
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

  const dataset = await loadKodeposDataset();
  if (
    dataset.provinsiData.length === 0 &&
    dataset.kotaData.length === 0 &&
    dataset.kecamatanData.length === 0 &&
    dataset.kelurahanData.length === 0
  ) {
    return errorResponse(502, "Failed to fetch data from source.");
  }

  const searchResult = mapKodeposSearchResult(query, dataset);
  const remainingLimit = Math.max(effectiveLimit - usageResult.usedCount, 0);

  if (searchResult.totalResult === 0) {
    return NextResponse.json(
      {
        status: true,
        code: 200,
        creator: CREATOR,
        message: "Data tidak ditemukan",
        result: {
          totalResult: 0,
          query,
          results: [],
        },
        remaining_limit: remainingLimit,
      },
      { status: 200 },
    );
  }

  return NextResponse.json(
    {
      status: true,
      code: 200,
      creator: CREATOR,
      result: searchResult,
      remaining_limit: remainingLimit,
    },
    { status: 200 },
  );
}

import axios from "axios";
import { NextResponse } from "next/server";

import { getApiEndpointStatusBySlug } from "@/lib/api-endpoints";
import { buildBanInfo, normalizeUserBanState } from "@/lib/ban";
import { prisma } from "@/lib/prisma";

const CREATOR = "JzProject";
const KRL_API_BASE = process.env.KRL_API_BASE_URL?.trim() || "https://api-partner.krl.co.id";
const KRL_API_TOKEN = process.env.KRL_API_TOKEN?.trim() || "";

type KrlAction = "stations" | "fare" | "schedule";

type KrlStation = {
  sta_id: string;
  sta_name: string;
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

function parseAction(value: string | null) {
  const normalized = (value || "stations").trim().toLowerCase();
  if (normalized === "stations") {
    return "stations" as const;
  }
  if (normalized === "fare") {
    return "fare" as const;
  }
  if (normalized === "schedule") {
    return "schedule" as const;
  }
  return null;
}

function parseTimeLabel(value: string | null) {
  const parsed = (value || "").trim();
  if (!parsed) {
    return null;
  }
  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(parsed)) {
    return null;
  }
  return parsed;
}

function normalizeBearerToken(value: string) {
  if (!value) {
    return "";
  }
  return value.toLowerCase().startsWith("bearer ") ? value : `Bearer ${value}`;
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

function mapSourceError(error: unknown) {
  if (axios.isAxiosError(error)) {
    const statusCode = error.response?.status ?? 0;
    const networkCode = typeof error.code === "string" ? error.code : "";

    if (networkCode === "ENOTFOUND") {
      return errorResponse(503, "KRL source host unavailable (DNS lookup failed).");
    }
    if (networkCode === "ECONNREFUSED" || networkCode === "ECONNRESET") {
      return errorResponse(503, "KRL source service temporarily unavailable.");
    }
    if (networkCode === "ETIMEDOUT" || networkCode === "ECONNABORTED") {
      return errorResponse(504, "KRL source request timeout.");
    }
    if (statusCode === 401 || statusCode === 403) {
      return errorResponse(502, "KRL source authorization failed. Check server token.");
    }
    if (statusCode === 429) {
      return errorResponse(429, "KRL source is rate limited. Please retry.");
    }
    if (statusCode === 404) {
      return errorResponse(404, "Data not found on KRL source.");
    }
  }
  return errorResponse(502, "Failed to fetch data from KRL source.");
}

async function requestKrl(path: string, params?: Record<string, string>) {
  if (!KRL_API_TOKEN) {
    throw new Error("KRL_API_TOKEN_MISSING");
  }

  const response = await axios.get(`${KRL_API_BASE}${path}`, {
    params,
    timeout: 30000,
    headers: {
      Authorization: normalizeBearerToken(KRL_API_TOKEN),
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0",
      "Accept-Encoding": "gzip, deflate",
      "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
    },
  });

  return response.data as unknown;
}

async function getAllStations() {
  const payload = await requestKrl("/krl-webs/v1/krl-station");
  const record = toRecord(payload);
  const data = Array.isArray(record?.data) ? record.data : [];
  return data
    .map((item) => toRecord(item))
    .filter((item): item is KrlStation => Boolean(item?.sta_id) && Boolean(item?.sta_name));
}

function findStationByName(stations: KrlStation[], stationName: string) {
  const normalized = stationName.trim().toLowerCase();
  return stations.find((station) => readString(station.sta_name).toLowerCase().includes(normalized)) || null;
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
        data: { requestsCount: { increment: 1 } },
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

async function handleStationsAction(query: string) {
  const stations = await getAllStations();
  const filtered =
    query.trim().length > 0
      ? stations.filter((station) => readString(station.sta_name).toLowerCase().includes(query.toLowerCase()))
      : stations;

  return {
    action: "stations" as KrlAction,
    total_stations: filtered.length,
    stations: filtered,
  };
}

async function handleFareAction(from: string, to: string) {
  if (!from || !to) {
    throw new Error("FARE_PARAM_MISSING");
  }

  const stations = await getAllStations();
  const origin = findStationByName(stations, from);
  const destination = findStationByName(stations, to);

  if (!origin || !destination) {
    throw new Error("STATION_NOT_FOUND");
  }

  const payload = await requestKrl("/krl-webs/v1/fare", {
    stationfrom: readString(origin.sta_id),
    stationto: readString(destination.sta_id),
  });

  const record = toRecord(payload);
  const fares = Array.isArray(record?.data) ? record.data : [];
  const fare = toRecord(fares[0]);

  return {
    action: "fare" as KrlAction,
    origin: {
      id: readString(origin.sta_id),
      name: readString(origin.sta_name),
    },
    destination: {
      id: readString(destination.sta_id),
      name: readString(destination.sta_name),
    },
    fare: fare
      ? {
          price: readNumber(fare.fare),
          distance_km: readNumber(fare.distance),
        }
      : null,
    raw: fare || null,
  };
}

async function handleScheduleAction(stationName: string, timeFrom: string, timeTo: string) {
  if (!stationName || !timeFrom || !timeTo) {
    throw new Error("SCHEDULE_PARAM_MISSING");
  }

  const stations = await getAllStations();
  const station = findStationByName(stations, stationName);
  if (!station) {
    throw new Error("STATION_NOT_FOUND");
  }

  const payload = await requestKrl("/krl-webs/v1/schedule", {
    stationid: readString(station.sta_id),
    timefrom: timeFrom,
    timeto: timeTo,
  });

  const record = toRecord(payload);
  const rows = Array.isArray(record?.data) ? record.data : [];

  const schedules = rows
    .map((row) => toRecord(row))
    .filter((row): row is Record<string, unknown> => Boolean(row))
    .map((row) => ({
      ka_name: readString(row.ka_name),
      dest: readString(row.dest),
      time_est: readString(row.time_est),
      dest_time: readString(row.dest_time),
    }));

  return {
    action: "schedule" as KrlAction,
    station: {
      id: readString(station.sta_id),
      name: readString(station.sta_name),
    },
    time_from: timeFrom,
    time_to: timeTo,
    total_schedule: schedules.length,
    schedules,
  };
}

export async function handleInfoKrlRequest(url: URL) {
  const endpointError = await checkEndpointAvailability("info-krl");
  if (endpointError) {
    return endpointError;
  }

  const action = parseAction(url.searchParams.get("action"));
  const apiKeyValue = (url.searchParams.get("apikey") || "").trim();

  if (!action) {
    return errorResponse(400, "Query parameter 'action' must be 'stations', 'fare', or 'schedule'.");
  }

  if (!apiKeyValue) {
    return errorResponse(400, "Query parameter 'apikey' is required.");
  }

  const accessResult = await authorizeAndConsume(apiKeyValue);
  if ("error" in accessResult) {
    return accessResult.error;
  }

  try {
    if (!KRL_API_TOKEN) {
      return errorResponse(503, "KRL API token is not configured on server. Set KRL_API_TOKEN in .env.");
    }

    const from = (url.searchParams.get("from") || "").trim();
    const to = (url.searchParams.get("to") || "").trim();
    const station = (url.searchParams.get("station") || "").trim();
    const query = (url.searchParams.get("query") || "").trim();
    const timeFrom = parseTimeLabel(url.searchParams.get("timefrom"));
    const timeTo = parseTimeLabel(url.searchParams.get("timeto"));

    let result: Record<string, unknown>;
    if (action === "stations") {
      result = await handleStationsAction(query);
    } else if (action === "fare") {
      if (!from || !to) {
        return errorResponse(400, "Action 'fare' requires query params 'from' and 'to'.");
      }
      result = await handleFareAction(from, to);
    } else {
      if (!station) {
        return errorResponse(400, "Action 'schedule' requires query param 'station'.");
      }
      if (!timeFrom || !timeTo) {
        return errorResponse(400, "Action 'schedule' requires valid 'timefrom' and 'timeto' format HH:MM.");
      }
      result = await handleScheduleAction(station, timeFrom, timeTo);
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
    if (error instanceof Error) {
      if (error.message === "FARE_PARAM_MISSING") {
        return errorResponse(400, "Action 'fare' requires query params 'from' and 'to'.");
      }
      if (error.message === "SCHEDULE_PARAM_MISSING") {
        return errorResponse(400, "Action 'schedule' requires 'station', 'timefrom', and 'timeto'.");
      }
      if (error.message === "STATION_NOT_FOUND") {
        return errorResponse(404, "Station not found. Check station name.");
      }
      if (error.message === "KRL_API_TOKEN_MISSING") {
        return errorResponse(503, "KRL API token is not configured on server. Set KRL_API_TOKEN in .env.");
      }
    }

    return mapSourceError(error);
  }
}

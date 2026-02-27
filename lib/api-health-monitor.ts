import type { MarketplaceApi } from "@/lib/api-catalog";

export type ApiHealthStatus = "UP" | "DEGRADED" | "DOWN" | "CHECKING";

export type ApiHealthSnapshot = {
  slug: string;
  healthStatus: ApiHealthStatus;
  responseTimeMs: number | null;
  httpStatus: number | null;
  lastCheckedAt: string | null;
  error: string | null;
};

const CHECK_TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 20000;
const MAX_CONCURRENCY = 4;

type HealthCache = {
  checkedAt: string;
  expiresAt: number;
  snapshots: Record<string, ApiHealthSnapshot>;
};

let cache: HealthCache | null = null;
let inFlight: Promise<HealthCache> | null = null;

function mapHttpStatusToHealth(status: number) {
  if (status >= 200 && status < 300) {
    return "UP" as const;
  }

  if (status === 400 || status === 401 || status === 403 || status === 404 || status === 405 || status === 429) {
    return "UP" as const;
  }

  if (status === 503 || status === 502 || status === 504) {
    return "DEGRADED" as const;
  }

  if (status >= 500) {
    return "DOWN" as const;
  }

  return "DEGRADED" as const;
}

function normalizeError(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Unknown health-check error";
}

async function checkOneEndpoint(api: MarketplaceApi, baseOrigin: string): Promise<ApiHealthSnapshot> {
  const startedAt = Date.now();
  const url = `${baseOrigin}${api.path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "x-health-check": "1",
      },
    });

    const elapsed = Date.now() - startedAt;
    return {
      slug: api.slug,
      healthStatus: mapHttpStatusToHealth(response.status),
      responseTimeMs: elapsed,
      httpStatus: response.status,
      lastCheckedAt: new Date().toISOString(),
      error: null,
    };
  } catch (error) {
    const elapsed = Date.now() - startedAt;
    const rawError = normalizeError(error);
    const timeoutLike = rawError.toLowerCase().includes("aborted") || rawError.toLowerCase().includes("timeout");

    return {
      slug: api.slug,
      healthStatus: timeoutLike ? "DEGRADED" : "DOWN",
      responseTimeMs: elapsed,
      httpStatus: null,
      lastCheckedAt: new Date().toISOString(),
      error: rawError,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function getSingleApiHealthSnapshot(params: { api: MarketplaceApi; baseOrigin: string }) {
  const { api, baseOrigin } = params;
  return checkOneEndpoint(api, baseOrigin);
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let cursor = 0;

  async function consume() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await worker(items[index]);
    }
  }

  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, () => consume());
  await Promise.all(workers);
  return results;
}

async function buildSnapshots(apis: MarketplaceApi[], baseOrigin: string): Promise<HealthCache> {
  const checkedAt = new Date().toISOString();
  const snapshotsList = await runWithConcurrency(apis, MAX_CONCURRENCY, (api) => checkOneEndpoint(api, baseOrigin));
  const snapshots = Object.fromEntries(snapshotsList.map((snapshot) => [snapshot.slug, snapshot]));

  return {
    checkedAt,
    expiresAt: Date.now() + CACHE_TTL_MS,
    snapshots,
  };
}

export async function getApiHealthSnapshots(params: {
  apis: MarketplaceApi[];
  baseOrigin: string;
  force?: boolean;
}) {
  const { apis, baseOrigin, force = false } = params;

  if (!force && cache && Date.now() < cache.expiresAt) {
    return cache;
  }

  if (!force && inFlight) {
    return inFlight;
  }

  inFlight = buildSnapshots(apis, baseOrigin)
    .then((nextCache) => {
      cache = nextCache;
      return nextCache;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

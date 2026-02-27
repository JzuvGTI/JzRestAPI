type RateLimitState = {
  count: number;
  resetAt: number;
};

const globalRateLimitStore = globalThis as unknown as {
  __adminRateLimitStore?: Map<string, RateLimitState>;
};

const store = globalRateLimitStore.__adminRateLimitStore || new Map<string, RateLimitState>();
globalRateLimitStore.__adminRateLimitStore = store;

type CheckRateLimitInput = {
  userId: string;
  scope: string;
  maxHits?: number;
  windowMs?: number;
};

export function checkAdminRateLimit({
  userId,
  scope,
  maxHits = 20,
  windowMs = 60_000,
}: CheckRateLimitInput) {
  const now = Date.now();
  const key = `${userId}:${scope}`;
  const current = store.get(key);

  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return {
      allowed: true,
      retryAfterSec: 0,
      remaining: maxHits - 1,
    };
  }

  if (current.count >= maxHits) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
      remaining: 0,
    };
  }

  current.count += 1;
  store.set(key, current);

  return {
    allowed: true,
    retryAfterSec: 0,
    remaining: Math.max(0, maxHits - current.count),
  };
}

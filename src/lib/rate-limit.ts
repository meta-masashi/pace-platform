/**
 * In-memory sliding window rate limiter for Gemini API routes.
 * MVP: no Redis needed. Resets on server restart.
 * Limit: 10 requests per user per 60 seconds.
 */

interface WindowEntry {
  timestamps: number[];
}

declare global {
  // eslint-disable-next-line no-var
  var __paceRateLimitStore: Map<string, WindowEntry> | undefined;
}

const store: Map<string, WindowEntry> =
  global.__paceRateLimitStore ??
  (global.__paceRateLimitStore = new Map());

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 10;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // epoch ms when oldest request expires
}

/**
 * Check and record a rate-limit tick for a given user+route key.
 * Call this at the top of every Gemini API route handler.
 *
 * @param userId  The authenticated user/staff ID (use "anonymous" if unknown)
 * @param route   A short route label, e.g. "rehab-menu"
 */
export function checkRateLimit(userId: string, route: string): RateLimitResult {
  const key = `${userId}:${route}`;
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  const entry = store.get(key) ?? { timestamps: [] };

  // Evict timestamps outside the sliding window
  entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

  if (entry.timestamps.length >= MAX_REQUESTS) {
    const oldest = entry.timestamps[0];
    const resetAt = oldest + WINDOW_MS;
    store.set(key, entry);
    return { allowed: false, remaining: 0, resetAt };
  }

  entry.timestamps.push(now);
  store.set(key, entry);

  const remaining = MAX_REQUESTS - entry.timestamps.length;
  const resetAt =
    entry.timestamps.length > 0
      ? entry.timestamps[0] + WINDOW_MS
      : now + WINDOW_MS;

  return { allowed: true, remaining, resetAt };
}

/**
 * Extract a stable user identifier from request headers.
 * Prefers the x-user-id header set by middleware; falls back to
 * the forwarded IP so anonymous callers are still throttled.
 */
export function extractUserId(request: Request): string {
  const headers = request.headers as Headers;
  const userId = headers.get("x-user-id");
  if (userId) return userId;

  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();

  return "anonymous";
}

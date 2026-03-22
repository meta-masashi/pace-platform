/**
 * Supabase-backed sliding window rate limiter for Gemini API routes.
 * Persists request timestamps in `public.rate_limit_log` so limits survive
 * server restarts and cold starts in production.
 *
 * Fallback: if Supabase env vars are absent or a query fails, the limiter
 * transparently falls back to an in-memory Map so dev/test environments
 * continue to work without any database.
 *
 * Limit: 10 requests per user per 60 seconds (sliding window).
 */

import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 10;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // epoch ms when the oldest request in the window expires
}

// ---------------------------------------------------------------------------
// In-memory fallback (kept for dev / test environments)
// ---------------------------------------------------------------------------

/** @internal */
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

function checkRateLimitInMemory(key: string): RateLimitResult {
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

// ---------------------------------------------------------------------------
// Supabase service-role client
// ---------------------------------------------------------------------------

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// ---------------------------------------------------------------------------
// Supabase-backed implementation
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkRateLimitSupabase(
  supabase: ReturnType<typeof createClient<any, any, any>>,
  key: string
): Promise<RateLimitResult> {
  const now = Date.now();

  // Count requests within the sliding window
  const { count, error: countError } = await supabase
    .from("rate_limit_log")
    .select("id", { count: "exact", head: true })
    .eq("key", key)
    .gte("ts", new Date(now - WINDOW_MS).toISOString());

  if (countError) {
    throw new Error(`rate_limit count query failed: ${countError.message}`);
  }

  const currentCount = count ?? 0;

  if (currentCount >= MAX_REQUESTS) {
    // Find the oldest timestamp in the window to calculate resetAt
    const { data: oldestRow, error: oldestError } = await supabase
      .from("rate_limit_log")
      .select("ts")
      .eq("key", key)
      .gte("ts", new Date(now - WINDOW_MS).toISOString())
      .order("ts", { ascending: true })
      .limit(1)
      .single();

    if (oldestError) {
      throw new Error(`rate_limit oldest query failed: ${oldestError.message}`);
    }

    const oldestMs = new Date(oldestRow.ts as string).getTime();
    const resetAt = oldestMs + WINDOW_MS;

    return { allowed: false, remaining: 0, resetAt };
  }

  // Allow the request — record a new row
  const { error: insertError } = await supabase
    .from("rate_limit_log")
    .insert({ key });

  if (insertError) {
    throw new Error(`rate_limit insert failed: ${insertError.message}`);
  }

  const newCount = currentCount + 1;
  const remaining = MAX_REQUESTS - newCount;

  // For resetAt, use the start of the window (now + WINDOW_MS gives worst case)
  // A more accurate value requires fetching the oldest row, but that costs an
  // extra query. We approximate: if this is the first request the window resets
  // in 60 s; subsequent requests will have an earlier resetAt from the DB.
  const resetAt = now + WINDOW_MS;

  return { allowed: true, remaining, resetAt };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check and record a rate-limit tick for a given user+route key.
 * Call this at the top of every Gemini API route handler.
 *
 * Uses Supabase `rate_limit_log` table when env vars are present;
 * falls back to in-memory sliding window otherwise.
 *
 * @param userId  The authenticated user/staff ID (use "anonymous" if unknown)
 * @param route   A short route label, e.g. "rehab-menu"
 */
export async function checkRateLimit(
  userId: string,
  route: string
): Promise<RateLimitResult> {
  const key = `${userId}:${route}`;

  const supabase = getServiceClient();

  if (supabase) {
    try {
      return await checkRateLimitSupabase(supabase, key);
    } catch (err) {
      console.warn(
        "[rate-limit] Supabase query failed, falling back to in-memory store:",
        err instanceof Error ? err.message : err
      );
      // Fall through to in-memory fallback
    }
  }

  return checkRateLimitInMemory(key);
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

// ---------------------------------------------------------------------------
// NOTE: Unit tests
// ---------------------------------------------------------------------------
// No rate-limit unit test file exists yet in src/__tests__/unit/.
// If you add one, mock `@supabase/supabase-js` createClient and assert that:
//   - checkRateLimit returns Promise<RateLimitResult>
//   - allowed=false after MAX_REQUESTS calls with the same key
//   - When the mock throws, the function falls back to the in-memory path
//
// Example skeleton (Jest / vitest):
//
//   vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn() }));
//   it("falls back to in-memory when Supabase is unavailable", async () => {
//     delete process.env.NEXT_PUBLIC_SUPABASE_URL;
//     const result = await checkRateLimit("user1", "test-route");
//     expect(result.allowed).toBe(true);
//   });

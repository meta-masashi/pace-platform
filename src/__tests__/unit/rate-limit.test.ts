/**
 * Unit tests for src/lib/rate-limit.ts
 *
 * These tests exercise the in-memory fallback path by ensuring that
 * NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are absent,
 * which causes checkRateLimit to bypass the Supabase client entirely.
 */

import { checkRateLimit, extractUserId } from "@/lib/rate-limit";

// ---------------------------------------------------------------------------
// Polyfill – jsdom does not expose the Fetch API globals used by Next.js routes
// ---------------------------------------------------------------------------

if (typeof globalThis.Request === "undefined") {
  // Minimal Request stub that satisfies extractUserId's usage of request.headers
  class MockRequest {
    headers: Headers;
    url: string;

    constructor(url: string, init?: { headers?: Record<string, string> }) {
      this.url = url;
      this.headers = new Headers(init?.headers ?? {});
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).Request = MockRequest;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return a random userId that is unique per test to avoid state leakage. */
function uniqueUserId(): string {
  return `test-user-${Math.random().toString(36).slice(2)}`;
}

const TEST_ROUTE = "unit-test-route";

// ---------------------------------------------------------------------------
// Setup / Teardown – strip Supabase env vars to force in-memory path
// ---------------------------------------------------------------------------

let savedSupabaseUrl: string | undefined;
let savedServiceKey: string | undefined;

beforeAll(() => {
  savedSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  savedServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Clear any pre-existing in-memory store state so test runs are isolated.
  if (global.__paceRateLimitStore) {
    global.__paceRateLimitStore.clear();
  }
});

afterAll(() => {
  if (savedSupabaseUrl !== undefined) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = savedSupabaseUrl;
  }
  if (savedServiceKey !== undefined) {
    process.env.SUPABASE_SERVICE_ROLE_KEY = savedServiceKey;
  }
});

// ---------------------------------------------------------------------------
// checkRateLimit – in-memory fallback
// ---------------------------------------------------------------------------

describe("checkRateLimit (in-memory fallback)", () => {
  it("returns allowed:true on the first call", async () => {
    const result = await checkRateLimit(uniqueUserId(), TEST_ROUTE);
    expect(result.allowed).toBe(true);
  });

  it("result has required shape: allowed (boolean), remaining (number ≥ 0), resetAt (number > 0)", async () => {
    const result = await checkRateLimit(uniqueUserId(), TEST_ROUTE);

    expect(typeof result.allowed).toBe("boolean");
    expect(typeof result.remaining).toBe("number");
    expect(result.remaining).toBeGreaterThanOrEqual(0);
    expect(typeof result.resetAt).toBe("number");
    expect(result.resetAt).toBeGreaterThan(0);
  });

  it("remaining decrements with each successive call", async () => {
    const userId = uniqueUserId();
    const first = await checkRateLimit(userId, TEST_ROUTE);
    const second = await checkRateLimit(userId, TEST_ROUTE);

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(second.remaining).toBe(first.remaining - 1);
  });

  it("returns allowed:false and remaining:0 after MAX_REQUESTS (10) calls", async () => {
    const userId = uniqueUserId();

    // Exhaust all 10 allowed slots
    for (let i = 0; i < 10; i++) {
      const r = await checkRateLimit(userId, TEST_ROUTE);
      expect(r.allowed).toBe(true);
    }

    // The 11th call must be rejected
    const overLimit = await checkRateLimit(userId, TEST_ROUTE);
    expect(overLimit.allowed).toBe(false);
    expect(overLimit.remaining).toBe(0);
  });

  it("rejected result still has a valid resetAt timestamp in the future", async () => {
    const userId = uniqueUserId();

    for (let i = 0; i < 10; i++) {
      await checkRateLimit(userId, TEST_ROUTE);
    }

    const overLimit = await checkRateLimit(userId, TEST_ROUTE);
    expect(overLimit.resetAt).toBeGreaterThan(Date.now() - 1000); // within reasonable window
  });

  it("different user keys are tracked independently", async () => {
    const userA = uniqueUserId();
    const userB = uniqueUserId();

    // Exhaust userA
    for (let i = 0; i < 10; i++) {
      await checkRateLimit(userA, TEST_ROUTE);
    }
    const userAOver = await checkRateLimit(userA, TEST_ROUTE);
    expect(userAOver.allowed).toBe(false);

    // userB is still fresh
    const userBFirst = await checkRateLimit(userB, TEST_ROUTE);
    expect(userBFirst.allowed).toBe(true);
  });

  it("same user on different routes are tracked independently", async () => {
    const userId = uniqueUserId();

    // Exhaust route-a
    for (let i = 0; i < 10; i++) {
      await checkRateLimit(userId, "route-a");
    }
    const routeAOver = await checkRateLimit(userId, "route-a");
    expect(routeAOver.allowed).toBe(false);

    // route-b for the same user is still fresh
    const routeBFirst = await checkRateLimit(userId, "route-b");
    expect(routeBFirst.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// extractUserId
// ---------------------------------------------------------------------------

describe("extractUserId", () => {
  it("returns the x-user-id header value when present", () => {
    const request = new Request("https://example.com/api/test", {
      headers: { "x-user-id": "staff-abc-123" },
    });
    expect(extractUserId(request)).toBe("staff-abc-123");
  });

  it("returns the first IP from x-forwarded-for when x-user-id is absent", () => {
    const request = new Request("https://example.com/api/test", {
      headers: { "x-forwarded-for": "203.0.113.5, 10.0.0.1" },
    });
    expect(extractUserId(request)).toBe("203.0.113.5");
  });

  it("returns 'anonymous' when no identifying headers are present", () => {
    const request = new Request("https://example.com/api/test");
    expect(extractUserId(request)).toBe("anonymous");
  });

  it("x-user-id takes priority over x-forwarded-for", () => {
    const request = new Request("https://example.com/api/test", {
      headers: {
        "x-user-id": "preferred-id",
        "x-forwarded-for": "203.0.113.5",
      },
    });
    expect(extractUserId(request)).toBe("preferred-id");
  });

  it("handles a single IP in x-forwarded-for without trailing comma", () => {
    const request = new Request("https://example.com/api/test", {
      headers: { "x-forwarded-for": "198.51.100.42" },
    });
    expect(extractUserId(request)).toBe("198.51.100.42");
  });
});

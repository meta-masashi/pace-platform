import type { SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function createClient(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    // No-op proxy when env is not configured (dev without Supabase)
    const handler: ProxyHandler<object> = {
      get: (_target, prop) => {
        if (prop === "then") return undefined; // Prevent Promise coercion
        return new Proxy(() => Promise.resolve({ data: null, error: null }), handler);
      },
      apply: () => Promise.resolve({ data: null, error: null }),
    };
    return new Proxy({} as SupabaseClient, handler);
  }

  // Dynamic import to avoid module-level validation crash
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createBrowserClient } = require("@supabase/ssr");
  _client = createBrowserClient(url, key) as SupabaseClient;
  return _client;
}

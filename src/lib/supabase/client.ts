import type { SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function createClient(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    // Deep no-op proxy: supports full Supabase chaining without env vars.
    const TERMINAL = { data: null, error: null, count: null, status: 200, statusText: "OK" };

    const makeChainable = (): unknown => {
      const handler: ProxyHandler<object> = {
        get: (_target, prop) => {
          if (prop === "then") return undefined;
          if (prop === "catch" || prop === "finally") return undefined;
          if (prop === "data") return null;
          if (prop === "error") return null;
          return makeChainable();
        },
        apply: () => {
          const resultProxy = new Proxy(
            Object.assign(() => resultProxy, { ...TERMINAL }),
            {
              get: (t, prop) => {
                if (prop === "then") {
                  return (resolve: (v: unknown) => void) => resolve(TERMINAL);
                }
                if (prop === "catch" || prop === "finally") return undefined;
                if (prop in TERMINAL) return (TERMINAL as Record<string, unknown>)[prop as string];
                return makeChainable();
              },
              apply: () => resultProxy,
            }
          );
          return resultProxy;
        },
      };
      return new Proxy(() => makeChainable(), handler);
    };

    return makeChainable() as SupabaseClient;
  }

  // Dynamic import to avoid module-level validation crash
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createBrowserClient } = require("@supabase/ssr");
  _client = createBrowserClient(url, key) as SupabaseClient;
  return _client;
}

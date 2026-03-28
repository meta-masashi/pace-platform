import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    // Return a deep no-op proxy when env is not configured.
    // Must support Supabase chaining: from().select().eq().order().limit() etc.
    // Each call returns either a chainable proxy or a terminal { data, error } result.
    const TERMINAL = { data: null, error: null, count: null, status: 200, statusText: "OK" };

    const makeChainable = (): unknown => {
      const handler: ProxyHandler<object> = {
        get: (_target, prop) => {
          // Prevent Promise coercion (await detection)
          if (prop === "then") return undefined;
          if (prop === "catch" || prop === "finally") return undefined;
          // Terminal data access
          if (prop === "data") return null;
          if (prop === "error") return null;
          // Everything else returns another chainable proxy
          return makeChainable();
        },
        apply: () => {
          // When called as a function, return a chainable proxy
          // that also resolves to TERMINAL when awaited
          const resultProxy = new Proxy(
            Object.assign(() => resultProxy, { ...TERMINAL }),
            {
              get: (t, prop) => {
                if (prop === "then") {
                  // Make it thenable so `await` resolves to TERMINAL
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

    return makeChainable() as ReturnType<typeof createServerClient>;
  }

  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // setAll called from a Server Component — safe to ignore
        }
      },
    },
  });
}

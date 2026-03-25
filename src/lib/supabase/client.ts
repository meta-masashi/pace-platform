import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    // Return a no-op proxy in development when env is not set
    // This prevents crashes on pages that import createClient
    const handler: ProxyHandler<object> = {
      get: () => new Proxy(() => Promise.resolve({ data: null, error: null }), handler),
    };
    return new Proxy({} as ReturnType<typeof createBrowserClient>, handler);
  }

  return createBrowserClient(url, key);
}

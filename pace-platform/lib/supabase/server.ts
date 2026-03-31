/**
 * PACE Platform — サーバーサイド Supabase クライアントファクトリ
 *
 * Next.js App Router のサーバーコンポーネント・API Route から使用する
 * Cookie ベース認証対応の Supabase クライアントを生成する。
 *
 * @supabase/ssr を使用し、リクエスト Cookie からセッションを復元する。
 */

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

// ---------------------------------------------------------------------------
// サーバーサイド Supabase クライアント
// ---------------------------------------------------------------------------

/**
 * サーバーサイド用 Supabase クライアントを生成する。
 *
 * Next.js の `cookies()` を使用して Cookie の読み書きを行い、
 * Supabase Auth のセッション管理を実現する。
 *
 * API Route やサーバーコンポーネントから呼び出すこと。
 *
 * @returns Supabase クライアントインスタンス
 *
 * @example
 * ```ts
 * const supabase = await createClient();
 * const { data: { user } } = await supabase.auth.getUser();
 * ```
 */
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.error('[supabase/server] ENV MISSING:', { url: !!url, key: !!key });
  }

  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();
  const sbCookies = allCookies.filter(c => c.name.startsWith('sb-'));

  if (sbCookies.length === 0) {
    console.warn('[supabase/server] No Supabase session cookies found. Total cookies:', allCookies.length);
  }

  return createServerClient(
    url ?? '',
    key ?? '',
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Component からの呼び出し時は Cookie の書き込みが
            // できない場合がある。セッション更新は Middleware で処理される。
          }
        },
      },
    }
  );
}

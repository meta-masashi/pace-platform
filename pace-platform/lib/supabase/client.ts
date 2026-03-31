/**
 * PACE Platform — ブラウザ用 Supabase クライアント
 *
 * @supabase/ssr の createBrowserClient を使用し、
 * Cookie ベースのセッション管理を行う。
 * middleware.ts のサーバー側セッションチェックと互換。
 */

import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Supabase環境変数が設定されていません');
  }

  return createBrowserClient(url, key);
}

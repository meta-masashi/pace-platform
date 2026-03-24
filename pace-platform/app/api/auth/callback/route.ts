/**
 * PACE Platform — OAuth コールバックハンドラー
 *
 * GET /api/auth/callback
 *
 * Supabase Auth の OAuth フローで使用するコールバックエンドポイント。
 * 認可コードをセッションに交換し、ダッシュボードにリダイレクトする。
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// GET /api/auth/callback
// ---------------------------------------------------------------------------

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // 認証成功 — ダッシュボードまたは指定先にリダイレクト
      const redirectUrl = `${origin}${next}`;
      return NextResponse.redirect(redirectUrl);
    }

    console.error("[auth/callback] セッション交換エラー:", error);
  }

  // 認証失敗 — エラーページにリダイレクト
  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent("認証に失敗しました。もう一度お試しください。")}`
  );
}

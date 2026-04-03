/**
 * PACE Platform — OAuth / Magic Link コールバックハンドラー
 *
 * GET /api/auth/callback
 *
 * Supabase Auth の OAuth フローおよび Magic Link 認証で使用するコールバック。
 * 認可コードをセッションに交換し、ユーザーロールに応じてリダイレクトする。
 *
 * - staff テーブルにレコードが存在する場合 → /dashboard（スタッフ）
 * - それ以外 → /（アスリートまたは一般ユーザー）
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createLogger } from "@/lib/observability/logger";

const log = createLogger('auth');

// ---------------------------------------------------------------------------
// GET /api/auth/callback
// ---------------------------------------------------------------------------

/**
 * リダイレクト先パスのバリデーション（オープンリダイレクト防止）。
 * - `/` で始まること
 * - `//` で始まらないこと（プロトコル相対URL防止）
 * - プロトコル文字列を含まないこと
 * - バックスラッシュを含まないこと（IE互換プロトコル回避）
 */
function isValidRedirectPath(path: string): boolean {
  if (!path.startsWith('/')) return false;
  if (path.startsWith('//')) return false;
  if (/[:\\]/.test(path)) return false;
  // URL エンコードされたプロトコル相対パスを防止
  try {
    const decoded = decodeURIComponent(path);
    if (decoded.startsWith('//') || /[:\\]/.test(decoded)) return false;
  } catch {
    return false; // デコード失敗 = 不正入力
  }
  return true;
}

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");
  const errorParam = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  // OAuth プロバイダーからのエラー（拒否など）
  if (errorParam) {
    const message = errorDescription ?? "認証に失敗しました。";
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(message)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("認証コードが見つかりません。もう一度お試しください。")}`
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    log.error('セッション交換エラー', { data: { error: error.message } });
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("認証に失敗しました。もう一度お試しください。")}`
    );
  }

  // 明示的なリダイレクト先が指定されている場合はそちらを使用
  // セキュリティ: リダイレクト先はサイト内パスのみ許可（オープンリダイレクト防止）
  if (next && isValidRedirectPath(next)) {
    return NextResponse.redirect(`${origin}${next}`);
  }

  // ロールに基づくリダイレクト先の決定
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    // アスリート判定: athletes.user_id にマッチ
    const { data: athlete } = await supabase
      .from("athletes")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (athlete) {
      return NextResponse.redirect(`${origin}/home`);
    }

    // スタッフ判定
    const { data: staff } = await supabase
      .from("staff")
      .select("role")
      .eq("id", user.id)
      .single();

    if (staff) {
      return NextResponse.redirect(`${origin}/dashboard`);
    }
  }

  // ロール不明 → ログイン
  return NextResponse.redirect(`${origin}/login`);
}

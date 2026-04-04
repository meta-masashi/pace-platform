/**
 * PACE Platform — OAuth / Magic Link コールバックハンドラー
 *
 * GET /api/auth/callback
 *
 * Supabase Auth の OAuth フローおよび Magic Link 認証で使用するコールバック。
 * 認可コードをセッションに交換し、ユーザーロールに応じてリダイレクトする。
 *
 * v1.3 改修:
 * - platform_admins テーブルチェック追加
 * - login_context パラメータによるリダイレクト先の制御
 * - user_metadata へのロール情報書き込み（ミドルウェアでの DB クエリ回避）
 *
 * 設計書参照: architecture-v1.3-auth-admin.md セクション 4
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createLogger } from "@/lib/observability/logger";

const log = createLogger('auth');

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

type LoginContext = 'staff' | 'athlete' | 'admin';

interface DetectedRoles {
  isPlatformAdmin: boolean;
  isStaff: boolean;
  isAthlete: boolean;
  roles: string[];
}

// ---------------------------------------------------------------------------
// リダイレクト先パスのバリデーション（オープンリダイレクト防止）
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
  if (path.includes('@')) return false;
  try {
    const decoded = decodeURIComponent(path);
    if (decoded.startsWith('//') || /[:\\]/.test(decoded) || decoded.includes('@')) return false;
  } catch {
    return false;
  }
  if (!/^\/[^/]/.test(path)) return false;
  if (/^\/[a-zA-Z][a-zA-Z\d+\-.]*:/.test(path)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// login_context のバリデーション
// ---------------------------------------------------------------------------

function parseLoginContext(value: string | null): LoginContext | null {
  if (value === 'staff' || value === 'athlete' || value === 'admin') {
    return value;
  }
  return null;
}

// ---------------------------------------------------------------------------
// ロール判定
// ---------------------------------------------------------------------------

async function detectRoles(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<DetectedRoles> {
  // 並列で全ロールテーブルをチェック
  const [platformAdminResult, staffResult, athleteResult] = await Promise.all([
    supabase
      .from('platform_admins')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('staff')
      .select('id, role')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('athletes')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  const isPlatformAdmin = !!platformAdminResult.data;
  const isStaff = !!staffResult.data;
  const isAthlete = !!athleteResult.data;

  const roles: string[] = [];
  if (isPlatformAdmin) roles.push('platform_admin');
  if (isStaff) roles.push('staff');
  if (isAthlete) roles.push('athlete');

  return { isPlatformAdmin, isStaff, isAthlete, roles };
}

// ---------------------------------------------------------------------------
// login_context + role に基づくリダイレクト先決定
// ---------------------------------------------------------------------------

function determineRedirect(
  loginContext: LoginContext | null,
  detected: DetectedRoles,
  origin: string,
): string {
  // セキュリティ: ロール不一致時は同一の汎用エラーメッセージを返す（ロール列挙防止）
  const AUTH_FAIL_MSG = encodeURIComponent('ログインに失敗しました。正しいログインページをご利用ください。');

  // login_context が指定されている場合
  if (loginContext === 'admin') {
    if (detected.isPlatformAdmin) return `${origin}/platform-admin`;
    return `${origin}/auth/admin-login?error=${AUTH_FAIL_MSG}`;
  }

  if (loginContext === 'staff') {
    if (detected.isPlatformAdmin) return `${origin}/auth/admin-login`;
    if (detected.isStaff) return `${origin}/dashboard`;
    // ロール不一致: 具体的な理由を明かさない
    return `${origin}/auth/login?error=${AUTH_FAIL_MSG}`;
  }

  if (loginContext === 'athlete') {
    if (detected.isPlatformAdmin) return `${origin}/auth/admin-login`;
    if (detected.isAthlete) return `${origin}/home`;
    // ロール不一致: 具体的な理由を明かさない
    return `${origin}/auth/athlete-login?error=${AUTH_FAIL_MSG}`;
  }

  // login_context なし → 既存ロジック維持（後方互換性）
  if (detected.isPlatformAdmin) return `${origin}/platform-admin`;
  if (detected.isAthlete) return `${origin}/home`;
  if (detected.isStaff) return `${origin}/dashboard`;

  return `${origin}/login`;
}

// ---------------------------------------------------------------------------
// GET /api/auth/callback
// ---------------------------------------------------------------------------

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");
  const errorParam = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");
  const loginContextParam = searchParams.get("login_context");

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

  // ユーザー取得
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/login`);
  }

  // ロール判定
  const detected = await detectRoles(supabase, user.id);
  const loginContext = parseLoginContext(loginContextParam);

  // セッション metadata 更新（ミドルウェアでの DB クエリ回避）
  const effectiveLoginContext = loginContext
    ?? (detected.isPlatformAdmin ? 'platform_admin'
      : detected.isStaff ? 'staff'
      : detected.isAthlete ? 'athlete'
      : undefined);

  try {
    await supabase.auth.updateUser({
      data: {
        login_context: effectiveLoginContext,
        detected_roles: detected.roles,
        login_timestamp: new Date().toISOString(),
      },
    });
  } catch (metadataError) {
    // メタデータ更新失敗はログのみ（リダイレクトはブロックしない）
    log.warn('user_metadata 更新失敗', { data: { error: metadataError } });
  }

  // 明示的なリダイレクト先が指定されている場合はそちらを使用
  // セキュリティ: リダイレクト先はサイト内パスのみ許可（オープンリダイレクト防止）
  if (next) {
    const destination = isValidRedirectPath(next) ? next : "/dashboard";
    return NextResponse.redirect(`${origin}${destination}`);
  }

  // login_context + ロールに基づくリダイレクト先の決定
  const redirectUrl = determineRedirect(loginContext, detected, origin);

  log.info('認証コールバック完了', {
    data: {
      userId: user.id,
      loginContext: loginContext ?? 'none',
      detectedRoles: detected.roles,
      redirectTo: redirectUrl.replace(origin, ''),
    },
  });

  return NextResponse.redirect(redirectUrl);
}

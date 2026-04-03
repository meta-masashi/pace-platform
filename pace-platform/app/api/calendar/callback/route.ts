/**
 * PACE Platform — Google Calendar OAuth コールバック
 *
 * GET /api/calendar/callback?code=xxx&state=xxx
 *
 * Google OAuth 認可コードをトークンに交換し、
 * 暗号化して calendar_connections テーブルに保存する。
 * 完了後、スタッフダッシュボードにリダイレクトする。
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getTokensFromCode } from '@/lib/calendar/google-client';
import { encryptToken } from '@/lib/calendar/token-crypto';
import { withApiHandler } from '@/lib/api/handler';

/** リダイレクト先のベースURL（オープンリダイレクト防止） */
function getSafeOrigin(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? '';
}

// ---------------------------------------------------------------------------
// GET /api/calendar/callback
// ---------------------------------------------------------------------------

export const GET = withApiHandler(async (request, ctx) => {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const errorParam = searchParams.get('error');

  // ユーザーが同意を拒否した場合
  if (errorParam) {
    ctx.log.warn('ユーザーが OAuth 同意を拒否', { detail: errorParam });
    return NextResponse.redirect(
      `${getSafeOrigin()}/dashboard?calendar_error=${encodeURIComponent('Google Calendar の接続がキャンセルされました。')}`,
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${getSafeOrigin()}/dashboard?calendar_error=${encodeURIComponent('不正なコールバックパラメータです。')}`,
    );
  }

  // state からユーザー ID を抽出
  const colonIndex = state.indexOf(':');
  if (colonIndex === -1) {
    return NextResponse.redirect(
      `${getSafeOrigin()}/dashboard?calendar_error=${encodeURIComponent('不正な state パラメータです。')}`,
    );
  }
  const stateUserId = state.slice(0, colonIndex);

  // 認証チェック
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.redirect(
      `${getSafeOrigin()}/login?error=${encodeURIComponent('認証が必要です。ログインしてください。')}`,
    );
  }

  // state のユーザー ID とセッションのユーザー ID が一致するか検証
  if (user.id !== stateUserId) {
    ctx.log.error('state ユーザー ID 不一致', {
      detail: { stateUserId, sessionUserId: user.id },
    });
    return NextResponse.redirect(
      `${getSafeOrigin()}/dashboard?calendar_error=${encodeURIComponent('セッションが無効です。再度お試しください。')}`,
    );
  }

  // 認可コードをトークンに交換
  let accessToken: string;
  let refreshToken: string | null;
  let expiryDate: number | null;
  try {
    const tokens = await getTokensFromCode(code);
    accessToken = tokens.accessToken;
    refreshToken = tokens.refreshToken;
    expiryDate = tokens.expiryDate;
  } catch (err) {
    ctx.log.error('トークン交換エラー', { detail: err });
    return NextResponse.redirect(
      `${getSafeOrigin()}/dashboard?calendar_error=${encodeURIComponent('Google Calendar の接続中にエラーが発生しました。')}`,
    );
  }

  // トークンを暗号化
  const encryptedAccessToken = encryptToken(accessToken);
  const encryptedRefreshToken = refreshToken ? encryptToken(refreshToken) : null;

  // スタッフの org_id を取得
  const { data: staffRow, error: staffError } = await supabase
    .from('staff')
    .select('org_id')
    .eq('id', user.id)
    .single();

  if (staffError || !staffRow) {
    ctx.log.error('スタッフ情報取得エラー', { detail: staffError });
    return NextResponse.redirect(
      `${getSafeOrigin()}/dashboard?calendar_error=${encodeURIComponent('スタッフ情報の取得に失敗しました。')}`,
    );
  }

  const tokenExpiry = expiryDate ? new Date(expiryDate).toISOString() : null;

  // calendar_connections に upsert（同一 staff_id + provider は一意制約）
  const { error: upsertError } = await supabase
    .from('calendar_connections')
    .upsert(
      {
        staff_id: user.id,
        org_id: staffRow.org_id as string,
        provider: 'google',
        access_token_encrypted: encryptedAccessToken,
        refresh_token_encrypted: encryptedRefreshToken,
        token_expiry: tokenExpiry,
        calendar_id: 'primary',
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'staff_id,provider',
      },
    );

  if (upsertError) {
    ctx.log.error('calendar_connections upsert エラー', { detail: upsertError });
    return NextResponse.redirect(
      `${getSafeOrigin()}/dashboard?calendar_error=${encodeURIComponent('カレンダー接続情報の保存に失敗しました。')}`,
    );
  }

  // 成功 — ダッシュボードにリダイレクト
  return NextResponse.redirect(
    `${getSafeOrigin()}/dashboard?calendar_connected=true`,
  );
}, { service: 'calendar' });

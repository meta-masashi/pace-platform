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

// ---------------------------------------------------------------------------
// GET /api/calendar/callback
// ---------------------------------------------------------------------------

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const errorParam = searchParams.get('error');

  // ユーザーが同意を拒否した場合
  if (errorParam) {
    console.warn('[calendar/callback] ユーザーが OAuth 同意を拒否:', errorParam);
    return NextResponse.redirect(
      `${origin}/dashboard?calendar_error=${encodeURIComponent('Google Calendar の接続がキャンセルされました。')}`,
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${origin}/dashboard?calendar_error=${encodeURIComponent('不正なコールバックパラメータです。')}`,
    );
  }

  try {
    // state からユーザー ID を抽出
    const colonIndex = state.indexOf(':');
    if (colonIndex === -1) {
      return NextResponse.redirect(
        `${origin}/dashboard?calendar_error=${encodeURIComponent('不正な state パラメータです。')}`,
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
        `${origin}/login?error=${encodeURIComponent('認証が必要です。ログインしてください。')}`,
      );
    }

    // state のユーザー ID とセッションのユーザー ID が一致するか検証
    if (user.id !== stateUserId) {
      console.error('[calendar/callback] state ユーザー ID 不一致:', {
        stateUserId,
        sessionUserId: user.id,
      });
      return NextResponse.redirect(
        `${origin}/dashboard?calendar_error=${encodeURIComponent('セッションが無効です。再度お試しください。')}`,
      );
    }

    // 認可コードをトークンに交換
    const { accessToken, refreshToken, expiryDate } = await getTokensFromCode(code);

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
      console.error('[calendar/callback] スタッフ情報取得エラー:', staffError);
      return NextResponse.redirect(
        `${origin}/dashboard?calendar_error=${encodeURIComponent('スタッフ情報の取得に失敗しました。')}`,
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
      console.error('[calendar/callback] calendar_connections upsert エラー:', upsertError);
      return NextResponse.redirect(
        `${origin}/dashboard?calendar_error=${encodeURIComponent('カレンダー接続情報の保存に失敗しました。')}`,
      );
    }

    // 成功 — ダッシュボードにリダイレクト
    return NextResponse.redirect(
      `${origin}/dashboard?calendar_connected=true`,
    );
  } catch (err) {
    console.error('[calendar/callback] 予期しないエラー:', err);
    return NextResponse.redirect(
      `${origin}/dashboard?calendar_error=${encodeURIComponent('Google Calendar の接続中にエラーが発生しました。')}`,
    );
  }
}

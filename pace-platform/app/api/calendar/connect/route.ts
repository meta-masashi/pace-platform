/**
 * PACE Platform — Google Calendar 接続 API
 *
 * GET  /api/calendar/connect          — OAuth 同意画面 URL を生成
 * GET  /api/calendar/connect?status=1 — 接続状態を返す（イベント取得なし）
 * DELETE /api/calendar/connect        — カレンダー連携を切断（トークン削除）
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthUrl } from '@/lib/calendar/google-client';
import { randomBytes } from 'crypto';

// ---------------------------------------------------------------------------
// GET /api/calendar/connect
// ---------------------------------------------------------------------------

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: '認証が必要です。ログインしてください。' },
        { status: 401 },
      );
    }

    // ?status=1 の場合は接続状態のみ返す（OAuth リダイレクトなし）
    const { searchParams } = new URL(request.url);
    if (searchParams.get('status') === '1') {
      const { data: conn } = await supabase
        .from('calendar_connections')
        .select('id, token_expiry, calendar_id')
        .eq('staff_id', user.id)
        .eq('provider', 'google')
        .maybeSingle();

      if (!conn) {
        return NextResponse.json({ success: true, data: { status: 'disconnected' } });
      }

      const expired =
        conn.token_expiry && new Date(conn.token_expiry as string) < new Date();
      return NextResponse.json({
        success: true,
        data: {
          status: expired ? 'expired' : 'connected',
          calendarId: conn.calendar_id,
        },
      });
    }

    // CSRF 防止: ユーザー ID + ランダムトークンを state パラメータに含める
    const stateToken = randomBytes(16).toString('hex');
    const state = `${user.id}:${stateToken}`;

    const authUrl = getAuthUrl(state);

    return NextResponse.json({
      success: true,
      data: { authUrl },
    });
  } catch (err) {
    console.error('[calendar/connect] Google OAuth URL 生成エラー:', err);
    return NextResponse.json(
      {
        success: false,
        error: 'Google Calendar 接続 URL の生成に失敗しました。環境変数を確認してください。',
      },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/calendar/connect — カレンダー連携を切断
// ---------------------------------------------------------------------------

export async function DELETE(): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: '認証が必要です。ログインしてください。' },
        { status: 401 },
      );
    }

    const { error } = await supabase
      .from('calendar_connections')
      .delete()
      .eq('staff_id', user.id)
      .eq('provider', 'google');

    if (error) {
      console.error('[calendar/connect] 切断エラー:', error);
      return NextResponse.json(
        { success: false, error: 'カレンダー連携の切断に失敗しました。' },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[calendar/connect] DELETE エラー:', err);
    return NextResponse.json(
      { success: false, error: 'サーバー内部エラーが発生しました。' },
      { status: 500 },
    );
  }
}

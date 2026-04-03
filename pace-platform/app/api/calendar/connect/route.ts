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
import { withApiHandler, ApiError } from '@/lib/api/handler';

// ---------------------------------------------------------------------------
// GET /api/calendar/connect
// ---------------------------------------------------------------------------

export const GET = withApiHandler(async (request, ctx) => {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new ApiError(401, '認証が必要です。ログインしてください。');
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
}, { service: 'calendar' });

// ---------------------------------------------------------------------------
// DELETE /api/calendar/connect — カレンダー連携を切断
// ---------------------------------------------------------------------------

export const DELETE = withApiHandler(async (_request, ctx) => {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new ApiError(401, '認証が必要です。ログインしてください。');
  }

  const { error } = await supabase
    .from('calendar_connections')
    .delete()
    .eq('staff_id', user.id)
    .eq('provider', 'google');

  if (error) {
    ctx.log.error('切断エラー', { detail: error });
    throw new ApiError(500, 'カレンダー連携の切断に失敗しました。');
  }

  return NextResponse.json({ success: true });
}, { service: 'calendar' });

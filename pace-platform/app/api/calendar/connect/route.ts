/**
 * PACE Platform — Google Calendar 接続 API
 *
 * GET /api/calendar/connect
 *
 * Google OAuth 同意画面の URL を生成して返す。
 * スタッフが Google Calendar を PACE に接続するために使用する。
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthUrl } from '@/lib/calendar/google-client';
import { randomBytes } from 'crypto';

// ---------------------------------------------------------------------------
// GET /api/calendar/connect
// ---------------------------------------------------------------------------

export async function GET(): Promise<NextResponse> {
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

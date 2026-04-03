/**
 * PACE Platform — カレンダーイベント取得 API
 *
 * GET /api/calendar/events?team_id=xxx
 *
 * Google Calendar から今後 30 日間のイベントを取得し、
 * イベント種別を分類、負荷予測を実行して返す。
 *
 * トークンの有効期限が切れている場合はリフレッシュトークンで自動更新する。
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAccess } from '@/lib/billing/plan-gates';
import { listEvents, classifyEvents, refreshAccessToken } from '@/lib/calendar/google-client';
import { predictAvailability } from '@/lib/calendar/load-predictor';
import { encryptToken, decryptToken } from '@/lib/calendar/token-crypto';
import { withApiHandler, ApiError } from '@/lib/api/handler';
import type {
  CalendarEventsResponse,
  CalendarErrorResponse,
  CalendarSyncStatus,
  TeamMetrics,
} from '@/lib/calendar/types';

// ---------------------------------------------------------------------------
// GET /api/calendar/events
// ---------------------------------------------------------------------------

export const GET = withApiHandler(async (request, ctx) => {
  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get('team_id');

  if (!teamId) {
    throw new ApiError(400, 'team_id クエリパラメータは必須です。');
  }

  // 認証チェック
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new ApiError(401, '認証が必要です。');
  }

  // ----- プラン別機能ゲート（Pro+ 必須）-----
  const { data: staffForGate } = await supabase
    .from('staff')
    .select('org_id')
    .eq('user_id', user.id)
    .single();

  if (staffForGate?.org_id) {
    try {
      await requireAccess(supabase, staffForGate.org_id, 'feature_calendar_sync');
    } catch (gateErr) {
      throw new ApiError(403, gateErr instanceof Error ? gateErr.message : 'この機能はご利用いただけません。');
    }
  }

  // カレンダー接続情報を取得
  const { data: connection, error: connError } = await supabase
    .from('calendar_connections')
    .select('*')
    .eq('staff_id', user.id)
    .eq('provider', 'google')
    .single();

  if (connError || !connection) {
    return NextResponse.json({
      success: true,
      data: {
        events: [],
        predictions: [],
        syncStatus: 'disconnected' as CalendarSyncStatus,
      },
    });
  }

  // トークンの復号
  let accessToken: string;
  try {
    accessToken = decryptToken(connection.access_token_encrypted as string);
  } catch {
    throw new ApiError(500, 'トークンの復号に失敗しました。再接続してください。');
  }

  // トークンの有効期限チェック & 自動リフレッシュ
  const tokenExpiry = connection.token_expiry as string | null;
  const isExpired = tokenExpiry && new Date(tokenExpiry).getTime() < Date.now();

  if (isExpired) {
    const refreshTokenEncrypted = connection.refresh_token_encrypted as string | null;

    if (!refreshTokenEncrypted) {
      return NextResponse.json({
        success: true,
        data: {
          events: [],
          predictions: [],
          syncStatus: 'expired' as CalendarSyncStatus,
        },
      });
    }

    try {
      const refreshTokenPlain = decryptToken(refreshTokenEncrypted);
      const refreshed = await refreshAccessToken(refreshTokenPlain);
      accessToken = refreshed.accessToken;

      // 更新されたトークンを DB に保存
      const newExpiry = refreshed.expiryDate
        ? new Date(refreshed.expiryDate).toISOString()
        : null;

      await supabase
        .from('calendar_connections')
        .update({
          access_token_encrypted: encryptToken(accessToken),
          token_expiry: newExpiry,
          updated_at: new Date().toISOString(),
        })
        .eq('staff_id', user.id)
        .eq('provider', 'google');
    } catch (refreshErr) {
      ctx.log.error('トークンリフレッシュエラー', { detail: refreshErr });
      return NextResponse.json({
        success: true,
        data: {
          events: [],
          predictions: [],
          syncStatus: 'expired' as CalendarSyncStatus,
        },
      });
    }
  }

  // イベント取得期間: 今日 〜 30日後
  const now = new Date();
  const timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const timeMax = new Date(timeMin);
  timeMax.setDate(timeMax.getDate() + 30);

  const calendarId = (connection.calendar_id as string) || 'primary';

  // Google Calendar からイベントを取得
  let rawEvents;
  try {
    rawEvents = await listEvents(accessToken, calendarId, timeMin, timeMax);
  } catch (apiErr) {
    ctx.log.error('Google Calendar API エラー', { detail: apiErr });
    return NextResponse.json({
      success: true,
      data: {
        events: [],
        predictions: [],
        syncStatus: 'error' as CalendarSyncStatus,
      },
    });
  }

  // イベント分類
  const classifiedEvents = classifyEvents(rawEvents);

  // 現在のチームメトリクスを取得して予測に使用
  const teamMetrics = await fetchTeamMetrics(supabase, teamId);

  // 負荷予測
  const predictions = predictAvailability(classifiedEvents, teamMetrics);

  return NextResponse.json({
    success: true,
    data: {
      events: classifiedEvents,
      predictions,
      syncStatus: 'connected' as CalendarSyncStatus,
    },
  });
}, { service: 'calendar' });

// ---------------------------------------------------------------------------
// チームメトリクス取得
// ---------------------------------------------------------------------------

/**
 * 現在のチームメトリクスを daily_metrics から集計する。
 * 負荷予測の入力として使用する。
 */
async function fetchTeamMetrics(
  supabase: Awaited<ReturnType<typeof createClient>>,
  teamId: string,
): Promise<TeamMetrics> {
  const today = new Date().toISOString().split('T')[0]!;

  // チームの選手一覧を取得
  const { data: athletes } = await supabase
    .from('athletes')
    .select('id')
    .eq('team_id', teamId);

  const athleteIds = (athletes ?? []).map((a) => a.id as string);

  if (athleteIds.length === 0) {
    return { currentAvailability: 75, currentTeamScore: 65, averageAcwr: 1.0 };
  }

  // 本日のメトリクスを取得
  const { data: metrics } = await supabase
    .from('daily_metrics')
    .select('conditioning_score, acwr, hard_lock')
    .eq('date', today)
    .in('athlete_id', athleteIds);

  const rows = metrics ?? [];

  if (rows.length === 0) {
    return { currentAvailability: 75, currentTeamScore: 65, averageAcwr: 1.0 };
  }

  let availableCount = 0;
  let scoreSum = 0;
  let scoreCount = 0;
  let acwrSum = 0;
  let acwrCount = 0;

  for (const row of rows) {
    const score = row.conditioning_score as number | null;
    const acwr = row.acwr as number | null;
    const hardLock = row.hard_lock === true;

    if (score !== null) {
      scoreSum += score;
      scoreCount++;
      if (score >= 60 && !hardLock) {
        availableCount++;
      }
    }

    if (acwr !== null) {
      acwrSum += acwr;
      acwrCount++;
    }
  }

  const currentAvailability =
    athleteIds.length > 0
      ? Math.round((availableCount / athleteIds.length) * 100 * 10) / 10
      : 75;
  const currentTeamScore =
    scoreCount > 0 ? Math.round((scoreSum / scoreCount) * 10) / 10 : 65;
  const averageAcwr =
    acwrCount > 0 ? Math.round((acwrSum / acwrCount) * 100) / 100 : 1.0;

  return { currentAvailability, currentTeamScore, averageAcwr };
}

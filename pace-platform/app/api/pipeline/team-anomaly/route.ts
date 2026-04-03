/**
 * PACE v6.0 — チーム全体異常検知 API
 *
 * POST /api/pipeline/team-anomaly
 *
 * チーム内の全アスリートの Z-Score を日次でモニタリングし、
 * 80% 以上が同日に Z-Score 異常を示した場合、
 * デバイス/環境の仕様変更と推論してアラートをミュートする。
 *
 * 日次バッチ処理として cron ジョブまたはスタッフ手動で実行。
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateUUID } from '@/lib/security/input-validator';
import { withApiHandler, ApiError } from '@/lib/api/handler';

/** Z-Score 異常閾値 */
const Z_SCORE_ANOMALY_THRESHOLD = -1.5;

/** チーム内異常率の閾値（80%） */
const TEAM_ANOMALY_RATE_THRESHOLD = 0.8;

/** 異常検知時のベースライン再計算期間（日数） */
const RECALIBRATION_DAYS = 3;

interface TeamAnomalyResult {
  teamId: string;
  date: string;
  totalAthletes: number;
  anomalousAthletes: number;
  anomalyRate: number;
  isDeviceAnomaly: boolean;
  affectedMetrics: string[];
  recommendation: string;
}

export const POST = withApiHandler(async (req, ctx) => {
  const supabase = await createClient();

  // ----- 認証チェック -----
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new ApiError(401, '認証が必要です。');
  }

  // ----- スタッフ確認 -----
  const { data: staff, error: staffError } = await supabase
    .from('staff')
    .select('id, org_id')
    .eq('id', user.id)
    .single();

  if (staffError || !staff) {
    throw new ApiError(403, 'スタッフプロファイルが見つかりません。');
  }

  // ----- リクエストボディ -----
  let body: { teamId: string; date?: string };
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, 'リクエストボディのJSONパースに失敗しました。');
  }

  if (!body.teamId || !validateUUID(body.teamId)) {
    throw new ApiError(400, 'teamId は有効なUUIDである必要があります。');
  }

  const targetDate = body.date ?? new Date().toISOString().split('T')[0]!;

  // ----- チーム選手一覧を取得 -----
  const { data: athletes, error: athleteError } = await supabase
    .from('athletes')
    .select('id')
    .eq('team_id', body.teamId)
    .eq('org_id', staff.org_id);

  if (athleteError || !athletes || athletes.length === 0) {
    throw new ApiError(404, 'チームメンバーが見つかりません。');
  }

  const athleteIds = athletes.map((a) => a.id as string);

  // ----- 当日のトレースログを取得 -----
  const { data: traceLogs, error: traceError } = await supabase
    .from('inference_trace_logs')
    .select('athlete_id, inference_snapshot')
    .in('athlete_id', athleteIds)
    .gte('timestamp_utc', `${targetDate}T00:00:00Z`)
    .lt('timestamp_utc', `${targetDate}T23:59:59Z`);

  if (traceError) {
    ctx.log.error('トレースログ取得エラー', { detail: traceError });
    throw new ApiError(500, 'トレースログの取得に失敗しました。');
  }

  if (!traceLogs || traceLogs.length === 0) {
    return NextResponse.json({
      success: true,
      data: {
        teamId: body.teamId,
        date: targetDate,
        totalAthletes: athleteIds.length,
        anomalousAthletes: 0,
        anomalyRate: 0,
        isDeviceAnomaly: false,
        affectedMetrics: [],
        recommendation: '当日のトレースログがありません。',
      } satisfies TeamAnomalyResult,
    });
  }

  // ----- 各選手の Z-Score 異常を検出 -----
  const metricAnomalyCounts: Record<string, number> = {};
  let anomalousAthleteCount = 0;

  for (const log of traceLogs) {
    const snapshot = log.inference_snapshot as Record<string, unknown> | null;
    if (!snapshot) continue;

    const metrics = snapshot.calculatedMetrics as { zScores?: Record<string, number> } | null;
    if (!metrics?.zScores) continue;

    let hasAnomaly = false;
    for (const [metric, zScore] of Object.entries(metrics.zScores)) {
      if (zScore <= Z_SCORE_ANOMALY_THRESHOLD) {
        hasAnomaly = true;
        metricAnomalyCounts[metric] = (metricAnomalyCounts[metric] ?? 0) + 1;
      }
    }

    if (hasAnomaly) {
      anomalousAthleteCount++;
    }
  }

  const anomalyRate = traceLogs.length > 0
    ? anomalousAthleteCount / traceLogs.length
    : 0;

  const isDeviceAnomaly = anomalyRate >= TEAM_ANOMALY_RATE_THRESHOLD;

  // 最も多い異常指標を特定
  const affectedMetrics = Object.entries(metricAnomalyCounts)
    .filter(([, count]) => count >= traceLogs.length * TEAM_ANOMALY_RATE_THRESHOLD)
    .map(([metric]) => metric)
    .sort();

  const recommendation = isDeviceAnomaly
    ? `チームの ${Math.round(anomalyRate * 100)}% で同日に Z-Score 異常が検出されました。デバイスまたは環境の変更が疑われます。${RECALIBRATION_DAYS} 日間のベースライン再計算を推奨します。対象指標: ${affectedMetrics.join(', ')}`
    : anomalousAthleteCount > 0
      ? `${anomalousAthleteCount} 名のアスリートに個別の Z-Score 異常が検出されました。個別フォローを推奨します。`
      : 'チーム全体のコンディションは正常範囲です。';

  const result: TeamAnomalyResult = {
    teamId: body.teamId,
    date: targetDate,
    totalAthletes: athleteIds.length,
    anomalousAthletes: anomalousAthleteCount,
    anomalyRate,
    isDeviceAnomaly,
    affectedMetrics,
    recommendation,
  };

  return NextResponse.json({ success: true, data: result });
}, { service: 'pipeline' });

/**
 * PACE Platform — スタッフダッシュボード集約 API
 *
 * GET /api/team/dashboard?team_id=xxx
 *
 * ダッシュボードに必要なすべてのデータを一括で返す:
 * - KPI (critical, availability, conditioning, watchlist)
 * - 14日間 ACWR トレンド
 * - 14日間 コンディショントレンド
 * - アラートアクションリスト
 * - AI リスク回避レポート
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withApiHandler, ApiError } from '@/lib/api/handler';
import { MemoryCache } from '@/lib/cache/memory-cache';
import { validateUUID } from '@/lib/security/input-validator';

// ---------------------------------------------------------------------------
// ダッシュボードキャッシュ（60秒 TTL）
// MDT ミーティング中に同一ダッシュボードを複数スタッフが閲覧する際の DB 負荷軽減
// ---------------------------------------------------------------------------
const dashboardCache = new MemoryCache<DashboardResponse['data']>({
  defaultTTL: 60,
  maxEntries: 50,
});

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface AlertItem {
  id: string;
  athleteId: string;
  athleteName: string;
  priority: 'critical' | 'watchlist';
  reason: string;
  actionHref: string;
}

interface RiskPreventionReport {
  id: string;
  athleteName: string;
  description: string;
  timestamp: string;
}

interface AcwrDataPoint {
  date: string;
  acwr: number;
}

interface ConditioningDataPoint {
  date: string;
  score: number;
}

interface KpiMeta {
  criticalSparkline: number[];
  availabilitySparkline: number[];
  conditioningSparkline: number[];
  watchlistSparkline: number[];
  peakingSparkline: number[];
  dod: { critical: number; availability: number; conditioning: number; watchlist: number; peaking: number };
  wow: { critical: number; availability: number; conditioning: number; watchlist: number; peaking: number };
}

interface DashboardResponse {
  success: true;
  data: {
    kpi: {
      criticalAlerts: number;
      availability: string;
      conditioningScore: number;
      watchlistCount: number;
      peakingRate: number;
    };
    kpiMeta: KpiMeta;
    orgId: string;
    planId: string;
    acwrTrend: AcwrDataPoint[];
    conditioningTrend: ConditioningDataPoint[];
    alerts: AlertItem[];
    riskReports: RiskPreventionReport[];
  };
}

interface ErrorResponse {
  success: false;
  error: string;
}

// ---------------------------------------------------------------------------
// GET /api/team/dashboard
// ---------------------------------------------------------------------------

export const GET = withApiHandler(async (request, ctx) => {
  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get('team_id');

  if (!teamId) {
    throw new ApiError(400, 'team_id クエリパラメータは必須です。');
  }

  // UUID 形式バリデーション
  if (!validateUUID(teamId)) {
    throw new ApiError(400, 'team_id の形式が不正です。');
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new ApiError(401, '認証が必要です。');
  }

  // Verify team access
  const { data: team, error: teamError } = await supabase
    .from('teams')
    .select('id, org_id')
    .eq('id', teamId)
    .single();

  if (teamError || !team) {
    throw new ApiError(403, 'チームが見つかりません。');
  }

  // IDOR 防止: ユーザーの組織がチームの組織と一致することを検証
  const { data: userStaff, error: staffError } = await supabase
    .from('staff')
    .select('org_id, role, team_id')
    .eq('id', user.id)
    .single();

  if (staffError || !userStaff) {
    throw new ApiError(403, 'スタッフ情報が見つかりません。');
  }

  if ((userStaff.org_id as string) !== (team.org_id as string)) {
    throw new ApiError(403, 'このチームへのアクセス権がありません。');
  }

  const orgId = (team.org_id as string) ?? '';

  // プラン情報取得（フロント側ゲート判定用）
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('plan')
    .eq('org_id', orgId)
    .single();
  const planId = (subscription?.plan as string) ?? 'standard';

  // キャッシュチェック
  const cacheKey = `dashboard:${teamId}`;
  const cached = dashboardCache.get(cacheKey);
  if (cached) {
    return NextResponse.json({ success: true, data: cached } as DashboardResponse);
  }

  const today = new Date().toISOString().split('T')[0]!;
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const dateFrom = fourteenDaysAgo.toISOString().split('T')[0]!;

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const dateFrom7 = sevenDaysAgo.toISOString().split('T')[0]!;

  // --- Parallel fetches ---
  const [
    athleteIdsResult,
    metricsResult,
    acwrTrendResult,
    condTrendResult,
    alertsResult,
    riskResult,
    sparklineMetricsResult,
  ] = await Promise.all([
    // 1. Athlete IDs for this team
    supabase.from('athletes').select('id, name').eq('team_id', teamId),

    // 2. Today's metrics
    supabase
      .from('daily_metrics')
      .select('athlete_id, conditioning_score, acwr, nrs, hard_lock, soft_lock')
      .eq('date', today),

    // 3. 14-day ACWR trend (team average per day)
    supabase
      .from('daily_metrics')
      .select('date, acwr')
      .eq('team_id', teamId)
      .gte('date', dateFrom)
      .order('date', { ascending: true }),

    // 4. 14-day conditioning trend
    supabase
      .from('daily_metrics')
      .select('date, conditioning_score')
      .eq('team_id', teamId)
      .gte('date', dateFrom)
      .order('date', { ascending: true }),

    // 5. Active alerts
    supabase
      .from('athlete_alerts')
      .select('id, athlete_id, athlete_name, priority, reason')
      .eq('team_id', teamId)
      .eq('resolved', false)
      .in('priority', ['critical', 'watchlist'])
      .order('priority', { ascending: true })
      .limit(20),

    // 6. Risk prevention logs (last 24h)
    supabase
      .from('risk_prevention_logs')
      .select('id, athlete_name, description, created_at')
      .eq('team_id', teamId)
      .eq('type', 'hard_lock')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(5),

    // 7. 7-day daily metrics for sparkline + DoD/WoW
    supabase
      .from('daily_metrics')
      .select('date, athlete_id, conditioning_score, acwr, nrs, hard_lock, soft_lock')
      .eq('team_id', teamId)
      .gte('date', dateFrom7)
      .order('date', { ascending: true }),
  ]);

  const athleteRows = athleteIdsResult.data ?? [];
  const athleteIds = new Set(athleteRows.map((a) => a.id as string));
  const metricsRows = (metricsResult.data ?? []).filter((m) =>
    athleteIds.has(m.athlete_id as string),
  );

  // --- KPI calculations ---
  let criticalCount = 0;
  let watchlistCount = 0;
  let availableCount = 0;
  let scoreSum = 0;
  let scoreCount = 0;

  for (const m of metricsRows) {
    const score = m.conditioning_score as number | null;
    const nrs = m.nrs as number | null;
    const hardLock = m.hard_lock === true;
    const softLock = m.soft_lock === true;
    const acwr = m.acwr as number | null;

    if (score !== null) {
      scoreSum += score;
      scoreCount++;
    }

    if (score !== null && (score < 30 || (nrs !== null && nrs >= 7) || hardLock)) {
      criticalCount++;
    } else if (
      score !== null &&
      ((score >= 30 && score < 50) || (acwr !== null && acwr > 1.5) || softLock)
    ) {
      watchlistCount++;
    } else if (score !== null && score >= 60 && !hardLock) {
      availableCount++;
    } else if (score !== null) {
      watchlistCount++;
    }
  }

  const conditioningScore =
    scoreCount > 0 ? Math.round((scoreSum / scoreCount) * 10) / 10 : 0;

  // --- Peaking Rate (Readiness >= 80) ---
  let peakingCount = 0;
  for (const m of metricsRows) {
    const score = m.conditioning_score as number | null;
    if (score !== null && score >= 80) peakingCount++;
  }
  const peakingRate =
    metricsRows.length > 0
      ? Math.round((peakingCount / metricsRows.length) * 100)
      : 0;

  // --- 7-day sparkline computation ---
  const sparklineRows = (sparklineMetricsResult.data ?? []).filter((m) =>
    athleteIds.has(m.athlete_id as string),
  );

  // Group 7-day metrics by date
  const dailyKpis = new Map<string, {
    critical: number; available: number; total: number;
    scoreSum: number; scoreCount: number; watchlist: number; peaking: number;
  }>();

  for (const m of sparklineRows) {
    const d = m.date as string;
    const entry = dailyKpis.get(d) ?? {
      critical: 0, available: 0, total: 0,
      scoreSum: 0, scoreCount: 0, watchlist: 0, peaking: 0,
    };
    entry.total++;
    const score = m.conditioning_score as number | null;
    const nrs = m.nrs as number | null;
    const hardLock = m.hard_lock === true;
    const softLock = m.soft_lock === true;
    const acwr = m.acwr as number | null;

    if (score !== null) {
      entry.scoreSum += score;
      entry.scoreCount++;
      if (score >= 80) entry.peaking++;
    }
    if (score !== null && (score < 30 || (nrs !== null && nrs >= 7) || hardLock)) {
      entry.critical++;
    } else if (score !== null && ((score >= 30 && score < 50) || (acwr !== null && acwr > 1.5) || softLock)) {
      entry.watchlist++;
    } else if (score !== null && score >= 60 && !hardLock) {
      entry.available++;
    } else if (score !== null) {
      entry.watchlist++;
    }
    dailyKpis.set(d, entry);
  }

  const sortedDates = Array.from(dailyKpis.keys()).sort();
  const criticalSparkline = sortedDates.map((d) => dailyKpis.get(d)!.critical);
  const availabilitySparkline = sortedDates.map((d) => {
    const e = dailyKpis.get(d)!;
    return e.total > 0 ? Math.round((e.available / e.total) * 100) : 0;
  });
  const conditioningSparkline = sortedDates.map((d) => {
    const e = dailyKpis.get(d)!;
    return e.scoreCount > 0 ? Math.round(e.scoreSum / e.scoreCount) : 0;
  });
  const watchlistSparkline = sortedDates.map((d) => dailyKpis.get(d)!.watchlist);
  const peakingSparkline = sortedDates.map((d) => {
    const e = dailyKpis.get(d)!;
    return e.scoreCount > 0 ? Math.round((e.peaking / e.scoreCount) * 100) : 0;
  });

  // DoD (day-over-day) / WoW (week-over-week) computation
  function computeDelta(sparkline: number[]): { dod: number; wow: number } {
    const len = sparkline.length;
    const dod = len >= 2 ? sparkline[len - 1]! - sparkline[len - 2]! : 0;
    const wow = len >= 7 ? sparkline[len - 1]! - sparkline[0]! : 0;
    return { dod, wow };
  }

  const criticalDelta = computeDelta(criticalSparkline);
  const availDelta = computeDelta(availabilitySparkline);
  const condDelta = computeDelta(conditioningSparkline);
  const watchDelta = computeDelta(watchlistSparkline);
  const peakDelta = computeDelta(peakingSparkline);

  const kpiMeta: KpiMeta = {
    criticalSparkline,
    availabilitySparkline,
    conditioningSparkline,
    watchlistSparkline,
    peakingSparkline,
    dod: {
      critical: criticalDelta.dod,
      availability: availDelta.dod,
      conditioning: condDelta.dod,
      watchlist: watchDelta.dod,
      peaking: peakDelta.dod,
    },
    wow: {
      critical: criticalDelta.wow,
      availability: availDelta.wow,
      conditioning: condDelta.wow,
      watchlist: watchDelta.wow,
      peaking: peakDelta.wow,
    },
  };

  // --- Aggregate ACWR trend by date ---
  const acwrByDate = new Map<string, { sum: number; count: number }>();
  for (const row of acwrTrendResult.data ?? []) {
    const d = row.date as string;
    const v = row.acwr as number | null;
    if (v === null) continue;
    const entry = acwrByDate.get(d) ?? { sum: 0, count: 0 };
    entry.sum += v;
    entry.count++;
    acwrByDate.set(d, entry);
  }
  const acwrTrend: AcwrDataPoint[] = Array.from(acwrByDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { sum, count }]) => ({
      date: date.slice(5), // "MM-DD"
      acwr: Math.round((sum / count) * 100) / 100,
    }));

  // --- Aggregate conditioning trend by date ---
  const condByDate = new Map<string, { sum: number; count: number }>();
  for (const row of condTrendResult.data ?? []) {
    const d = row.date as string;
    const v = row.conditioning_score as number | null;
    if (v === null) continue;
    const entry = condByDate.get(d) ?? { sum: 0, count: 0 };
    entry.sum += v;
    entry.count++;
    condByDate.set(d, entry);
  }
  const conditioningTrend: ConditioningDataPoint[] = Array.from(
    condByDate.entries(),
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { sum, count }]) => ({
      date: date.slice(5),
      score: Math.round((sum / count) * 10) / 10,
    }));

  // --- Alerts ---
  const alerts: AlertItem[] = (alertsResult.data ?? []).map((row) => ({
    id: row.id as string,
    athleteId: row.athlete_id as string,
    athleteName: row.athlete_name as string,
    priority: row.priority as 'critical' | 'watchlist',
    reason: row.reason as string,
    actionHref: `/athletes/${row.athlete_id}`,
  }));

  // --- Risk reports ---
  const riskReports: RiskPreventionReport[] = (riskResult.data ?? []).map(
    (row) => ({
      id: row.id as string,
      athleteName: row.athlete_name as string,
      description: row.description as string,
      timestamp: new Date(row.created_at as string).toLocaleString('ja-JP', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    }),
  );

  const dashboardData: DashboardResponse['data'] = {
    kpi: {
      criticalAlerts: criticalCount,
      availability: `${availableCount}/${athleteRows.length}`,
      conditioningScore,
      watchlistCount,
      peakingRate,
    },
    kpiMeta,
    orgId,
    planId,
    acwrTrend,
    conditioningTrend,
    alerts,
    riskReports,
  };

  // キャッシュに保存（60秒 TTL）
  dashboardCache.set(cacheKey, dashboardData);

  return NextResponse.json({
    success: true,
    data: dashboardData,
  });
}, { service: 'team' });

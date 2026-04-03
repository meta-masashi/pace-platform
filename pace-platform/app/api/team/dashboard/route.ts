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

interface LoadConcentrationItem {
  name: string;
  percent: number;
}

interface TeamLoadSummary {
  avgAcwr: number;
  avgMonotony: number;
  loadConcentration: LoadConcentrationItem[];
  concentrationTotal: number;
}

interface AttentionAthlete {
  athleteId: string;
  name: string;
  number: string;
  position: string;
  priority: string;
  decision: string;
  reason: string;
  metrics: {
    acwr: number;
    monotony: number;
    nrs: number;
    fatigue: number;
    sleepScore: number;
    srpe: number;
  };
  sparkline: number[];
}

interface RehabAthlete {
  athleteId: string;
  name: string;
  number: string;
  position: string;
  diagnosis: string;
  currentPhase: number;
  totalPhases: number;
  daysSinceInjury: number;
  recoveryScore: number;
  nrsCurrent: number;
  nrsPrevious: number;
}

interface DashboardResponse {
  success: true;
  data: {
    kpi: {
      criticalAlerts: number;
      availability: string;
      conditioningScore: number;
      watchlistCount: number;
    };
    acwrTrend: AcwrDataPoint[];
    conditioningTrend: ConditioningDataPoint[];
    alerts: AlertItem[];
    riskReports: RiskPreventionReport[];
    teamLoadSummary: TeamLoadSummary;
    attentionAthletes: AttentionAthlete[];
    rehabAthletes: RehabAthlete[];
  };
}

interface ErrorResponse {
  success: false;
  error: string;
}

// ---------------------------------------------------------------------------
// GET /api/team/dashboard
// ---------------------------------------------------------------------------

export async function GET(
  request: Request,
): Promise<NextResponse<DashboardResponse | ErrorResponse>> {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('team_id');

    if (!teamId) {
      return NextResponse.json(
        { success: false, error: 'team_id クエリパラメータは必須です。' },
        { status: 400 },
      );
    }

    // UUID 形式バリデーション
    if (!validateUUID(teamId)) {
      return NextResponse.json(
        { success: false, error: 'team_id の形式が不正です。' },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: '認証が必要です。' },
        { status: 401 },
      );
    }

    // Verify team access
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('id')
      .eq('id', teamId)
      .single();

    if (teamError || !team) {
      return NextResponse.json(
        { success: false, error: 'チームが見つかりません。' },
        { status: 403 },
      );
    }

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
      metricsLast7Result,
      traceLogsResult,
      rehabProgramsResult,
    ] = await Promise.all([
      // 1. Athlete IDs for this team
      supabase.from('athletes').select('id, name, position, number').eq('team_id', teamId),

      // 2. Today's metrics
      supabase
        .from('daily_metrics')
        .select('athlete_id, conditioning_score, acwr, nrs, hard_lock, soft_lock, srpe, fatigue_subjective, sleep_score')
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

      // 7. Last 7 days metrics per athlete (for monotony + sparkline)
      supabase
        .from('daily_metrics')
        .select('athlete_id, date, srpe, acwr')
        .eq('team_id', teamId)
        .gte('date', dateFrom7)
        .order('date', { ascending: true }),

      // 8. Today's inference trace logs (for attention athletes)
      supabase
        .from('inference_trace_logs')
        .select('athlete_id, athlete_name, decision, priority, inference_snapshot')
        .gte('timestamp_utc', `${today}T00:00:00Z`)
        .lte('timestamp_utc', `${today}T23:59:59Z`)
        .in('decision', ['RED', 'ORANGE', 'YELLOW']),

      // 9. Active rehab programs
      supabase
        .from('rehab_programs')
        .select(`
          id,
          athlete_id,
          diagnosis_code,
          current_phase,
          status,
          start_date,
          estimated_rtp_date,
          rehab_phase_gates (
            phase,
            gate_met_at
          )
        `)
        .eq('status', 'active'),
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

    // --- Team Load Summary ---
    // avgAcwr: average ACWR from today's metrics
    const acwrValues = metricsRows
      .map((m) => m.acwr as number | null)
      .filter((v): v is number => v !== null);
    const avgAcwr =
      acwrValues.length > 0
        ? Math.round((acwrValues.reduce((a, b) => a + b, 0) / acwrValues.length) * 100) / 100
        : 0;

    // avgMonotony: per athlete, compute mean/SD of 7-day sRPE, then average
    const last7Rows = (metricsLast7Result.data ?? []).filter((m) =>
      athleteIds.has(m.athlete_id as string),
    );
    const athleteSrpeMap = new Map<string, number[]>();
    for (const row of last7Rows) {
      const aid = row.athlete_id as string;
      const srpe = row.srpe as number | null;
      if (srpe === null) continue;
      const arr = athleteSrpeMap.get(aid) ?? [];
      arr.push(srpe);
      athleteSrpeMap.set(aid, arr);
    }
    let monotonySum = 0;
    let monotonyCount = 0;
    for (const [, loads] of athleteSrpeMap) {
      if (loads.length < 2) continue;
      const mean = loads.reduce((a, b) => a + b, 0) / loads.length;
      const variance = loads.reduce((a, b) => a + (b - mean) ** 2, 0) / loads.length;
      const sd = Math.sqrt(variance);
      if (sd > 0) {
        monotonySum += mean / sd;
        monotonyCount++;
      }
    }
    const avgMonotony =
      monotonyCount > 0
        ? Math.round((monotonySum / monotonyCount) * 100) / 100
        : 0;

    // loadConcentration: top 3 athletes by sRPE share
    const athleteNameMap = new Map(
      athleteRows.map((a) => [a.id as string, a.name as string]),
    );
    const todaySrpeByAthlete: { name: string; srpe: number }[] = [];
    let totalSrpe = 0;
    for (const m of metricsRows) {
      const srpe = m.srpe as number | null;
      if (srpe === null || srpe === 0) continue;
      totalSrpe += srpe;
      todaySrpeByAthlete.push({
        name: athleteNameMap.get(m.athlete_id as string) ?? '',
        srpe,
      });
    }
    todaySrpeByAthlete.sort((a, b) => b.srpe - a.srpe);
    const loadConcentration: LoadConcentrationItem[] = todaySrpeByAthlete
      .slice(0, 3)
      .map((item) => ({
        name: item.name,
        percent:
          totalSrpe > 0
            ? Math.round((item.srpe / totalSrpe) * 1000) / 10
            : 0,
      }));
    const concentrationTotal = loadConcentration.reduce(
      (sum, item) => sum + item.percent,
      0,
    );

    const teamLoadSummary: TeamLoadSummary = {
      avgAcwr,
      avgMonotony,
      loadConcentration,
      concentrationTotal: Math.round(concentrationTotal * 10) / 10,
    };

    // --- Attention Athletes ---
    const athleteInfoMap = new Map(
      athleteRows.map((a) => [
        a.id as string,
        {
          name: a.name as string,
          number: String(a.number ?? ''),
          position: (a.position as string) ?? '',
        },
      ]),
    );

    // Build 7-day ACWR sparkline per athlete
    const athleteAcwrSparkline = new Map<string, number[]>();
    for (const row of last7Rows) {
      const aid = row.athlete_id as string;
      const acwrVal = row.acwr as number | null;
      if (acwrVal === null) continue;
      const arr = athleteAcwrSparkline.get(aid) ?? [];
      arr.push(Math.round(acwrVal * 100) / 100);
      athleteAcwrSparkline.set(aid, arr);
    }

    // Build today's metrics lookup
    const todayMetricsMap = new Map(
      metricsRows.map((m) => [m.athlete_id as string, m]),
    );

    const traceRows = (traceLogsResult.data ?? []).filter((t) =>
      athleteIds.has(t.athlete_id as string),
    );
    // Deduplicate: keep latest per athlete (last entry wins since order is not guaranteed)
    const traceByAthlete = new Map<string, Record<string, unknown>>();
    for (const t of traceRows) {
      traceByAthlete.set(t.athlete_id as string, t as Record<string, unknown>);
    }

    const attentionAthletes: AttentionAthlete[] = [];
    for (const [athleteId, trace] of traceByAthlete) {
      const info = athleteInfoMap.get(athleteId);
      if (!info) continue;
      const todayM = todayMetricsMap.get(athleteId);

      // Monotony for this athlete
      const loads = athleteSrpeMap.get(athleteId) ?? [];
      let athleteMonotony = 0;
      if (loads.length >= 2) {
        const mean = loads.reduce((a, b) => a + b, 0) / loads.length;
        const variance = loads.reduce((a, b) => a + (b - mean) ** 2, 0) / loads.length;
        const sd = Math.sqrt(variance);
        if (sd > 0) athleteMonotony = Math.round((mean / sd) * 100) / 100;
      }

      const snapshot = trace.inference_snapshot as Record<string, unknown> | null;
      const reason =
        (snapshot?.reason as string) ??
        (snapshot?.summary as string) ??
        `${trace.decision} — ${trace.priority}`;

      attentionAthletes.push({
        athleteId,
        name: info.name,
        number: info.number,
        position: info.position,
        priority: (trace.priority as string) ?? '',
        decision: (trace.decision as string) ?? '',
        reason,
        metrics: {
          acwr: todayM ? ((todayM.acwr as number) ?? 0) : 0,
          monotony: athleteMonotony,
          nrs: todayM ? ((todayM.nrs as number) ?? 0) : 0,
          fatigue: todayM ? ((todayM.fatigue_subjective as number) ?? 0) : 0,
          sleepScore: todayM ? ((todayM.sleep_score as number) ?? 0) : 0,
          srpe: todayM ? ((todayM.srpe as number) ?? 0) : 0,
        },
        sparkline: athleteAcwrSparkline.get(athleteId) ?? [],
      });
    }

    // Sort by priority (P1 first)
    const priorityOrder: Record<string, number> = {
      P1_SAFETY: 0,
      P2_MECHANICAL_RISK: 1,
      P3_OVERLOAD: 2,
      P4_RECOVERY: 3,
      P5_OPTIMAL: 4,
    };
    attentionAthletes.sort(
      (a, b) => (priorityOrder[a.priority] ?? 5) - (priorityOrder[b.priority] ?? 5),
    );

    // --- Rehab Athletes ---
    const rehabRows = (rehabProgramsResult.data ?? []).filter((r) =>
      athleteIds.has(r.athlete_id as string),
    );

    // Fetch yesterday's NRS for rehab athletes (for nrsPrevious)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0]!;
    const rehabAthleteIds = rehabRows.map((r) => r.athlete_id as string);
    const yesterdayMetricsMap = new Map<string, number>();
    if (rehabAthleteIds.length > 0) {
      const { data: yesterdayData } = await supabase
        .from('daily_metrics')
        .select('athlete_id, nrs')
        .eq('date', yesterdayStr)
        .in('athlete_id', rehabAthleteIds);
      for (const row of yesterdayData ?? []) {
        yesterdayMetricsMap.set(
          row.athlete_id as string,
          (row.nrs as number) ?? 0,
        );
      }
    }

    const rehabAthletes: RehabAthlete[] = rehabRows.map((program) => {
      const athleteId = program.athlete_id as string;
      const info = athleteInfoMap.get(athleteId);
      const todayM = todayMetricsMap.get(athleteId);

      const currentPhase = Number(program.current_phase ?? 1);
      const gates = (program.rehab_phase_gates ?? []) as Array<
        Record<string, unknown>
      >;
      const totalPhases = Math.max(
        currentPhase,
        ...gates.map((g) => Number(g.phase ?? 0)),
        5, // default 5-phase rehab
      );

      const startDate = new Date(program.start_date as string);
      const daysSinceInjury = Math.max(
        0,
        Math.floor((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24)),
      );

      // Recovery score: phase progression percentage
      const recoveryScore = Math.round((currentPhase / totalPhases) * 100);

      const nrsCurrent = todayM ? ((todayM.nrs as number) ?? 0) : 0;
      const nrsPrevious = yesterdayMetricsMap.get(athleteId) ?? 0;

      return {
        athleteId,
        name: info?.name ?? '',
        number: info?.number ?? '',
        position: info?.position ?? '',
        diagnosis: (program.diagnosis_code as string) ?? '',
        currentPhase,
        totalPhases,
        daysSinceInjury,
        recoveryScore,
        nrsCurrent,
        nrsPrevious,
      };
    });

    const dashboardData: DashboardResponse['data'] = {
      kpi: {
        criticalAlerts: criticalCount,
        availability: `${availableCount}/${athleteRows.length}`,
        conditioningScore,
        watchlistCount,
      },
      acwrTrend,
      conditioningTrend,
      alerts,
      riskReports,
      teamLoadSummary,
      attentionAthletes,
      rehabAthletes,
    };

    // キャッシュに保存（60秒 TTL）
    dashboardCache.set(cacheKey, dashboardData);

    return NextResponse.json({
      success: true,
      data: dashboardData,
    });
  } catch (err) {
    console.error('[team/dashboard] 予期しないエラー:', err);
    return NextResponse.json(
      { success: false, error: 'サーバー内部エラーが発生しました。' },
      { status: 500 },
    );
  }
}

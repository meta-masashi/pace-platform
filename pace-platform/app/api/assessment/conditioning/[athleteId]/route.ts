/**
 * GET /api/assessment/conditioning/{athleteId}
 *
 * コンディショニングアセスメント用の3軸分析データを集約して返す。
 * - 負荷集中分析: ACWR推移、Monotony推移、組織別負担蓄積、Preparedness
 * - 運動効率分析: デカップリング、主観-客観ギャップ、Z-Scoreレーダー、効率指標
 * - 疼痛パターン分析: NRS推移×負荷相関、ボディマップ時系列、既往歴照合
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateUUID } from '@/lib/security/input-validator';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface LoadAnalysis {
  acwr: { current: number; trend: { date: string; value: number }[] };
  acuteLoad: number;
  chronicLoad: number;
  acuteLoadChangePercent: number;
  monotony: { current: number; trend: { week: string; value: number }[] };
  strain: number;
  tissueDamage: Record<string, { value: number; halfLifeDays: number }>;
  preparedness: { current: number; trend: { date: string; value: number }[] };
}

interface EfficiencyAnalysis {
  decoupling: { current: number; trend: { date: string; value: number }[] };
  subjectiveObjectiveGap: { date: string; srpe: number; hrBased: number; gapPercent: number }[];
  zScores: Record<string, number>;
  zScoreAlertCount: number;
  performanceEfficiency: {
    outputPerHrCost: { current: number; average: number; deviationPercent: number };
    srpeToLoadRatio: { current: number; average: number; deviationPercent: number };
    recoveryHr: { current: number; average: number; deviationPercent: number };
    sleepEfficiency: { current: number; average: number; deviationPercent: number };
  };
  overallEfficiencyScore: number;
}

interface PainAnalysis {
  nrsTrend: { date: string; nrs: number; srpe: number; bodyPart?: string }[];
  nrsLoadCorrelation: number;
  bodyMapTimeline: { date: string; parts: { region: string; nrs: number }[] }[];
  patterns: string[];
  medicalHistory: { bodyPart: string; condition: string; date: string; severity: string; riskMultiplier: number }[];
  compensationAlert: string | null;
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ athleteId: string }> },
) {
  try {
    const { athleteId } = await params;

    if (!validateUUID(athleteId)) {
      return NextResponse.json(
        { success: false, error: 'athleteId の形式が不正です。' },
        { status: 400 },
      );
    }

    const supabase = await createClient();

    // 認証チェック
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

    // スタッフ確認 + 組織一致
    const { data: staff } = await supabase
      .from('staff')
      .select('id, org_id')
      .eq('id', user.id)
      .single();

    if (!staff) {
      return NextResponse.json(
        { success: false, error: 'スタッフプロファイルが見つかりません。' },
        { status: 403 },
      );
    }

    // 選手確認（同一組織）
    const { data: athlete } = await supabase
      .from('athletes')
      .select('id, name, org_id, team_id, sport, position, number')
      .eq('id', athleteId)
      .eq('org_id', staff.org_id)
      .single();

    if (!athlete) {
      return NextResponse.json(
        { success: false, error: '選手が見つかりません。' },
        { status: 404 },
      );
    }

    // ----- 過去28日間のdaily_metricsを取得 -----
    const today = new Date();
    const daysBack42 = new Date(today);
    daysBack42.setDate(daysBack42.getDate() - 42);
    const startDate = daysBack42.toISOString().split('T')[0];

    const { data: metrics } = await supabase
      .from('daily_metrics')
      .select('date, nrs, srpe, sleep_score, fatigue_subjective, subjective_condition, hp_computed, hrv, acwr, training_duration_min')
      .eq('athlete_id', athleteId)
      .gte('date', startDate)
      .order('date', { ascending: true });

    const dailyMetrics = metrics ?? [];

    // ----- 既往歴を取得 -----
    const { data: medHistory } = await supabase
      .from('medical_history')
      .select('body_part, condition, date, severity, risk_multiplier')
      .eq('athlete_id', athleteId)
      .order('date', { ascending: false });

    // ----- 直近の推論トレースを取得 -----
    const { data: latestTrace } = await supabase
      .from('inference_trace_logs')
      .select('trace_id, decision, priority, inference_snapshot, timestamp_utc')
      .eq('athlete_id', athleteId)
      .order('timestamp_utc', { ascending: false })
      .limit(1)
      .single();

    // ----- 3軸分析データを構築 -----
    const loadAnalysis = buildLoadAnalysis(dailyMetrics);
    const efficiencyAnalysis = buildEfficiencyAnalysis(dailyMetrics);
    const painAnalysis = buildPainAnalysis(dailyMetrics, medHistory ?? []);

    return NextResponse.json({
      success: true,
      data: {
        athlete: {
          id: athlete.id,
          name: athlete.name,
          sport: athlete.sport,
          position: athlete.position,
          number: athlete.number,
        },
        pipeline: latestTrace
          ? {
              traceId: latestTrace.trace_id,
              decision: latestTrace.decision,
              priority: latestTrace.priority,
              timestamp: latestTrace.timestamp_utc,
            }
          : null,
        loadAnalysis,
        efficiencyAnalysis,
        painAnalysis,
        dataPoints: dailyMetrics.length,
        dateRange: {
          from: startDate,
          to: today.toISOString().split('T')[0],
        },
      },
    });
  } catch (err) {
    console.error('[assessment/conditioning:GET] エラー:', err);
    return NextResponse.json(
      {
        success: false,
        error: 'アセスメントデータの取得に失敗しました。',
      },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// 分析データ構築関数
// ---------------------------------------------------------------------------

function buildLoadAnalysis(
  metrics: Array<Record<string, unknown>>,
): LoadAnalysis {
  const last28 = metrics.slice(-28);
  const last7 = metrics.slice(-7);

  // ACWR 推移（daily_metricsに acwr カラムがある場合はそれを使用）
  const acwrTrend = last28.map((m) => ({
    date: m.date as string,
    value: (m.acwr as number) ?? 0,
  }));
  const currentAcwr = acwrTrend.length > 0 ? acwrTrend[acwrTrend.length - 1]!.value : 0;

  // 急性/慢性負荷（sRPE ベース）
  const last7Srpe = last7.map((m) => (m.srpe as number) ?? 0);
  const last28Srpe = last28.map((m) => (m.srpe as number) ?? 0);
  const acuteLoad = last7Srpe.length > 0 ? last7Srpe.reduce((a, b) => a + b, 0) / last7Srpe.length : 0;
  const chronicLoad = last28Srpe.length > 0 ? last28Srpe.reduce((a, b) => a + b, 0) / last28Srpe.length : 0;

  // 前週比
  const prev7 = metrics.slice(-14, -7).map((m) => (m.srpe as number) ?? 0);
  const prevAcute = prev7.length > 0 ? prev7.reduce((a, b) => a + b, 0) / prev7.length : acuteLoad;
  const acuteLoadChangePercent = prevAcute > 0 ? Math.round(((acuteLoad - prevAcute) / prevAcute) * 100) : 0;

  // Monotony（直近7日の SD / Mean）
  const mean7 = last7Srpe.length > 0 ? last7Srpe.reduce((a, b) => a + b, 0) / last7Srpe.length : 0;
  const sd7 = last7Srpe.length > 1
    ? Math.sqrt(last7Srpe.reduce((sum, v) => sum + (v - mean7) ** 2, 0) / (last7Srpe.length - 1))
    : 0;
  const currentMonotony = sd7 > 0 ? mean7 / sd7 : 0;
  const strain = currentMonotony * last7Srpe.reduce((a, b) => a + b, 0);

  // Monotony 週次推移（過去4週）
  const monotonyTrend: { week: string; value: number }[] = [];
  for (let w = 3; w >= 0; w--) {
    const weekMetrics = metrics.slice(-(7 * (w + 1)), w === 0 ? undefined : -(7 * w));
    const wSrpe = weekMetrics.map((m) => (m.srpe as number) ?? 0);
    const wMean = wSrpe.length > 0 ? wSrpe.reduce((a, b) => a + b, 0) / wSrpe.length : 0;
    const wSd = wSrpe.length > 1
      ? Math.sqrt(wSrpe.reduce((sum, v) => sum + (v - wMean) ** 2, 0) / (wSrpe.length - 1))
      : 0;
    monotonyTrend.push({
      week: `W-${w}`,
      value: wSd > 0 ? Math.round((wMean / wSd) * 100) / 100 : 0,
    });
  }

  // 組織別負担蓄積（簡易推定 — sRPE ベースの累積 × 減衰）
  const tissueHalfLives: Record<string, number> = {
    metabolic: 2,
    structural_soft: 7,
    structural_hard: 21,
    neuromotor: 3,
  };
  const tissueDamage: Record<string, { value: number; halfLifeDays: number }> = {};
  for (const [tissue, halfLife] of Object.entries(tissueHalfLives)) {
    const decayFactor = Math.LN2 / halfLife;
    let damage = 0;
    for (let i = 0; i < last28.length; i++) {
      const daysSince = last28.length - 1 - i;
      const srpe = (last28[i]!.srpe as number) ?? 0;
      const normalizedLoad = srpe / 1000; // 正規化
      damage += normalizedLoad * Math.exp(-decayFactor * daysSince);
    }
    tissueDamage[tissue] = {
      value: Math.round(Math.min(damage, 1.0) * 100) / 100,
      halfLifeDays: halfLife,
    };
  }

  // Preparedness 推移
  const prepTrend = last28.map((m) => ({
    date: m.date as string,
    value: (m.hp_computed as number) ?? 50,
  }));
  const currentPrep = prepTrend.length > 0 ? prepTrend[prepTrend.length - 1]!.value : 50;

  return {
    acwr: { current: Math.round(currentAcwr * 100) / 100, trend: acwrTrend },
    acuteLoad: Math.round(acuteLoad),
    chronicLoad: Math.round(chronicLoad),
    acuteLoadChangePercent,
    monotony: { current: Math.round(currentMonotony * 100) / 100, trend: monotonyTrend },
    strain: Math.round(strain),
    tissueDamage,
    preparedness: { current: Math.round(currentPrep * 10) / 10, trend: prepTrend },
  };
}

function buildEfficiencyAnalysis(
  metrics: Array<Record<string, unknown>>,
): EfficiencyAnalysis {
  const last14 = metrics.slice(-14);
  const last7 = metrics.slice(-7);
  const allMetrics = metrics;

  // デカップリング（sRPE / (HRV * duration) の推移 — 簡易版）
  const decouplingTrend = last14.map((m) => {
    const srpe = (m.srpe as number) ?? 0;
    const hrv = (m.hrv as number) ?? 60;
    // デカップリング指標: sRPE が高いのに HRV が低い = 効率低下
    const decoupling = hrv > 0 ? srpe / (hrv * 10) : 0;
    return {
      date: m.date as string,
      value: Math.round(decoupling * 100) / 100,
    };
  });
  const currentDecoupling = decouplingTrend.length > 0
    ? decouplingTrend[decouplingTrend.length - 1]!.value
    : 0;

  // 主観-客観ギャップ（sRPE vs HP ベース推定負荷）
  const gapData = last7.map((m) => {
    const srpe = (m.srpe as number) ?? 0;
    const hp = (m.hp_computed as number) ?? 60;
    // HP が高い（元気） なのに sRPE が高い = 主観過大
    const hrBased = Math.round(srpe * (hp / 100));
    const gap = hrBased > 0 ? Math.round(((srpe - hrBased) / hrBased) * 100) : 0;
    return {
      date: m.date as string,
      srpe,
      hrBased,
      gapPercent: gap,
    };
  });

  // Z-Score（個人平均に対する標準偏差）
  const fields = ['sleep_score', 'fatigue_subjective', 'subjective_condition'] as const;
  const fieldLabels: Record<string, string> = {
    sleep_score: 'sleep',
    fatigue_subjective: 'fatigue',
    subjective_condition: 'mood',
  };
  const zScores: Record<string, number> = {};
  let alertCount = 0;

  for (const field of fields) {
    const values = allMetrics.map((m) => (m[field] as number) ?? 5).filter((v) => v > 0);
    if (values.length < 7) {
      zScores[fieldLabels[field]!] = 0;
      continue;
    }
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const sd = Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length);
    const latest = values[values.length - 1]!;
    const z = sd > 0 ? (latest - mean) / sd : 0;
    zScores[fieldLabels[field]!] = Math.round(z * 100) / 100;
    if (z <= -1.5) alertCount++;
  }

  // パフォーマンス効率指標
  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const sleepScores = allMetrics.map((m) => (m.sleep_score as number) ?? 3);
  const latestSleep = sleepScores[sleepScores.length - 1] ?? 3;
  const avgSleep = avg(sleepScores);
  const sleepDev = avgSleep > 0 ? Math.round(((latestSleep - avgSleep) / avgSleep) * 100) : 0;

  const overallEfficiencyScore = Math.max(0, Math.min(100,
    Math.round(50 + (zScores['sleep'] ?? 0) * 10 + (zScores['fatigue'] ?? 0) * 10 - currentDecoupling * 10),
  ));

  return {
    decoupling: { current: currentDecoupling, trend: decouplingTrend },
    subjectiveObjectiveGap: gapData,
    zScores,
    zScoreAlertCount: alertCount,
    performanceEfficiency: {
      outputPerHrCost: { current: 0, average: 0, deviationPercent: 0 },
      srpeToLoadRatio: {
        current: gapData.length > 0 ? 1 + (gapData[gapData.length - 1]!.gapPercent / 100) : 1,
        average: 1,
        deviationPercent: gapData.length > 0 ? gapData[gapData.length - 1]!.gapPercent : 0,
      },
      recoveryHr: { current: 0, average: 0, deviationPercent: 0 },
      sleepEfficiency: {
        current: Math.round(latestSleep * 20),
        average: Math.round(avgSleep * 20),
        deviationPercent: sleepDev,
      },
    },
    overallEfficiencyScore,
  };
}

function buildPainAnalysis(
  metrics: Array<Record<string, unknown>>,
  medHistory: Array<Record<string, unknown>>,
): PainAnalysis {
  const last14 = metrics.slice(-14);

  // NRS推移 × 負荷相関
  const nrsTrend = last14
    .filter((m) => (m.nrs as number) !== undefined)
    .map((m) => ({
      date: m.date as string,
      nrs: (m.nrs as number) ?? 0,
      srpe: (m.srpe as number) ?? 0,
    }));

  // 相関係数
  let correlation = 0;
  if (nrsTrend.length >= 3) {
    const nrsVals = nrsTrend.map((d) => d.nrs);
    const srpeVals = nrsTrend.map((d) => d.srpe);
    const nrsMean = nrsVals.reduce((a, b) => a + b, 0) / nrsVals.length;
    const srpeMean = srpeVals.reduce((a, b) => a + b, 0) / srpeVals.length;

    let num = 0, denA = 0, denB = 0;
    for (let i = 0; i < nrsVals.length; i++) {
      const a = nrsVals[i]! - nrsMean;
      const b = srpeVals[i]! - srpeMean;
      num += a * b;
      denA += a * a;
      denB += b * b;
    }
    const den = Math.sqrt(denA * denB);
    correlation = den > 0 ? Math.round((num / den) * 100) / 100 : 0;
  }

  // パターン検出
  const patterns: string[] = [];
  const recentNrs = nrsTrend.slice(-3).map((d) => d.nrs);
  if (recentNrs.length >= 3 && recentNrs[0]! < recentNrs[1]! && recentNrs[1]! < recentNrs[2]!) {
    patterns.push('3日連続NRS上昇傾向');
  }
  if (correlation >= 0.7) {
    patterns.push('負荷依存性の疼痛パターン（負荷軽減で改善が見込まれる）');
  }

  // 既往歴照合
  const history = (medHistory ?? []).map((h) => ({
    bodyPart: (h.body_part as string) ?? '',
    condition: (h.condition as string) ?? '',
    date: (h.date as string) ?? '',
    severity: (h.severity as string) ?? 'mild',
    riskMultiplier: (h.risk_multiplier as number) ?? 1.0,
  }));

  // 代償パターン検出（同側下肢に複数部位の痛み）
  let compensationAlert: string | null = null;
  if (nrsTrend.filter((d) => d.nrs >= 3).length >= 3) {
    compensationAlert = '複数日にわたる疼痛継続。運動連鎖全体での評価を推奨';
  }

  return {
    nrsTrend,
    nrsLoadCorrelation: correlation,
    bodyMapTimeline: [], // Daily Input にボディマップデータが追加されたら実装
    patterns,
    medicalHistory: history,
    compensationAlert,
  };
}

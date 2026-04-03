/**
 * PACE Platform — RTS 予測 API
 *
 * GET /api/rts/predict?programId=xxx
 *
 * 指定リハビリプログラムの復帰予測を生成し、
 * シグモイド回復カーブデータとともに返す。
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { predictRTS, generateRecoveryCurve } from '@/lib/rts';
import type { DailyMetric, GateProgress, DecayStatus } from '@/lib/rts';

// ---------------------------------------------------------------------------
// GET /api/rts/predict
// ---------------------------------------------------------------------------

/**
 * RTS 予測を取得する。
 *
 * @query programId - 対象リハビリプログラムID（必須）
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const programId = searchParams.get('programId');

    if (!programId) {
      return NextResponse.json(
        { success: false, error: 'programId クエリパラメータは必須です。' },
        { status: 400 },
      );
    }

    const supabase = await createClient();

    // ----- 認証チェック -----
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

    // ----- スタッフ権限チェック -----
    const { data: staff } = await supabase
      .from('staff')
      .select('id, org_id, role')
      .eq('id', user.id)
      .single();

    if (!staff) {
      return NextResponse.json(
        { success: false, error: '権限がありません' },
        { status: 403 },
      );
    }

    // ----- プログラム取得 (org_id スコープ) -----
    const { data: program, error: programError } = await supabase
      .from('rehab_programs')
      .select('id, athlete_id, current_phase, start_date, estimated_rtp_date, status, athletes!inner(org_id)')
      .eq('id', programId)
      .eq('athletes.org_id', staff.org_id)
      .single();

    if (programError || !program) {
      return NextResponse.json(
        { success: false, error: 'プログラムが見つかりません。' },
        { status: 404 },
      );
    }

    // ----- 日次メトリクス取得（過去42日間） -----
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 42);
    const fromDateStr = fromDate.toISOString().split('T')[0]!;

    const { data: metricsRows } = await supabase
      .from('daily_metrics')
      .select('date, nrs, rpe, subjective_condition, sleep_score')
      .eq('athlete_id', program.athlete_id)
      .gte('date', fromDateStr)
      .order('date', { ascending: true });

    const dailyMetrics: DailyMetric[] = (metricsRows ?? []).map((row) => ({
      date: row.date as string,
      nrs: (row.nrs as number) ?? 0,
      rpe: (row.rpe as number) ?? 0,
      subjective_condition: (row.subjective_condition as number) ?? 5,
      sleep_score: (row.sleep_score as number) ?? 5,
    }));

    // ----- ゲート進捗取得 -----
    const { data: gateRows } = await supabase
      .from('rehab_phase_gates')
      .select('phase, gate_criteria_json, gate_met_at')
      .eq('program_id', programId)
      .order('phase', { ascending: true });

    const gateProgress: GateProgress[] = (gateRows ?? []).map((row) => ({
      phase: row.phase as number,
      criteria: (row.gate_criteria_json as Record<string, unknown>) ?? {},
      gate_met_at: row.gate_met_at as string | null,
    }));

    // ----- 減衰ステータス取得 -----
    const { data: decayRows } = await supabase
      .from('assessment_results')
      .select(`
        node_id,
        risk_score,
        detected_at,
        time_decay_lambda,
        chronic_alpha_modifier
      `)
      .eq('athlete_id', program.athlete_id)
      .gt('risk_score', 0.05);

    const now = new Date();
    const decayStatus: DecayStatus[] = (decayRows ?? []).map((row) => {
      const initialRisk = (row.risk_score as number) ?? 0;
      const lambda = (row.time_decay_lambda as number) ?? 0.05;
      const detectedAt = new Date(row.detected_at as string);
      const daysSince =
        (now.getTime() - detectedAt.getTime()) / (1000 * 60 * 60 * 24);
      const chronicModifier = (row.chronic_alpha_modifier as number) ?? 1.0;

      // 現在のリスク値を算出
      const currentRisk = Math.max(
        0,
        Math.min(1, initialRisk * Math.exp(-lambda * daysSince) * chronicModifier),
      );

      // 回復までの推定日数
      const threshold = 0.05;
      const estimatedDaysToRecovery =
        currentRisk <= threshold
          ? 0
          : lambda > 0
            ? Math.ceil(-Math.log(threshold / currentRisk) / lambda)
            : 365;

      return {
        nodeId: row.node_id as string,
        currentRisk,
        estimatedDaysToRecovery,
        chronicModifier,
      };
    });

    // ----- RTS 予測実行 -----
    const prediction = predictRTS({
      programId,
      athleteId: program.athlete_id as string,
      currentPhase: program.current_phase as number,
      startDate: program.start_date as string,
      dailyMetrics,
      gateProgress,
      decayStatus,
      estimatedRtpDate: program.estimated_rtp_date as string | null,
    });

    // ----- 回復カーブ生成 -----
    const totalDays = Math.ceil(
      (prediction.estimatedRTSDate.getTime() - now.getTime()) /
        (1000 * 60 * 60 * 24),
    );
    const curve = generateRecoveryCurve(
      prediction,
      totalDays + 14,
      dailyMetrics,
    );

    // ----- レスポンス -----
    return NextResponse.json({
      success: true,
      data: {
        prediction: {
          ...prediction,
          estimatedRTSDate: prediction.estimatedRTSDate.toISOString(),
          milestones: prediction.milestones.map((ms) => ({
            ...ms,
            targetDate: ms.targetDate.toISOString(),
          })),
        },
        curve,
      },
    });
  } catch (err) {
    console.error('[rts:predict:GET] 予期しないエラー:', err);
    return NextResponse.json(
      { success: false, error: 'サーバー内部エラーが発生しました。' },
      { status: 500 },
    );
  }
}

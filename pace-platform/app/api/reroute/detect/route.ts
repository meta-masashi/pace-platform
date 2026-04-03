/**
 * PACE Platform — リルート検出 API
 *
 * POST /api/reroute/detect
 *
 * 指定プログラムの回復偏差を検出し、
 * 偏差が見つかった場合はリルート提案を生成・保存する。
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { predictRTS } from '@/lib/rts';
import type { DailyMetric, GateProgress, DecayStatus } from '@/lib/rts';
import { detectRecoveryDeviation, generateAdjustments, generateRerouteNLG } from '@/lib/reroute';
import type { RerouteProposal, RehabProgramForReroute } from '@/lib/reroute';
import { withApiHandler, ApiError } from '@/lib/api/handler';

// ---------------------------------------------------------------------------
// POST /api/reroute/detect
// ---------------------------------------------------------------------------

/**
 * 回復偏差を検出し、リルート提案を生成する。
 *
 * @body { programId: string }
 */
export const POST = withApiHandler(async (request, ctx) => {
  let body: { programId: string };
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, 'リクエストボディのJSONパースに失敗しました。');
  }

  if (!body.programId) {
    throw new ApiError(400, 'programId は必須です。');
  }

  const supabase = await createClient();

  // ----- 認証チェック -----
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new ApiError(401, '認証が必要です。ログインしてください。');
  }

  // ----- スタッフ権限チェック -----
  const { data: staff } = await supabase
    .from('staff')
    .select('id, org_id, role')
    .eq('id', user.id)
    .single();

  if (!staff) {
    throw new ApiError(403, '権限がありません');
  }

  // ----- プログラム取得 (org_id スコープ) -----
  const { data: program, error: programError } = await supabase
    .from('rehab_programs')
    .select('id, athlete_id, current_phase, start_date, estimated_rtp_date, status, athletes!inner(org_id)')
    .eq('id', body.programId)
    .eq('athletes.org_id', staff.org_id)
    .single();

  if (programError || !program) {
    throw new ApiError(404, 'プログラムが見つかりません。');
  }

  // ----- 日次メトリクス取得 -----
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
    .eq('program_id', body.programId)
    .order('phase', { ascending: true });

  const gateProgress: GateProgress[] = (gateRows ?? []).map((row) => ({
    phase: row.phase as number,
    criteria: (row.gate_criteria_json as Record<string, unknown>) ?? {},
    gate_met_at: row.gate_met_at as string | null,
  }));

  // ----- 減衰ステータス取得 -----
  const now = new Date();
  const { data: decayRows } = await supabase
    .from('assessment_results')
    .select('node_id, risk_score, detected_at, time_decay_lambda, chronic_alpha_modifier')
    .eq('athlete_id', program.athlete_id)
    .gt('risk_score', 0.05);

  const decayStatus: DecayStatus[] = (decayRows ?? []).map((row) => {
    const initialRisk = (row.risk_score as number) ?? 0;
    const lambda = (row.time_decay_lambda as number) ?? 0.05;
    const detectedAt = new Date(row.detected_at as string);
    const daysSince = (now.getTime() - detectedAt.getTime()) / (1000 * 60 * 60 * 24);
    const chronicModifier = (row.chronic_alpha_modifier as number) ?? 1.0;
    const currentRisk = Math.max(0, Math.min(1, initialRisk * Math.exp(-lambda * daysSince) * chronicModifier));
    const threshold = 0.05;
    const estimatedDaysToRecovery =
      currentRisk <= threshold ? 0 : lambda > 0 ? Math.ceil(-Math.log(threshold / currentRisk) / lambda) : 365;

    return { nodeId: row.node_id as string, currentRisk, estimatedDaysToRecovery, chronicModifier };
  });

  // ----- RTS 予測を生成 -----
  const prediction = predictRTS({
    programId: body.programId,
    athleteId: program.athlete_id as string,
    currentPhase: program.current_phase as number,
    startDate: program.start_date as string,
    dailyMetrics,
    gateProgress,
    decayStatus,
    estimatedRtpDate: program.estimated_rtp_date as string | null,
  });

  // ----- 偏差検出 -----
  const detection = detectRecoveryDeviation({
    programId: body.programId,
    athleteId: program.athlete_id as string,
    dailyMetrics,
    prediction,
  });

  if (!detection) {
    return NextResponse.json({
      success: true,
      data: null,
      message: '回復は順調です。リルートの必要はありません。',
    });
  }

  // ----- 調整案を生成 -----
  const currentProgram: RehabProgramForReroute = {
    id: body.programId,
    athleteId: program.athlete_id as string,
    currentPhase: program.current_phase as number,
    startDate: program.start_date as string,
    estimatedRtpDate: program.estimated_rtp_date as string | null,
  };

  const adjustments = generateAdjustments(detection, currentProgram);

  // 新しい RTS 日を算出
  const totalDaysImpact = adjustments.reduce((sum, a) => sum + a.daysImpact, 0);
  const newEstimatedRTS = new Date(prediction.estimatedRTSDate);
  newEstimatedRTS.setDate(newEstimatedRTS.getDate() + totalDaysImpact);

  // NLG テキスト生成
  const proposal: RerouteProposal = {
    id: '',
    detection,
    adjustments,
    newEstimatedRTS,
    nlgText: '',
    status: 'pending',
  };

  const nlgText = generateRerouteNLG(proposal);
  proposal.nlgText = nlgText;

  // ----- DB 保存 -----
  const { data: savedProposal, error: insertError } = await supabase
    .from('reroute_proposals')
    .insert({
      program_id: body.programId,
      athlete_id: program.athlete_id,
      detection: JSON.parse(JSON.stringify({
        ...detection,
        detectedAt: detection.detectedAt.toISOString(),
      })),
      adjustments: JSON.parse(JSON.stringify(adjustments)),
      new_estimated_rts: newEstimatedRTS.toISOString().split('T')[0],
      nlg_text: nlgText,
      status: 'pending',
    })
    .select('id, created_at')
    .single();

  if (insertError) {
    ctx.log.error('提案保存エラー', { detail: insertError });
    throw new ApiError(500, 'リルート提案の保存に失敗しました。');
  }

  return NextResponse.json({
    success: true,
    data: {
      id: savedProposal!.id,
      detection: {
        ...detection,
        detectedAt: detection.detectedAt.toISOString(),
      },
      adjustments,
      newEstimatedRTS: newEstimatedRTS.toISOString(),
      nlgText,
      status: 'pending',
      createdAt: savedProposal!.created_at,
    },
  });
}, { service: 'reroute' });

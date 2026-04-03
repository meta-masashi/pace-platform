/**
 * PACE Platform — DBN シミュレーション API
 *
 * POST /api/dbn/simulate
 *
 * 指定アスリートの過去 30 日間のデータから動的ベイズネットワーク（DBN）
 * の順伝播を実行し、将来のリスク予測を返す。
 *
 * リクエストボディ:
 *   { athleteId: string, daysToProject?: number }
 *
 * レスポンス:
 *   { success: true, data: DBNResultSerialized }
 *
 * PRD Phase 3 — Dynamic Bayesian Network Simulation
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buildTimeSlice,
  createTransitionModels,
  propagateForward,
  serializeDBNResult,
} from "@/lib/dbn/engine";
import { withApiHandler, ApiError } from "@/lib/api/handler";
import type {
  NodeState,
  ExternalInputs,
  TimeSlice,
  DBNSimulateResponse,
  DBNErrorResponse,
} from "@/lib/dbn/types";

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** 過去データの参照日数 */
const LOOKBACK_DAYS = 30;

/** デフォルトの予測日数 */
const DEFAULT_DAYS_TO_PROJECT = 14;

/** 予測日数の上限 */
const MAX_DAYS_TO_PROJECT = 90;

// ---------------------------------------------------------------------------
// POST /api/dbn/simulate
// ---------------------------------------------------------------------------

export const POST = withApiHandler(async (request, ctx) => {
  // ----- リクエストパース -----
  const body = await request.json();
  const athleteId = body.athleteId as string | undefined;
  const daysToProject = Math.min(
    Math.max(body.daysToProject ?? DEFAULT_DAYS_TO_PROJECT, 1),
    MAX_DAYS_TO_PROJECT
  );

  if (!athleteId) {
    throw new ApiError(400, "athleteId は必須です。");
  }

  // ----- 認証チェック -----
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new ApiError(401, "認証が必要です。ログインしてください。");
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

  // ----- アスリートアクセス確認（RLS 経由 + org_id スコープ） -----
  const { data: athlete, error: athleteError } = await supabase
    .from("athletes")
    .select("id, org_id")
    .eq("id", athleteId)
    .eq("org_id", staff.org_id)
    .single();

  if (athleteError || !athlete) {
    throw new ApiError(403, "指定されたアスリートが見つからないか、アクセス権がありません。");
  }

  // ----- 過去 30 日間の daily_metrics を取得 -----
  const lookbackDate = new Date();
  lookbackDate.setDate(lookbackDate.getDate() - LOOKBACK_DAYS);

  const { data: dailyMetrics, error: metricsError } = await supabase
    .from("daily_metrics")
    .select("date, srpe, sleep_score, hrv, player_load, nrs, training_intensity")
    .eq("athlete_id", athleteId)
    .gte("date", lookbackDate.toISOString().slice(0, 10))
    .order("date", { ascending: true });

  if (metricsError) {
    ctx.log.error("daily_metrics 取得エラー", { detail: metricsError });
    throw new ApiError(500, "日次メトリクスの取得に失敗しました。");
  }

  // ----- アクティブなアセスメント結果（減衰ログ）を取得 -----
  const { data: decayLogs, error: decayError } = await supabase
    .from("risk_decay_log")
    .select("node_id, initial_risk, current_risk, lambda, half_life_days")
    .eq("athlete_id", athleteId)
    .gt("current_risk", 0.05)
    .order("computed_at", { ascending: false });

  if (decayError) {
    ctx.log.error("減衰ログ取得エラー", { detail: decayError });
    throw new ApiError(500, "減衰データの取得に失敗しました。");
  }

  // 各ノードの最新レコードのみ抽出
  const latestDecayMap = new Map<
    string,
    { nodeId: string; initialRisk: number; currentRisk: number; lambda: number; halfLife: number }
  >();
  for (const log of decayLogs ?? []) {
    const nodeId = log.node_id as string;
    if (!latestDecayMap.has(nodeId)) {
      latestDecayMap.set(nodeId, {
        nodeId,
        initialRisk: log.initial_risk as number,
        currentRisk: log.current_risk as number,
        lambda: (log.lambda as number) ?? Math.LN2 / 14,
        halfLife: (log.half_life_days as number) ?? 14,
      });
    }
  }

  // ----- 慢性修飾子を取得 -----
  const { data: chronicData } = await supabase
    .from("athlete_chronic_modifiers")
    .select("node_id, modifier")
    .eq("athlete_id", athleteId);

  const chronicModifiers = new Map<string, number>();
  for (const row of (chronicData ?? []) as Array<{ node_id: string; modifier: number }>) {
    chronicModifiers.set(row.node_id, row.modifier);
  }

  // ----- アセスメントノード定義を取得 -----
  const nodeIds = Array.from(latestDecayMap.keys());
  if (nodeIds.length === 0) {
    // アクティブなリスクがない場合、空の結果を返す
    return NextResponse.json({
      success: true,
      data: {
        timeSlices: [],
        projections: [],
        summary: {
          currentOverallRisk: 0,
          projectedRiskAtMatch: 0,
          daysToSafeLevel: 0,
          criticalNodes: [],
        },
      },
    });
  }

  const { data: assessmentNodes, error: nodesError } = await supabase
    .from("assessment_nodes")
    .select("node_id, time_decay_lambda, base_prevalence, category, question_text, file_type, phase, target_axis, lr_yes, lr_no, kappa, routing_rules_json, prescription_tags_json, contraindication_tags_json, mutual_exclusive_group")
    .in("node_id", nodeIds);

  if (nodesError) {
    ctx.log.error("ノード定義取得エラー", { detail: nodesError });
    throw new ApiError(500, "アセスメントノード定義の取得に失敗しました。");
  }

  // ----- 遷移モデルを構築 -----
  const transitionModels = createTransitionModels(
    (assessmentNodes ?? []) as unknown as import("@/lib/assessment/types").AssessmentNode[],
    chronicModifiers
  );

  // ----- タイムスライスを構築 -----
  const historicalSlices: TimeSlice[] = [];

  // daily_metrics の各日をタイムスライスに変換
  for (const metric of dailyMetrics ?? []) {
    const inputs: ExternalInputs = {
      srpe: (metric.srpe as number | null) ?? 0,
      sleepScore: (metric.sleep_score as number | null) ?? undefined,
      hrv: (metric.hrv as number | null) ?? undefined,
      playerLoad: (metric.player_load as number | null) ?? undefined,
      nrs: (metric.nrs as number | null) ?? undefined,
      trainingIntensity: (metric.training_intensity as number | null) ?? undefined,
    };

    const nodeStates = new Map<string, NodeState>();
    for (const [nodeId, decay] of latestDecayMap) {
      nodeStates.set(nodeId, {
        nodeId,
        risk: decay.currentRisk,
        isActive: decay.currentRisk > 0.05,
        decayedRisk: decay.currentRisk,
        cumulativeLoad: 0,
      });
    }

    historicalSlices.push(
      buildTimeSlice(metric.date as string, nodeStates, inputs)
    );
  }

  // スライスが空の場合のフォールバック
  if (historicalSlices.length === 0) {
    const today = new Date().toISOString().slice(0, 10);
    const nodeStates = new Map<string, NodeState>();
    for (const [nodeId, decay] of latestDecayMap) {
      nodeStates.set(nodeId, {
        nodeId,
        risk: decay.currentRisk,
        isActive: decay.currentRisk > 0.05,
        decayedRisk: decay.currentRisk,
        cumulativeLoad: 0,
      });
    }
    historicalSlices.push(buildTimeSlice(today, nodeStates, {}));
  }

  // ----- DBN 順伝播を実行 -----
  const dbnResult = propagateForward(
    historicalSlices,
    transitionModels,
    daysToProject
  );

  // ----- レスポンス -----
  return NextResponse.json({
    success: true,
    data: serializeDBNResult(dbnResult),
  });
}, { service: 'dbn' });

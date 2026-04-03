/**
 * PACE Platform — 反事実推論評価 API
 *
 * POST /api/counterfactual/evaluate
 *
 * 「もし〇〇したら、リスクはどう変わるか？」に回答する。
 * do-calculus に基づく因果的介入効果のシミュレーション。
 *
 * リクエストボディ: CounterfactualQuery
 * レスポンス: CounterfactualEvaluateResponse
 *
 * 認可: AT, PT, master ロール
 *
 * PRD Phase 3 — Counterfactual Evaluation API
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { evaluateIntervention, serializeCounterfactualResult } from "@/lib/counterfactual/engine";
import { buildTimeSlice, createTransitionModels } from "@/lib/dbn/engine";
import type {
  CounterfactualQuery,
  CounterfactualEvaluateResponse,
  CounterfactualErrorResponse,
} from "@/lib/counterfactual/types";
import type { ExternalInputs, NodeState, TimeSlice } from "@/lib/dbn/types";

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** 過去データの参照日数 */
const LOOKBACK_DAYS = 30;

/** 許可されたロール */
const ALLOWED_ROLES = ["AT", "PT", "master"];

// ---------------------------------------------------------------------------
// POST /api/counterfactual/evaluate
// ---------------------------------------------------------------------------

export async function POST(
  request: Request
): Promise<NextResponse<CounterfactualEvaluateResponse | CounterfactualErrorResponse>> {
  try {
    // ----- 認証・認可チェック -----
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "認証が必要です。ログインしてください。" },
        { status: 401 }
      );
    }

    // ロールチェック
    const { data: staff } = await supabase
      .from("staff")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!staff || !ALLOWED_ROLES.includes(staff.role as string)) {
      return NextResponse.json(
        {
          success: false,
          error: "この操作には AT、PT、または master ロールが必要です。",
        },
        { status: 403 }
      );
    }

    // ----- リクエストパース -----
    const query = (await request.json()) as CounterfactualQuery;

    if (!query.athleteId || !query.targetNodeId || !query.targetDate) {
      return NextResponse.json(
        {
          success: false,
          error: "athleteId, targetNodeId, targetDate は必須です。",
        },
        { status: 400 }
      );
    }

    if (!query.interventions || query.interventions.length === 0) {
      return NextResponse.json(
        { success: false, error: "少なくとも1つの介入が必要です。" },
        { status: 400 }
      );
    }

    // ----- アスリートアクセス確認（RLS 経由） -----
    const { data: athlete, error: athleteError } = await supabase
      .from("athletes")
      .select("id, org_id")
      .eq("id", query.athleteId)
      .single();

    if (athleteError || !athlete) {
      return NextResponse.json(
        {
          success: false,
          error: "指定されたアスリートが見つからないか、アクセス権がありません。",
        },
        { status: 403 }
      );
    }

    // ----- 過去データ取得 -----
    const lookbackDate = new Date();
    lookbackDate.setDate(lookbackDate.getDate() - LOOKBACK_DAYS);

    const { data: dailyMetrics, error: metricsError } = await supabase
      .from("daily_metrics")
      .select("date, srpe, sleep_score, hrv, player_load, nrs, training_intensity")
      .eq("athlete_id", query.athleteId)
      .gte("date", lookbackDate.toISOString().slice(0, 10))
      .order("date", { ascending: true });

    if (metricsError) {
      console.error("[counterfactual:evaluate] daily_metrics 取得エラー:", metricsError);
      return NextResponse.json(
        { success: false, error: "日次メトリクスの取得に失敗しました。" },
        { status: 500 }
      );
    }

    // ----- 減衰ログ取得 -----
    const { data: decayLogs, error: decayError } = await supabase
      .from("risk_decay_log")
      .select("node_id, initial_risk, current_risk, lambda, half_life_days")
      .eq("athlete_id", query.athleteId)
      .gt("current_risk", 0.05)
      .order("computed_at", { ascending: false });

    if (decayError) {
      console.error("[counterfactual:evaluate] 減衰ログ取得エラー:", decayError);
      return NextResponse.json(
        { success: false, error: "減衰データの取得に失敗しました。" },
        { status: 500 }
      );
    }

    // 各ノードの最新レコードのみ抽出
    const latestDecayMap = new Map<
      string,
      { nodeId: string; currentRisk: number; lambda: number; halfLife: number }
    >();
    for (const log of decayLogs ?? []) {
      const nodeId = log.node_id as string;
      if (!latestDecayMap.has(nodeId)) {
        latestDecayMap.set(nodeId, {
          nodeId,
          currentRisk: log.current_risk as number,
          lambda: (log.lambda as number) ?? Math.LN2 / 14,
          halfLife: (log.half_life_days as number) ?? 14,
        });
      }
    }

    // ターゲットノードの存在確認
    if (!latestDecayMap.has(query.targetNodeId)) {
      return NextResponse.json(
        {
          success: false,
          error: `ターゲットノード ${query.targetNodeId} のアクティブなリスクが見つかりません。`,
        },
        { status: 404 }
      );
    }

    // ----- 慢性修飾子取得 -----
    const { data: chronicData } = await supabase
      .from("athlete_chronic_modifiers")
      .select("node_id, modifier")
      .eq("athlete_id", query.athleteId);

    const chronicModifiers = new Map<string, number>();
    for (const row of (chronicData ?? []) as Array<{ node_id: string; modifier: number }>) {
      chronicModifiers.set(row.node_id, row.modifier);
    }

    // ----- アセスメントノード定義取得 -----
    const nodeIds = Array.from(latestDecayMap.keys());
    const { data: assessmentNodes, error: nodesError } = await supabase
      .from("assessment_nodes")
      .select("node_id, time_decay_lambda, base_prevalence, category, question_text, file_type, phase, target_axis, lr_yes, lr_no, kappa, routing_rules_json, prescription_tags_json, contraindication_tags_json, mutual_exclusive_group")
      .in("node_id", nodeIds);

    if (nodesError) {
      console.error("[counterfactual:evaluate] ノード定義取得エラー:", nodesError);
      return NextResponse.json(
        { success: false, error: "アセスメントノード定義の取得に失敗しました。" },
        { status: 500 }
      );
    }

    // ----- 遷移モデル構築 -----
    const transitionModels = createTransitionModels(
      (assessmentNodes ?? []) as unknown as import("@/lib/assessment/types").AssessmentNode[],
      chronicModifiers
    );

    // ----- タイムスライス構築 -----
    const historicalSlices: TimeSlice[] = [];

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

      historicalSlices.push(buildTimeSlice(metric.date as string, nodeStates, inputs));
    }

    // フォールバック
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

    // ----- 反事実推論実行 -----
    const cfResult = evaluateIntervention(
      query,
      historicalSlices,
      transitionModels
    );

    // ----- レスポンス -----
    return NextResponse.json({
      success: true,
      data: serializeCounterfactualResult(cfResult),
    });
  } catch (err) {
    console.error("[counterfactual:evaluate] 予期しないエラー:", err);
    return NextResponse.json(
      { success: false, error: "サーバー内部エラーが発生しました。" },
      { status: 500 }
    );
  }
}

/**
 * PACE Platform — 時間減衰バッチプロセッサ
 *
 * 毎日の定時バッチで、すべてのアクティブなリスク値を
 * 時間減衰モデルに基づいて再計算し、risk_decay_log に記録する。
 *
 * 実行タイミング: 毎日 05:00 JST（朝のアジェンダ生成前）
 *
 * 【防壁4】耐障害性: 1件の失敗が他の処理をブロックしない
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DecayBatchResult, DecayedRiskEntry } from "./types";
import {
  calculateDecayedRisk,
  daysBetween,
  halfLifeFromLambda,
  RISK_THRESHOLD,
} from "./calculator";

// ---------------------------------------------------------------------------
// DB行型（Supabase クエリ結果）
// ---------------------------------------------------------------------------

interface ActiveRiskRow {
  athlete_id: string;
  assessment_id: string;
  node_id: string;
  risk_score: number;
  completed_at: string;
  time_decay_lambda: number | null;
  half_life_days: number | null;
  chronic_alpha_modifier: number | null;
}

// ---------------------------------------------------------------------------
// バッチ処理
// ---------------------------------------------------------------------------

/**
 * 日次減衰バッチを実行する。
 *
 * 1. 閾値以上のアクティブなリスクを持つ assessment_results を取得
 * 2. 対応する assessment_nodes の減衰パラメータを取得
 * 3. 経過日数に基づき減衰を計算
 * 4. risk_decay_log に記録
 *
 * @param supabase - サービスロール権限の Supabase クライアント
 * @returns バッチ処理結果サマリー
 */
export async function runDecayBatch(
  supabase: SupabaseClient
): Promise<DecayBatchResult> {
  const result: DecayBatchResult = {
    processed: 0,
    updated: 0,
    errors: 0,
    details: [],
  };

  // ----- 1. アクティブなリスクを取得 -----
  // assessment_results と assessment_nodes を JOIN して
  // 減衰パラメータ付きのリスクを取得
  const { data: activeRisks, error: fetchError } = await supabase
    .rpc("get_active_risks_for_decay", {
      risk_threshold: RISK_THRESHOLD,
    });

  // RPC が未定義の場合はフォールバッククエリを使用
  let rows: ActiveRiskRow[];

  if (fetchError || !activeRisks) {
    console.warn(
      "[decay:batch] RPC フォールバック — 直接クエリを使用:",
      fetchError?.message
    );

    const { data: fallbackData, error: fallbackError } = await supabase
      .from("assessment_results")
      .select(`
        athlete_id,
        assessment_id,
        node_id,
        risk_score,
        completed_at,
        assessment_nodes!inner (
          time_decay_lambda,
          half_life_days
        )
      `)
      .gt("risk_score", RISK_THRESHOLD)
      .not("completed_at", "is", null);

    if (fallbackError || !fallbackData) {
      console.error("[decay:batch] リスクデータ取得失敗:", fallbackError);
      return result;
    }

    rows = (fallbackData as unknown as Array<{
      athlete_id: string;
      assessment_id: string;
      node_id: string;
      risk_score: number;
      completed_at: string;
      assessment_nodes: {
        time_decay_lambda: number | null;
        half_life_days: number | null;
      };
    }>).map((row) => ({
      athlete_id: row.athlete_id,
      assessment_id: row.assessment_id,
      node_id: row.node_id,
      risk_score: row.risk_score,
      completed_at: row.completed_at,
      time_decay_lambda: row.assessment_nodes?.time_decay_lambda ?? null,
      half_life_days: row.assessment_nodes?.half_life_days ?? null,
      chronic_alpha_modifier: null,
    }));
  } else {
    rows = activeRisks as ActiveRiskRow[];
  }

  result.processed = rows.length;

  if (rows.length === 0) {
    console.log("[decay:batch] 対象レコードなし — スキップ");
    return result;
  }

  console.log(`[decay:batch] ${rows.length} 件のリスクを処理開始`);

  // ----- 2. 各リスクの減衰を計算 -----
  const now = new Date();
  const logEntries: Array<{
    athlete_id: string;
    assessment_id: string;
    node_id: string;
    initial_risk: number;
    current_risk: number;
    lambda: number;
    half_life_days: number;
    chronic_modifier: number;
    days_elapsed: number;
    computed_at: string;
  }> = [];

  for (const row of rows) {
    try {
      const lambda = row.time_decay_lambda ?? 0;
      const halfLife = row.half_life_days ?? (lambda > 0 ? halfLifeFromLambda(lambda) : 30);
      const chronicModifier = row.chronic_alpha_modifier ?? 1.0;
      const detectedAt = new Date(row.completed_at);
      const elapsed = daysBetween(detectedAt, now);
      const elapsedDays = Math.floor(elapsed);

      // λ が 0 の場合はデフォルト半減期 30日を使用
      const effectiveLambda = lambda > 0 ? lambda : Math.LN2 / 30;

      const currentRisk = calculateDecayedRisk(
        row.risk_score,
        effectiveLambda,
        elapsed,
        chronicModifier
      );

      const entry: DecayedRiskEntry = {
        athleteId: row.athlete_id,
        nodeId: row.node_id,
        assessmentId: row.assessment_id,
        previousRisk: row.risk_score,
        currentRisk,
        daysSinceDetection: elapsedDays,
        halfLifeDays: halfLife,
      };
      result.details.push(entry);

      logEntries.push({
        athlete_id: row.athlete_id,
        assessment_id: row.assessment_id,
        node_id: row.node_id,
        initial_risk: row.risk_score,
        current_risk: currentRisk,
        lambda: effectiveLambda,
        half_life_days: halfLife,
        chronic_modifier: chronicModifier,
        days_elapsed: elapsedDays,
        computed_at: now.toISOString(),
      });

      result.updated++;
    } catch (err) {
      console.error(
        `[decay:batch] 計算エラー athlete=${row.athlete_id} node=${row.node_id}:`,
        err
      );
      result.errors++;
    }
  }

  // ----- 3. risk_decay_log に一括記録 -----
  if (logEntries.length > 0) {
    // 100件ずつバッチ挿入（Supabase の制限対策）
    const batchSize = 100;
    for (let i = 0; i < logEntries.length; i += batchSize) {
      const batch = logEntries.slice(i, i + batchSize);
      const { error: insertError } = await supabase
        .from("risk_decay_log")
        .upsert(batch, {
          onConflict: "athlete_id,assessment_id,node_id",
        });

      if (insertError) {
        console.error(
          `[decay:batch] ログ挿入エラー (batch ${i / batchSize + 1}):`,
          insertError
        );
        // 挿入エラーは処理続行（耐障害性）
      }
    }
  }

  console.log(
    `[decay:batch] 完了 — 処理: ${result.processed}, 更新: ${result.updated}, エラー: ${result.errors}`
  );

  return result;
}

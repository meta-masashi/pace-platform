/**
 * PACE Platform — 反事実推論（Counterfactual）エンジン
 *
 * do-calculus に基づく介入効果のシミュレーション。
 *
 * 核心となるセマンティクス:
 *   P(Y|do(X)) ≠ P(Y|X)
 *
 *   do(X = x) 操作:
 *     1. DAG において変数 X への全ての入力辺をカット
 *     2. X を値 x に強制設定
 *     3. DAG を順伝播して Y の値を求める
 *
 * これにより、介入の因果的効果を正しく推定できる。
 * 単なる条件付き確率（観察的）とは異なり、
 * 交絡因子の影響を排除した介入的確率を算出する。
 *
 * すべて純関数で副作用なし。外部ライブラリ不使用。
 *
 * PRD Phase 3 — Counterfactual Engine (Do-Calculus)
 */

import type {
  CounterfactualQuery,
  CounterfactualResult,
  CounterfactualResultSerialized,
  Intervention,
} from "./types";
import type {
  TimeSlice,
  ExternalInputs,
  TransitionModel,
  NodeState,
} from "@/lib/dbn/types";
import { propagateForward, buildTimeSlice, serializeTimeSlice } from "@/lib/dbn/engine";

// ---------------------------------------------------------------------------
// 介入の適用（do-operator）
// ---------------------------------------------------------------------------

/**
 * do-operator: 外部入力に介入を適用する。
 *
 * 対象変数への入力辺をカット（既存の値を無視）し、
 * 変数を強制的に指定値に設定する。
 *
 * @param inputs - 元の外部入力
 * @param interventions - 適用する介入リスト
 * @returns 介入適用後の外部入力
 */
function applyInterventions(
  inputs: ExternalInputs,
  interventions: Intervention[]
): ExternalInputs {
  // 元の入力をシャローコピー（入力辺カットの準備）
  const modified: ExternalInputs = { ...inputs };

  for (const intervention of interventions) {
    switch (intervention.type) {
      case "set_intensity":
        // do(trainingIntensity = value):
        // 入力辺をカットし、トレーニング強度を強制設定
        modified.trainingIntensity = intervention.value as number;
        // 強度変更に伴い sRPE もスケーリング
        if (modified.srpe != null && inputs.trainingIntensity != null && inputs.trainingIntensity > 0) {
          modified.srpe =
            modified.srpe * ((intervention.value as number) / 100) /
            (inputs.trainingIntensity / 100);
        } else if (modified.srpe != null) {
          modified.srpe = modified.srpe * ((intervention.value as number) / 100);
        }
        break;

      case "toggle_exercise":
        // do(exercise = OFF):
        // 特定エクササイズを無効化 → 負荷への寄与をゼロに
        if (intervention.value === false || intervention.value === 0) {
          // エクササイズ OFF: sRPE を 20% 削減（スプリント相当の負荷削減）
          if (modified.srpe != null) {
            modified.srpe = modified.srpe * 0.8;
          }
          if (modified.playerLoad != null) {
            modified.playerLoad = modified.playerLoad * 0.8;
          }
        }
        break;

      case "set_rest_day":
        // do(allLoad = 0):
        // 全ての負荷入力辺をカット → 完全休養日
        modified.srpe = 0;
        modified.playerLoad = 0;
        modified.trainingIntensity = 0;
        break;

      case "modify_load":
        // do(load = load × factor):
        // 負荷をスケーリング係数で調整
        {
          const factor = intervention.value as number;
          if (modified.srpe != null) {
            modified.srpe = modified.srpe * factor;
          }
          if (modified.playerLoad != null) {
            modified.playerLoad = modified.playerLoad * factor;
          }
        }
        break;
    }
  }

  return modified;
}

// ---------------------------------------------------------------------------
// ベースラインシナリオの構築
// ---------------------------------------------------------------------------

/**
 * ベースラインシナリオの外部入力を構築する。
 *
 * @param baseInputs - 元の外部入力
 * @param scenario - ベースラインシナリオ種別
 * @returns シナリオに応じた外部入力
 */
function buildBaselineInputs(
  baseInputs: ExternalInputs,
  scenario: "current_plan" | "rest_day" | "full_intensity"
): ExternalInputs {
  switch (scenario) {
    case "current_plan":
      // 現行計画: そのまま
      return { ...baseInputs };

    case "rest_day":
      // 完全休養: 全負荷ゼロ
      return {
        ...baseInputs,
        srpe: 0,
        playerLoad: 0,
        trainingIntensity: 0,
      };

    case "full_intensity":
      // フル強度: 強度 100%
      return {
        ...baseInputs,
        trainingIntensity: 100,
      };
  }
}

// ---------------------------------------------------------------------------
// 反事実推論メイン
// ---------------------------------------------------------------------------

/**
 * 反事実クエリを評価する。
 *
 * 手順:
 *   1. ベースラインシナリオで DBN 順伝播を実行
 *   2. 介入シナリオで do-operator を適用し、DBN 順伝播を実行
 *   3. ターゲット日・ターゲットノードのリスクを比較
 *   4. NLG 説明文を生成
 *
 * @param query - 反事実クエリ
 * @param historicalSlices - 過去の実測タイムスライス列
 * @param transitionModels - 遷移モデル配列
 * @returns 反事実推論結果
 */
export function evaluateIntervention(
  query: CounterfactualQuery,
  historicalSlices: TimeSlice[],
  transitionModels: TransitionModel[]
): CounterfactualResult {
  if (historicalSlices.length === 0) {
    return createEmptyResult(query);
  }

  const lastSlice = historicalSlices[historicalSlices.length - 1]!;
  const lastDate = lastSlice.date;
  const daysToTarget = daysBetweenDates(lastDate, query.targetDate);
  const daysToProject = Math.max(daysToTarget, 1);

  const baselineScenario = query.baselineScenario ?? "current_plan";

  // ----- 1. ベースラインシナリオ -----
  // ベースラインの外部入力を構築
  const baselineSlices = historicalSlices.map((slice) => {
    const baselineInputs = buildBaselineInputs(
      slice.externalInputs,
      baselineScenario
    );
    return buildTimeSlice(slice.date, new Map(slice.nodeStates), baselineInputs);
  });

  const baselineResult = propagateForward(
    baselineSlices,
    transitionModels,
    daysToProject
  );

  // ----- 2. 介入シナリオ -----
  // 介入の外部入力を構築（do-operator 適用）
  const interventionSlices = historicalSlices.map((slice) => {
    const baseInputs = buildBaselineInputs(
      slice.externalInputs,
      baselineScenario
    );
    // do-operator: 入力辺をカットし、変数を強制設定
    const interventionInputs = applyInterventions(
      baseInputs,
      query.interventions
    );
    return buildTimeSlice(
      slice.date,
      new Map(slice.nodeStates),
      interventionInputs
    );
  });

  const interventionResult = propagateForward(
    interventionSlices,
    transitionModels,
    daysToProject
  );

  // ----- 3. ターゲットノード・ターゲット日のリスクを比較 -----
  const baselineRisk = extractTargetRisk(
    baselineResult.projections,
    query.targetNodeId,
    query.targetDate
  );

  const interventionRisk = extractTargetRisk(
    interventionResult.projections,
    query.targetNodeId,
    query.targetDate
  );

  const riskReduction = baselineRisk - interventionRisk;
  const riskReductionPct =
    baselineRisk > 0 ? (riskReduction / baselineRisk) * 100 : 0;

  // ----- 4. 信頼度算出 -----
  const confidenceLevel = computeConfidence(historicalSlices);

  // ----- 5. NLG 説明文生成 -----
  const explanation = generateCounterfactualNLG({
    query,
    baselineRisk,
    interventionRisk,
    riskReduction,
    riskReductionPct,
    confidenceLevel,
    explanation: "",
    comparisonSlices: {
      baseline: baselineResult.projections,
      intervention: interventionResult.projections,
    },
  });

  return {
    query,
    baselineRisk: roundTo4(baselineRisk),
    interventionRisk: roundTo4(interventionRisk),
    riskReduction: roundTo4(riskReduction),
    riskReductionPct: roundTo1(riskReductionPct),
    confidenceLevel: roundTo2(confidenceLevel),
    explanation,
    comparisonSlices: {
      baseline: baselineResult.projections,
      intervention: interventionResult.projections,
    },
  };
}

// ---------------------------------------------------------------------------
// ターゲットリスク抽出
// ---------------------------------------------------------------------------

/**
 * 予測タイムスライス列からターゲット日・ターゲットノードのリスクを抽出する。
 *
 * @param projections - 予測タイムスライス列
 * @param targetNodeId - ターゲットノードID
 * @param targetDate - ターゲット日付（YYYY-MM-DD）
 * @returns ターゲットリスク値（見つからない場合は最終日の値）
 */
function extractTargetRisk(
  projections: TimeSlice[],
  targetNodeId: string,
  targetDate: string
): number {
  // ターゲット日のスライスを検索
  const targetSlice = projections.find((s) => s.date === targetDate);

  if (targetSlice) {
    const nodeState = targetSlice.nodeStates.get(targetNodeId);
    return nodeState?.risk ?? 0;
  }

  // ターゲット日が見つからない場合、最終日の値を使用
  if (projections.length > 0) {
    const lastSlice = projections[projections.length - 1]!;
    const nodeState = lastSlice.nodeStates.get(targetNodeId);
    return nodeState?.risk ?? 0;
  }

  return 0;
}

// ---------------------------------------------------------------------------
// 信頼度算出
// ---------------------------------------------------------------------------

/**
 * データ可用性に基づく信頼度を算出する。
 *
 * 過去データの充実度から、予測の信頼度を推定する:
 *   - 30 日分のデータ: 1.0
 *   - 15 日分: 0.7
 *   - 7 日分: 0.5
 *   - 1 日分: 0.3
 *
 * @param historicalSlices - 過去タイムスライス列
 * @returns 信頼度（0.0〜1.0）
 */
function computeConfidence(historicalSlices: TimeSlice[]): number {
  const count = historicalSlices.length;
  if (count >= 30) return 1.0;
  if (count >= 15) return 0.7 + (count - 15) * (0.3 / 15);
  if (count >= 7) return 0.5 + (count - 7) * (0.2 / 8);
  if (count >= 1) return 0.3 + (count - 1) * (0.2 / 6);
  return 0.1;
}

// ---------------------------------------------------------------------------
// NLG（自然言語生成）
// ---------------------------------------------------------------------------

/**
 * 反事実推論結果の日本語 NLG 説明文を生成する。
 *
 * テンプレート:
 *   "もし{介入}した場合、{日付}の{部位}リスクは
 *    {baseline}%から{intervention}%に{方向}します
 *   （{pct}%のリスク{方向語}）。"
 *
 * @param result - 反事実推論結果
 * @returns 日本語の説明文
 */
export function generateCounterfactualNLG(
  result: CounterfactualResult
): string {
  const { query, baselineRisk, interventionRisk, riskReductionPct } = result;

  // 介入説明の結合
  const interventionDesc = query.interventions
    .map((i) => i.description)
    .join("かつ");

  // ベースライン・介入リスクをパーセンテージ表示
  const baselinePct = Math.round(baselineRisk * 100);
  const interventionPct = Math.round(interventionRisk * 100);

  // 方向の判定
  const isReduction = interventionRisk < baselineRisk;
  const direction = isReduction ? "低下" : "上昇";
  const directionWord = isReduction ? "リスク低減" : "リスク増加";

  // 日付を日本語に変換
  const targetDateJa = formatDateJa(query.targetDate);

  // リスク低減率の絶対値
  const absPct = Math.abs(Math.round(riskReductionPct));

  return (
    `もし${interventionDesc}した場合、${targetDateJa}の` +
    `${query.targetNodeId}リスクは${baselinePct}%から` +
    `${interventionPct}%に${direction}します` +
    `（${absPct}%の${directionWord}）。`
  );
}

// ---------------------------------------------------------------------------
// ユーティリティ（純関数）
// ---------------------------------------------------------------------------

/**
 * 空の反事実結果を生成する（データ不足時のフォールバック）。
 */
function createEmptyResult(query: CounterfactualQuery): CounterfactualResult {
  return {
    query,
    baselineRisk: 0,
    interventionRisk: 0,
    riskReduction: 0,
    riskReductionPct: 0,
    confidenceLevel: 0,
    explanation: "データが不足しているため、反事実推論を実行できません。",
    comparisonSlices: {
      baseline: [],
      intervention: [],
    },
  };
}

/**
 * 2つの YYYY-MM-DD 日付間の日数差を算出する。
 */
function daysBetweenDates(from: string, to: string): number {
  const fromDate = new Date(from + "T00:00:00Z");
  const toDate = new Date(to + "T00:00:00Z");
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.ceil((toDate.getTime() - fromDate.getTime()) / msPerDay);
}

/**
 * YYYY-MM-DD を日本語の日付形式に変換する。
 *
 * @example "2026-03-28" → "3月28日（土）"
 */
function formatDateJa(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00Z");
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const dayOfWeek = ["日", "月", "火", "水", "木", "金", "土"][date.getUTCDay()];
  return `${month}月${day}日（${dayOfWeek}）`;
}

/** 小数第4位で丸める */
function roundTo4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/** 小数第2位で丸める */
function roundTo2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** 小数第1位で丸める */
function roundTo1(value: number): number {
  return Math.round(value * 10) / 10;
}

// ---------------------------------------------------------------------------
// シリアライゼーション
// ---------------------------------------------------------------------------

/**
 * CounterfactualResult を JSON シリアライズ可能な形式に変換する。
 */
export function serializeCounterfactualResult(
  result: CounterfactualResult
): CounterfactualResultSerialized {
  return {
    query: result.query,
    baselineRisk: result.baselineRisk,
    interventionRisk: result.interventionRisk,
    riskReduction: result.riskReduction,
    riskReductionPct: result.riskReductionPct,
    confidenceLevel: result.confidenceLevel,
    explanation: result.explanation,
    comparisonSlices: {
      baseline: result.comparisonSlices.baseline.map(serializeTimeSlice),
      intervention: result.comparisonSlices.intervention.map(serializeTimeSlice),
    },
  };
}

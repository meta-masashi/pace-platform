/**
 * PACE v6.0 — ベイズ推論アダプター
 *
 * 既存の lib/bayes/ モジュールの DAG ベース因果割引推論を
 * v6.0 パイプライン Node 3（推論エンジン）で利用するためのラッパー。
 *
 * 既存エンジンのインターフェースを v6.0 パイプラインの
 * FeatureVector / InferenceOutput 型に合わせて変換する。
 */

import {
  calculatePosteriorWithDAG,
  probabilityToOdds,
  oddsToProbability,
} from '../../../bayes/inference';
import type {
  AssessmentNode,
  ActiveObservation,
  CausalEdge,
} from '../../../bayes/types';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** DAG 事後確率計算の入力 */
export interface DAGPosteriorInput {
  /** 部位別事前確率マップ */
  priors: Record<string, number>;
  /** アセスメントノード一覧 */
  nodes: AssessmentNode[];
  /** 発火している観測ノード一覧 */
  observations: ActiveObservation[];
}

/** DAG 事後確率計算の結果 */
export interface DAGPosteriorResult {
  /** 部位別事後確率 */
  posteriors: Record<string, number>;
}

// ---------------------------------------------------------------------------
// DAG 事後確率アダプター
// ---------------------------------------------------------------------------

/**
 * 既存の DAG ベイズ推論を用いて部位別の事後確率を計算する。
 *
 * 各部位の事前確率に対して、因果割引（Causal Discounting）付きの
 * 尤度比更新を適用し、事後確率を返す。
 *
 * @param priors - 部位別事前確率マップ（例: { "knee": 0.15, "ankle": 0.10 }）
 * @param nodes - アセスメントノード一覧（因果グラフの構造を含む）
 * @param observations - 発火している観測ノード一覧
 * @returns 部位別事後確率
 */
export function adaptDAGPosterior(
  priors: Record<string, number>,
  nodes: AssessmentNode[],
  observations: ActiveObservation[],
): DAGPosteriorResult {
  const posteriors: Record<string, number> = {};

  for (const [bodyPart, prior] of Object.entries(priors)) {
    // 事前確率が 0 または 1 の場合はそのまま返す
    if (prior <= 0 || prior >= 1) {
      posteriors[bodyPart] = prior;
      continue;
    }

    // 観測データがない場合は事前確率をそのまま返す
    if (observations.length === 0) {
      posteriors[bodyPart] = prior;
      continue;
    }

    try {
      posteriors[bodyPart] = calculatePosteriorWithDAG(
        prior,
        nodes,
        observations,
      );
    } catch {
      // 計算エラー時は事前確率をそのまま使用
      posteriors[bodyPart] = prior;
    }
  }

  return { posteriors };
}

// ---------------------------------------------------------------------------
// Wilson スコア区間
// ---------------------------------------------------------------------------

/**
 * Wilson スコア区間による 95% 信頼区間を計算する。
 *
 * ベイズ事後確率に対して、有効標本サイズに基づく
 * 信頼区間を返す。Bootstrap よりも計算コストが低く、
 * パイプラインのリアルタイム処理に適している。
 *
 * @param probability - 事後確率（0.0〜1.0）
 * @param n - 有効標本サイズ（データ蓄積日数を使用）
 * @returns [下限, 上限] の 95% 信頼区間
 */
export function wilsonScoreInterval(
  probability: number,
  n: number,
): [number, number] {
  // 標本サイズが 0 以下の場合は広い区間を返す
  if (n <= 0) {
    return [0, 1];
  }

  // Z値（95% 信頼区間）
  const z = 1.96;
  const z2 = z * z;

  const denominator = 1 + z2 / n;
  const centre = (probability + z2 / (2 * n)) / denominator;
  const margin =
    (z / denominator) *
    Math.sqrt(
      (probability * (1 - probability)) / n + z2 / (4 * n * n),
    );

  const lower = Math.max(0, centre - margin);
  const upper = Math.min(1, centre + margin);

  return [lower, upper];
}

// ---------------------------------------------------------------------------
// 再エクスポート
// ---------------------------------------------------------------------------

export { calculatePosteriorWithDAG, probabilityToOdds, oddsToProbability };
export type {
  AssessmentNode,
  ActiveObservation,
  CausalEdge,
  RiskLevel,
} from '../../../bayes/types';

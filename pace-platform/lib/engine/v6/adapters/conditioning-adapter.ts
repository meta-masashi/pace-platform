/**
 * PACE v6.0 — コンディショニングアダプター
 *
 * 既存の lib/conditioning/ モジュールの EWMA/ACWR 計算を
 * v6.0 パイプライン Node 2（特徴量エンジニアリング）で利用するためのラッパー。
 *
 * 既存エンジンのインターフェースを v6.0 パイプラインの
 * DailyInput 型に合わせて変換する。
 */

import { calculateEWMA } from '../../../conditioning/ewma';
import type { DailyInput, PipelineConfig } from '../types';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** EWMA 計算結果 */
export interface EWMAResult {
  /** 急性負荷 EWMA（7日相当） */
  acuteEWMA: number;
  /** 慢性負荷 EWMA（28日相当） */
  chronicEWMA: number;
}

/** ACWR 計算結果 */
export interface ACWRResult {
  /** Acute:Chronic Workload Ratio */
  acwr: number;
  /** 急性負荷 EWMA */
  acuteEWMA: number;
  /** 慢性負荷 EWMA */
  chronicEWMA: number;
}

// ---------------------------------------------------------------------------
// EWMA アダプター
// ---------------------------------------------------------------------------

/**
 * 日次入力履歴から EWMA（急性/慢性）を計算する。
 *
 * v6.0 パイプラインでは λ ベースの EWMA を使用するが、
 * 既存エンジンは span ベース（α = 2 / (span + 1)）を使用するため、
 * λ → span の変換を行う。
 *
 * λ と span の関係: λ ≈ 2 / (span + 1)
 * - 急性 λ = 0.25 → span ≈ 7
 * - 慢性 λ = 0.07 → span ≈ 28
 *
 * @param history - 日次入力データの履歴（古い順）
 * @param config - パイプライン設定
 * @returns 急性/慢性 EWMA 値
 */
export function adaptEWMA(
  history: DailyInput[],
  config: PipelineConfig,
): EWMAResult {
  const loads = history.map((d) => d.sessionLoad);

  if (loads.length === 0) {
    return { acuteEWMA: 0, chronicEWMA: 0 };
  }

  // λ → span 変換: span = (2 / λ) - 1
  const acuteSpan = Math.max(
    1,
    Math.round((2 / config.ewma.acuteLambda) - 1),
  );
  const chronicSpan = Math.max(
    1,
    Math.round((2 / config.ewma.chronicLambda) - 1),
  );

  const acuteEWMA = calculateEWMA(loads, acuteSpan);
  const chronicEWMA = calculateEWMA(loads, chronicSpan);

  return { acuteEWMA, chronicEWMA };
}

/**
 * 日次入力履歴から ACWR を計算する。
 *
 * ACWR = 急性 EWMA / 慢性 EWMA
 * 慢性負荷が 0 の場合は ACWR = 0 を返す（ゼロ除算防止）。
 *
 * @param history - 日次入力データの履歴（古い順）
 * @param config - パイプライン設定
 * @returns ACWR 計算結果
 */
export function adaptACWR(
  history: DailyInput[],
  config: PipelineConfig,
): ACWRResult {
  const { acuteEWMA, chronicEWMA } = adaptEWMA(history, config);

  const acwr = chronicEWMA > 0 ? acuteEWMA / chronicEWMA : 0;

  return { acwr, acuteEWMA, chronicEWMA };
}

// ---------------------------------------------------------------------------
// 再エクスポート
// ---------------------------------------------------------------------------

export { calculateEWMA } from '../../../conditioning/ewma';
export type {
  EWMAConfig,
  ConditioningResult,
  DailyMetricRow,
} from '../../../conditioning/types';

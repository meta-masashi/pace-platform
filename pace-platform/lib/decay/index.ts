/**
 * PACE Platform — 時間減衰モジュール（バレルエクスポート）
 *
 * リスク値の時間減衰計算に関する型・関数を再エクスポートする。
 */

// 型定義
export type {
  DecayableRisk,
  DecayBatchResult,
  DecayedRiskEntry,
  DecayStatusResponse,
  DecayStatusEntry,
} from "./types";

// 純粋計算関数
export {
  calculateDecayedRisk,
  lambdaFromHalfLife,
  halfLifeFromLambda,
  daysUntilThreshold,
  daysBetween,
  RISK_THRESHOLD,
} from "./calculator";

// バッチ処理
export { runDecayBatch } from "./batch-processor";

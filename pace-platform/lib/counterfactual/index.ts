/**
 * PACE Platform — 反事実推論モジュール（バレルエクスポート）
 *
 * do-calculus に基づく介入シミュレーションの型・関数を再エクスポートする。
 *
 * PRD Phase 3 — Counterfactual Engine
 */

// 型定義
export type {
  InterventionType,
  Intervention,
  CounterfactualQuery,
  CounterfactualResult,
  CounterfactualResultSerialized,
  PresetIntervention,
  CounterfactualEvaluateResponse,
  CounterfactualPresetsResponse,
  CounterfactualErrorResponse,
} from "./types";

// エンジン関数
export {
  evaluateIntervention,
  generateCounterfactualNLG,
  serializeCounterfactualResult,
} from "./engine";

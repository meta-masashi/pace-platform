/**
 * PACE Platform — 動的ベイズネットワーク（DBN）モジュール（バレルエクスポート）
 *
 * 時間軸推論に関する型・関数を再エクスポートする。
 *
 * PRD Phase 3 — Dynamic Bayesian Network
 */

// 型定義
export type {
  TimeSlice,
  NodeState,
  ExternalInputs,
  TransitionModel,
  DBNResult,
  DBNSummary,
  DBNSimulateResponse,
  DBNResultSerialized,
  TimeSliceSerialized,
  DBNErrorResponse,
} from "./types";

// エンジン関数
export {
  buildTimeSlice,
  createTransitionModels,
  propagateForward,
  serializeTimeSlice,
  serializeDBNResult,
} from "./engine";

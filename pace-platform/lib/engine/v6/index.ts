/**
 * PACE v6.0 推論パイプライン — バレル再エクスポート
 *
 * エンジンのすべての公開型・設定・ノード実行モジュールを
 * 単一のエントリポイントから利用可能にする。
 *
 * Sprint 7: conditioning engine が数値基盤を提供し、
 * v6 パイプラインが専門家(AT/PT)の判断を支える推論を実行する。
 * 両者は補完関係にある。
 */

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export type {
  InferenceDecision,
  InferencePriority,
  TissueCategory,
  NodeId,
  ContextFlags,
  MedicalHistoryEntry,
  AthleteContext,
  DailyInput,
  NodeResult,
  DataQualityReport,
  FeatureVector,
  InferenceOutput,
  RecommendedAction,
  DecisionOutput,
  PipelineOutput,
  InferenceTraceLog,
  TissueDefaultParams,
  PipelineConfig,
  NodeExecutor,
} from './types';

// ---------------------------------------------------------------------------
// 設定
// ---------------------------------------------------------------------------

export {
  PIPELINE_VERSION,
  DEFAULT_PIPELINE_CONFIG,
  mergePipelineConfig,
} from './config';

// ---------------------------------------------------------------------------
// パイプライン
// ---------------------------------------------------------------------------

export { InferencePipeline } from './pipeline';

// ---------------------------------------------------------------------------
// ノード実行モジュール
// ---------------------------------------------------------------------------

export { node0Ingestion } from './nodes/node0-ingestion';
export type { IngestionOutput } from './nodes/node0-ingestion';

export { node1Cleaning } from './nodes/node1-cleaning';
export type { CleaningOutput } from './nodes/node1-cleaning';

export { node2FeatureEngineering } from './nodes/node2-feature-engineering';

export { node3Inference } from './nodes/node3-inference';

export { node4Decision } from './nodes/node4-decision';
export type { DecisionInput } from './nodes/node4-decision';

export { node5Presentation, LEGAL_DISCLAIMER, LEGAL_DISCLAIMER_EN } from './nodes/node5-presentation';
export type { PresentationOutput, PresentationInput } from './nodes/node5-presentation';

// ---------------------------------------------------------------------------
// ゲートウェイ
// ---------------------------------------------------------------------------

export { callODEEngine, callEKFEngine } from './gateway';
export type {
  ODERequestParams,
  ODEResponse,
  EKFRequestParams,
  EKFResponse,
} from './gateway';

// ---------------------------------------------------------------------------
// アダプター
// ---------------------------------------------------------------------------

export {
  adaptEWMA,
  adaptACWR,
  adaptDAGPosterior,
  wilsonScoreInterval,
} from './adapters';

export type {
  EWMAResult,
  ACWRResult,
  DAGPosteriorInput,
  DAGPosteriorResult,
} from './adapters';

/**
 * PACE v6.0 推論パイプライン — バレル再エクスポート
 *
 * エンジンのすべての公開型・設定・ノード実行モジュールを
 * 単一のエントリポイントから利用可能にする。
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

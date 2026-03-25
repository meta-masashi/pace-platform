/**
 * PACE Platform — オンライン学習モジュール（バレルエクスポート）
 *
 * Bayesian Online Learning による DAG ノード LR 自動更新に関する
 * 型・関数を再エクスポートする。
 */

// 型定義
export type {
  LearningDataPoint,
  LRUpdateResult,
  ModelVersion,
  ModelVersionSource,
  LearningBatchResult,
  ProposalStatus,
  LRUpdateProposal,
  ProposalsListResponse,
  ProposalReviewResponse,
  VersionsListResponse,
  RollbackResponse,
  LearningErrorResponse,
} from "./types";

// LR 更新計算（純関数）
export {
  calculateUpdatedLR,
  buildContingencyTable,
  calculateSensitivity,
  calculateSpecificity,
  calculateEmpiricalLR,
  blendLR,
  clampLR,
  calculateWilsonConfidenceWidth,
  checkSafetyBounds,
  calculateDeviationPct,
} from "./lr-updater";

// バッチ学習
export { runLearningBatch, generateNextVersion } from "./batch-updater";

// モデルバージョン管理
export {
  saveModelVersion,
  getModelVersion,
  getLatestVersion,
  listVersions,
  rollbackToVersion,
} from "./version-manager";

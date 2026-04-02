/**
 * PACE v6.0 推論パイプライン — デフォルト設定
 *
 * スペック文書で定義された全閾値・パラメータの規定値。
 * 組織ごとのカスタマイズは PipelineConfig を部分的にオーバーライドする。
 */

import type { PipelineConfig, ZScoreStage } from './types';

// ---------------------------------------------------------------------------
// パイプラインバージョン
// ---------------------------------------------------------------------------

/** 現在のパイプラインバージョン */
export const PIPELINE_VERSION = 'v6.0';

// ---------------------------------------------------------------------------
// デフォルト設定
// ---------------------------------------------------------------------------

/**
 * v6.0 パイプラインのデフォルト設定。
 *
 * 各閾値はスペック文書に基づく:
 * - P1（安全）: 痛み NRS ≥ 8、安静時心拍スパイク > 30%
 * - P2（機械的リスク）: ACWR > 1.5、Monotony > 2.0
 * - P3（デカップリング）: 基本閾値 1.5
 * - P4（ガス欠）: Z-Score ≤ -1.5 が 2 項目以上
 * - EWMA: 急性 λ = 0.25（7日相当）、慢性 λ = 0.07（28日相当）
 * - プレパレッドネス: w1 = 1.0、w2 = 2.0
 */
export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  version: PIPELINE_VERSION,
  thresholds: {
    painRedFlag: 8,
    restingHRSpikePercent: 30,
    acwrRedLine: 1.5,
    monotonyRedLine: 2.0,
    decouplingThreshold: 1.5,
    zScoreExhaustion: -1.5,
    zScoreMultipleCount: 2,
  },
  ewma: {
    acuteLambda: 0.25,
    chronicLambda: 0.07,
  },
  preparedness: {
    w1: 1.0,
    w2: 2.0,
  },
  tissueDefaults: {
    metabolic: {
      halfLifeDays: 2,
      alpha: 0.5,
      beta: 0.3,
      tau: 0.5,
      m: 1.5,
    },
    structural_soft: {
      halfLifeDays: 7,
      alpha: 0.3,
      beta: 0.1,
      tau: 0.8,
      m: 2.0,
    },
    structural_hard: {
      halfLifeDays: 21,
      alpha: 0.1,
      beta: 0.05,
      tau: 1.2,
      m: 2.5,
    },
    neuromotor: {
      halfLifeDays: 3,
      alpha: 0.4,
      beta: 0.2,
      tau: 0.6,
      m: 1.8,
    },
  },
};

// ---------------------------------------------------------------------------
// 段階的 Z-Score 重み付け（Go GraduatedZScoreWeight 準拠）
// ---------------------------------------------------------------------------

/**
 * データ蓄積日数に応じた Z-Score 段階的重み付け設定。
 *
 * Go エンジン `GraduatedZScoreWeight()` と完全一致:
 *   Day  0-13: 0%   (Z-Score 未使用)
 *   Day 14-21: 50%  (学習初期)
 *   Day 22-27: 75%  (学習後期)
 *   Day 28+  : 100% (完全モード)
 */
export const Z_SCORE_STAGES: ZScoreStage[] = [
  { minDays: 0, maxDays: 13, weight: 0.0 },
  { minDays: 14, maxDays: 21, weight: 0.5 },
  { minDays: 22, maxDays: 27, weight: 0.75 },
  { minDays: 28, maxDays: Infinity, weight: 1.0 },
];

// ---------------------------------------------------------------------------
// 設定マージユーティリティ
// ---------------------------------------------------------------------------

/**
 * 部分的なオーバーライドをデフォルト設定にマージする。
 *
 * @param overrides - 上書きしたい設定値（部分的）
 * @returns マージ済みの完全な PipelineConfig
 */
export function mergePipelineConfig(
  overrides: Partial<PipelineConfig>,
): PipelineConfig {
  return {
    version: overrides.version ?? DEFAULT_PIPELINE_CONFIG.version,
    thresholds: {
      ...DEFAULT_PIPELINE_CONFIG.thresholds,
      ...overrides.thresholds,
    },
    ewma: {
      ...DEFAULT_PIPELINE_CONFIG.ewma,
      ...overrides.ewma,
    },
    preparedness: {
      ...DEFAULT_PIPELINE_CONFIG.preparedness,
      ...overrides.preparedness,
    },
    tissueDefaults: {
      metabolic: {
        ...DEFAULT_PIPELINE_CONFIG.tissueDefaults.metabolic,
        ...overrides.tissueDefaults?.metabolic,
      },
      structural_soft: {
        ...DEFAULT_PIPELINE_CONFIG.tissueDefaults.structural_soft,
        ...overrides.tissueDefaults?.structural_soft,
      },
      structural_hard: {
        ...DEFAULT_PIPELINE_CONFIG.tissueDefaults.structural_hard,
        ...overrides.tissueDefaults?.structural_hard,
      },
      neuromotor: {
        ...DEFAULT_PIPELINE_CONFIG.tissueDefaults.neuromotor,
        ...overrides.tissueDefaults?.neuromotor,
      },
    },
  };
}

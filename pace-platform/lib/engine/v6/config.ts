/**
 * PACE v6.0 推論パイプライン — デフォルト設定
 *
 * スペック文書で定義された全閾値・パラメータの規定値。
 * 組織ごとのカスタマイズは PipelineConfig を部分的にオーバーライドする。
 */

import type { PipelineConfig } from './types';
import { sportConfigOverrides } from './config/sport-profiles';

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
// 競技別設定
// ---------------------------------------------------------------------------

/**
 * 競技に応じた PipelineConfig を生成する。
 * SportProfile の値を DEFAULT_PIPELINE_CONFIG に上書きマージする。
 *
 * @param sport - 競技ID（'soccer' | 'baseball' | 'basketball' | 'rugby' | 'other'）
 * @param overrides - 追加のカスタムオーバーライド（組織固有設定など）
 * @returns マージ済みの PipelineConfig
 */
export function configForSport(
  sport: string,
  overrides?: Partial<PipelineConfig>,
): PipelineConfig {
  const sportOverrides = sportConfigOverrides(sport);
  const merged = mergePipelineConfig(sportOverrides);
  if (overrides) {
    return mergePipelineConfig(overrides, merged);
  }
  return merged;
}

// ---------------------------------------------------------------------------
// 設定マージユーティリティ
// ---------------------------------------------------------------------------

/**
 * 部分的なオーバーライドをベース設定にマージする。
 *
 * @param overrides - 上書きしたい設定値（部分的）
 * @param base - ベース設定（省略時は DEFAULT_PIPELINE_CONFIG）
 * @returns マージ済みの完全な PipelineConfig
 */
export function mergePipelineConfig(
  overrides: Partial<PipelineConfig>,
  base: PipelineConfig = DEFAULT_PIPELINE_CONFIG,
): PipelineConfig {
  return {
    version: overrides.version ?? base.version,
    thresholds: {
      ...base.thresholds,
      ...overrides.thresholds,
    },
    ewma: {
      ...base.ewma,
      ...overrides.ewma,
    },
    preparedness: {
      ...base.preparedness,
      ...overrides.preparedness,
    },
    tissueDefaults: {
      metabolic: {
        ...base.tissueDefaults.metabolic,
        ...overrides.tissueDefaults?.metabolic,
      },
      structural_soft: {
        ...base.tissueDefaults.structural_soft,
        ...overrides.tissueDefaults?.structural_soft,
      },
      structural_hard: {
        ...base.tissueDefaults.structural_hard,
        ...overrides.tissueDefaults?.structural_hard,
      },
      neuromotor: {
        ...base.tissueDefaults.neuromotor,
        ...overrides.tissueDefaults?.neuromotor,
      },
    },
  };
}

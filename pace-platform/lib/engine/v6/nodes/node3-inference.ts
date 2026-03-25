/**
 * PACE v6.0 — Node 3: 推論エンジン
 *
 * 特徴量ベクトルからリスクスコアとベイズ事後確率を計算する。
 *
 * 処理内容:
 *   1. リスクスコア計算（ロジスティック関数による統合）
 *   2. ベイズ事後確率更新（DAG 因果割引モデル）
 *   3. 95% 信頼区間計算（Wilson スコア区間）
 *
 * 入力: FeatureVector（Node 2）
 * 出力: NodeResult<InferenceOutput>
 */

import type {
  AthleteContext,
  FeatureVector,
  InferenceOutput,
  NodeExecutor,
  NodeResult,
  PipelineConfig,
  TissueCategory,
} from '../types';
import { wilsonScoreInterval } from '../adapters/bayes-adapter';

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** リスクスコアの特徴量重み */
const FEATURE_WEIGHTS: Record<string, number> = {
  /** ACWR 超過分の重み */
  acwr_excess: 2.0,
  /** 単調性超過分の重み */
  monotony_excess: 1.5,
  /** プレパレッドネス負値の重み */
  preparedness_deficit: 1.0,
  /** 組織ダメージの重み */
  tissue_damage: 2.5,
  /** Z-Score 悪化の重み */
  z_score_negative: 0.8,
  /** デカップリングの重み */
  decoupling: 1.8,
};

/** ACWR の正常上限（これ超過で加重） */
const ACWR_NORMAL_UPPER = 1.3;

/** 単調性の正常上限（これ超過で加重） */
const MONOTONY_NORMAL_UPPER = 1.5;

/** 組織ダメージの警告閾値 */
const TISSUE_DAMAGE_WARNING = 0.5;

/** 身体部位のデフォルト一覧（ベース事前確率付き） */
const DEFAULT_BODY_PARTS: readonly string[] = [
  'knee',
  'ankle',
  'hip',
  'shoulder',
  'lower_back',
  'hamstring',
  'quadriceps',
  'calf',
  'general',
] as const;

/** 組織カテゴリと身体部位の対応マップ */
const TISSUE_TO_BODY_PARTS: Record<TissueCategory, readonly string[]> = {
  metabolic: ['general'],
  structural_soft: ['hamstring', 'quadriceps', 'calf'],
  structural_hard: ['knee', 'ankle', 'hip', 'lower_back'],
  neuromotor: ['shoulder', 'general'],
};

// ---------------------------------------------------------------------------
// リスクスコア計算
// ---------------------------------------------------------------------------

/**
 * ロジスティック関数（シグモイド）。
 *
 * @param x - 入力値
 * @returns シグモイド出力（0.0〜1.0）
 */
function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * 特徴量ベクトルから身体部位別のリスクスコアを計算する。
 *
 * 各部位のリスクスコアは以下の重み付き特徴量の合計に
 * ロジスティック関数を適用して算出する:
 *   risk = sigmoid(Σ weighted_features)
 *
 * @param featureVector - 特徴量ベクトル
 * @param context - 選手コンテキスト
 * @param config - パイプライン設定
 * @returns 身体部位別リスクスコア
 */
function calculateRiskScores(
  featureVector: FeatureVector,
  context: AthleteContext,
  config: PipelineConfig,
): Record<string, number> {
  const riskScores: Record<string, number> = {};

  // ACWR 超過分（正常範囲を超えた分のみ加重）
  const acwrExcess = Math.max(0, featureVector.acwr - ACWR_NORMAL_UPPER);

  // 単調性超過分
  const monotonyExcess = Math.max(
    0,
    featureVector.monotonyIndex - MONOTONY_NORMAL_UPPER,
  );

  // プレパレッドネス不足分（負値のみ加重）
  const preparednessDeficit = Math.max(0, -featureVector.preparedness);

  // Z-Score の悪化度合い（負の Z-Score の絶対値合計）
  let zScoreNegativeSum = 0;
  for (const z of Object.values(featureVector.zScores)) {
    if (z < 0) {
      zScoreNegativeSum += Math.abs(z);
    }
  }

  // デカップリングスコア
  const decouplingContribution = featureVector.decouplingScore ?? 0;

  // 各身体部位のリスクスコアを計算
  const bodyParts = new Set<string>([
    ...DEFAULT_BODY_PARTS,
    ...Object.keys(context.riskMultipliers),
  ]);

  for (const bodyPart of bodyParts) {
    // この部位に関連する組織カテゴリのダメージを集計
    let tissueContribution = 0;
    for (const [category, parts] of Object.entries(
      TISSUE_TO_BODY_PARTS,
    )) {
      if (parts.includes(bodyPart)) {
        const damage =
          featureVector.tissueDamage[category as TissueCategory] ?? 0;
        tissueContribution += Math.max(0, damage - TISSUE_DAMAGE_WARNING);
      }
    }

    // 既往歴に基づくリスク乗数
    const riskMultiplier = context.riskMultipliers[bodyPart] ?? 1.0;

    // 重み付き特徴量の合計（ゼロ中心からの偏差）
    const weightedSum =
      FEATURE_WEIGHTS['acwr_excess']! * acwrExcess +
      FEATURE_WEIGHTS['monotony_excess']! * monotonyExcess +
      FEATURE_WEIGHTS['preparedness_deficit']! * preparednessDeficit +
      FEATURE_WEIGHTS['tissue_damage']! * tissueContribution +
      FEATURE_WEIGHTS['z_score_negative']! * zScoreNegativeSum * 0.1 +
      FEATURE_WEIGHTS['decoupling']! * decouplingContribution;

    // ロジスティック関数でリスクスコアに変換（-3 シフトで 0.5 をベースライン付近に）
    const rawRisk = sigmoid(weightedSum - 3);

    // リスク乗数を適用（1.0 が基準）
    riskScores[bodyPart] = Math.min(1.0, rawRisk * riskMultiplier);
  }

  return riskScores;
}

// ---------------------------------------------------------------------------
// ベイズ事後確率更新
// ---------------------------------------------------------------------------

/**
 * ベイズ事後確率を計算する。
 *
 * 選手コンテキストの事前確率（bayesianPriors）に対して、
 * 特徴量ベクトルに基づくリスク情報で更新を行う。
 *
 * 簡易ベイズ更新: posterior ∝ prior × likelihood
 * ここでの likelihood はリスクスコアをそのまま使用する。
 *
 * @param priors - 部位別事前確率
 * @param riskScores - 部位別リスクスコア
 * @returns 部位別事後確率（正規化済み）
 */
function calculatePosteriors(
  priors: Record<string, number>,
  riskScores: Record<string, number>,
): Record<string, number> {
  const posteriors: Record<string, number> = {};
  const bodyParts = new Set<string>([
    ...Object.keys(priors),
    ...Object.keys(riskScores),
  ]);

  // 各部位の非正規化事後確率を計算
  let totalPosterior = 0;
  for (const bodyPart of bodyParts) {
    const prior = priors[bodyPart] ?? 0.05; // デフォルト事前確率 5%
    const risk = riskScores[bodyPart] ?? 0.0;

    // 尤度として risk を使用（risk が高いほど事後確率が上がる）
    // likelihood = 1 + risk * scaling_factor で事前確率を更新
    const likelihood = 1 + risk * 5.0;
    const rawPosterior = prior * likelihood;

    posteriors[bodyPart] = rawPosterior;
    totalPosterior += rawPosterior;
  }

  // 正規化（合計が 0 の場合は均等分布）
  if (totalPosterior > 0) {
    for (const bodyPart of bodyParts) {
      posteriors[bodyPart] = (posteriors[bodyPart] ?? 0) / totalPosterior;
    }
  } else {
    const uniform = 1 / bodyParts.size;
    for (const bodyPart of bodyParts) {
      posteriors[bodyPart] = uniform;
    }
  }

  return posteriors;
}

// ---------------------------------------------------------------------------
// 信頼区間計算
// ---------------------------------------------------------------------------

/**
 * 各部位の事後確率に対する 95% 信頼区間を計算する。
 *
 * Wilson スコア区間を使用し、データ蓄積日数を有効標本サイズとする。
 *
 * @param posteriors - 部位別事後確率
 * @param validDataDays - データ蓄積日数
 * @returns 部位別 95% 信頼区間
 */
function calculateConfidenceIntervals(
  posteriors: Record<string, number>,
  validDataDays: number,
): Record<string, [number, number]> {
  const intervals: Record<string, [number, number]> = {};

  for (const [bodyPart, posterior] of Object.entries(posteriors)) {
    intervals[bodyPart] = wilsonScoreInterval(posterior, validDataDays);
  }

  return intervals;
}

// ---------------------------------------------------------------------------
// Node 3 本体
// ---------------------------------------------------------------------------

/**
 * Node 3 実行モジュール: 推論エンジン。
 *
 * 以下の処理を行う:
 * 1. 特徴量ベクトルから身体部位別リスクスコアを算出
 * 2. ベイズ事後確率を更新（事前確率 × リスク尤度）
 * 3. Wilson スコア区間で 95% 信頼区間を計算
 */
export const node3Inference: NodeExecutor<FeatureVector, InferenceOutput> =
  {
    nodeId: 'node3_inference',

    async execute(
      input: FeatureVector,
      context: AthleteContext,
      config: PipelineConfig,
    ): Promise<NodeResult<InferenceOutput>> {
      const startMs = performance.now();
      const warnings: string[] = [];

      // ----- Step 1: リスクスコア計算 -----
      const riskScores = calculateRiskScores(input, context, config);

      // ----- Step 2: ベイズ事後確率更新 -----
      const posteriorProbabilities = calculatePosteriors(
        context.bayesianPriors,
        riskScores,
      );

      // ----- Step 3: 信頼区間計算 -----
      const confidenceIntervals = calculateConfidenceIntervals(
        posteriorProbabilities,
        context.validDataDays,
      );

      // ----- 警告チェック -----
      // 事前確率が設定されていない部位がある場合
      const priorsSet = new Set(Object.keys(context.bayesianPriors));
      const riskSet = new Set(Object.keys(riskScores));
      for (const bodyPart of riskSet) {
        if (!priorsSet.has(bodyPart)) {
          warnings.push(
            `部位 "${bodyPart}" の事前確率が未設定のためデフォルト値（0.05）を使用`,
          );
        }
      }

      const inferenceOutput: InferenceOutput = {
        riskScores,
        posteriorProbabilities,
        confidenceIntervals,
      };

      return {
        nodeId: 'node3_inference',
        success: true,
        executionTimeMs: performance.now() - startMs,
        data: inferenceOutput,
        warnings,
      };
    },
  };

/**
 * PACE v6.0 — Node 2: 特徴量エンジニアリング
 *
 * 複数データソースを統合し、推論に必要な特徴量ベクトルを構築する。
 *
 * 処理内容:
 *   1. ACWR 計算（EWMA ベース、急性 λ=0.25 / 慢性 λ=0.07）
 *   2. 単調性指標（Monotony Index）
 *   3. プレパレッドネス（Preparedness = w1 * chronic - w2 * max_tissue_acute）
 *   4. Z-Score 計算（28日履歴ベース、14日未満は null）
 *   5. ODE 組織ダメージ D(t)（Python ゲートウェイ経由）
 *   6. EKF デカップリング（Python ゲートウェイ経由、客観負荷がある場合のみ）
 *
 * 入力: CleaningOutput（Node 1）+ 履歴データ（DailyInput[]）
 * 出力: NodeResult<FeatureVector>
 */

import type {
  AthleteContext,
  DailyInput,
  FeatureVector,
  NodeExecutor,
  NodeResult,
  PipelineConfig,
  TissueCategory,
} from '../types';
import type { CleaningOutput } from './node1-cleaning';
import { adaptACWR } from '../adapters/conditioning-adapter';
import { callODEEngine, callEKFEngine } from '../gateway';

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** Z-Score 計算に必要な最小データ蓄積日数 */
const Z_SCORE_MIN_DAYS = 14;

/** Z-Score 計算の参照期間（日数） */
const Z_SCORE_WINDOW_DAYS = 28;

/** 単調性指標の σ ≈ 0 判定閾値 */
const MONOTONY_SIGMA_EPSILON = 1e-6;

/** σ ≈ 0 時の高単調性フォールバック値 */
const MONOTONY_HIGH_FALLBACK = 3.0;

/** 単調性指標の計算期間（日数） */
const MONOTONY_WINDOW_DAYS = 7;

/** 組織カテゴリ一覧 */
const TISSUE_CATEGORIES: readonly TissueCategory[] = [
  'metabolic',
  'structural_soft',
  'structural_hard',
  'neuromotor',
] as const;

/** 主観スコアのキー一覧（Z-Score 計算対象） */
const SUBJECTIVE_KEYS = [
  'sleepQuality',
  'fatigue',
  'mood',
  'muscleSoreness',
  'stressLevel',
  'painNRS',
] as const;

// ---------------------------------------------------------------------------
// 単調性指標
// ---------------------------------------------------------------------------

/**
 * 単調性指標（Monotony Index）を計算する。
 *
 * Monotony = μ(直近7日負荷) / σ(直近7日負荷)
 * σ ≈ 0 の場合（全日同一負荷）は高単調性（3.0）を返す。
 *
 * @param history - 日次入力データの履歴（古い順）
 * @returns 単調性指標値
 */
function calculateMonotonyIndex(history: DailyInput[]): number {
  const recentLoads = history
    .slice(-MONOTONY_WINDOW_DAYS)
    .map((d) => d.sessionLoad);

  if (recentLoads.length === 0) {
    return 0;
  }

  const n = recentLoads.length;
  const mean = recentLoads.reduce((sum, v) => sum + v, 0) / n;

  const variance =
    recentLoads.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n;
  const sigma = Math.sqrt(variance);

  if (sigma < MONOTONY_SIGMA_EPSILON) {
    return MONOTONY_HIGH_FALLBACK;
  }

  return mean / sigma;
}

// ---------------------------------------------------------------------------
// プレパレッドネス
// ---------------------------------------------------------------------------

/**
 * プレパレッドネスを計算する。
 *
 * Preparedness = w1 * EWMA_chronic - w2 * max(tissue_acute_loads)
 *
 * @param chronicEWMA - 慢性負荷 EWMA
 * @param maxTissueAcuteLoad - 組織別急性負荷の最大値
 * @param config - パイプライン設定
 * @returns プレパレッドネス値
 */
function calculatePreparedness(
  chronicEWMA: number,
  maxTissueAcuteLoad: number,
  config: PipelineConfig,
): number {
  return (
    config.preparedness.w1 * chronicEWMA -
    config.preparedness.w2 * maxTissueAcuteLoad
  );
}

// ---------------------------------------------------------------------------
// Z-Score 計算
// ---------------------------------------------------------------------------

/**
 * 主観スコアの Z-Score を 28 日履歴から計算する。
 *
 * Z = (today - μ_28d) / σ_28d
 * データ蓄積日数が 14 日未満の場合は null Z-Score を返す。
 *
 * @param today - 当日の主観スコア
 * @param history - 日次入力データの履歴（古い順）
 * @param validDataDays - データ蓄積日数
 * @returns 各主観指標の Z-Score マップ
 */
function calculateZScores(
  today: DailyInput['subjectiveScores'],
  history: DailyInput[],
  validDataDays: number,
): Record<string, number> {
  const zScores: Record<string, number> = {};

  // データ蓄積が不十分な場合は空マップを返す
  if (validDataDays < Z_SCORE_MIN_DAYS) {
    return zScores;
  }

  const windowData = history.slice(-Z_SCORE_WINDOW_DAYS);
  if (windowData.length < Z_SCORE_MIN_DAYS) {
    return zScores;
  }

  for (const key of SUBJECTIVE_KEYS) {
    const values = windowData.map((d) => d.subjectiveScores[key]);
    const n = values.length;

    if (n === 0) {
      continue;
    }

    const mean = values.reduce((sum, v) => sum + v, 0) / n;
    const variance =
      values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n;
    const sigma = Math.sqrt(variance);

    if (sigma < MONOTONY_SIGMA_EPSILON) {
      // 分散がほぼ 0 の場合、Z-Score は 0（変化なし）
      zScores[key] = 0;
      continue;
    }

    zScores[key] = (today[key] - mean) / sigma;
  }

  return zScores;
}

// ---------------------------------------------------------------------------
// ODE 組織ダメージ計算
// ---------------------------------------------------------------------------

/**
 * 各組織カテゴリの ODE ダメージ D(t) を計算する。
 *
 * Python ODE エンジンに各組織の負荷履歴とパラメータを送信し、
 * ダメージ値を取得する。サービス不可時はフォールバック値を使用。
 *
 * @param history - 日次入力データの履歴（古い順）
 * @param context - 選手コンテキスト
 * @param config - パイプライン設定
 * @returns 組織カテゴリ別ダメージ値
 */
async function calculateTissueDamage(
  history: DailyInput[],
  context: AthleteContext,
  config: PipelineConfig,
): Promise<Record<TissueCategory, number>> {
  const loadHistory = history.map((d) => d.sessionLoad);
  const results: Record<TissueCategory, number> = {
    metabolic: 0,
    structural_soft: 0,
    structural_hard: 0,
    neuromotor: 0,
  };

  // 各組織カテゴリで並行して ODE 計算を実行
  const promises = TISSUE_CATEGORIES.map(async (category) => {
    const tissueParams = config.tissueDefaults[category];
    const response = await callODEEngine({
      tissueCategory: category,
      loadHistory,
      tissueParams: {
        halfLifeDays:
          context.tissueHalfLifes[category] ?? tissueParams.halfLifeDays,
        alpha: tissueParams.alpha,
        beta: tissueParams.beta,
        tau: tissueParams.tau,
        m: tissueParams.m,
      },
    });
    results[category] = response.damage;
  });

  await Promise.all(promises);

  return results;
}

// ---------------------------------------------------------------------------
// EKF デカップリング計算
// ---------------------------------------------------------------------------

/**
 * EKF デカップリングスコアを計算する。
 *
 * 客観的負荷データが利用可能な場合のみ実行する。
 * Python EKF エンジンに主観/客観負荷履歴を送信し、
 * デカップリングスコアを取得する。
 *
 * @param history - 日次入力データの履歴（古い順）
 * @param todayInput - 当日の入力データ
 * @returns デカップリングスコア（客観負荷がない場合は undefined）
 */
async function calculateDecoupling(
  history: DailyInput[],
  todayInput: DailyInput,
): Promise<number | undefined> {
  // 客観的負荷データがない場合はスキップ
  if (!todayInput.objectiveLoad) {
    return undefined;
  }

  const subjectiveLoadHistory = history.map((d) => d.sessionLoad);
  const objectiveLoadHistory = history
    .filter((d) => d.objectiveLoad != null)
    .map((d) => {
      const obj = d.objectiveLoad;
      // 客観負荷の代表値としてプレーヤーロードまたは走行距離を使用
      return obj?.playerLoad ?? (obj?.distanceKm ?? 0) * 100;
    });

  // 客観負荷履歴が不足している場合はスキップ
  if (objectiveLoadHistory.length < Z_SCORE_MIN_DAYS) {
    return undefined;
  }

  const response = await callEKFEngine({
    subjectiveLoadHistory,
    objectiveLoadHistory,
    deviceKappa: todayInput.objectiveLoad.deviceKappa,
  });

  return response.decouplingScore;
}

// ---------------------------------------------------------------------------
// Node 2 本体
// ---------------------------------------------------------------------------

/**
 * Node 2 実行モジュール: 特徴量エンジニアリング。
 *
 * 以下の処理を行う:
 * 1. ACWR 計算（EWMA ベース）
 * 2. 単調性指標（Monotony Index）計算
 * 3. Z-Score 計算（28日履歴ベース）
 * 4. ODE 組織ダメージ D(t) 計算
 * 5. EKF デカップリング計算
 * 6. プレパレッドネス計算
 * 7. 特徴量ベクトルの組み立て
 */
export const node2FeatureEngineering: NodeExecutor<
  CleaningOutput & { history: DailyInput[] },
  FeatureVector
> = {
  nodeId: 'node2_feature',

  async execute(
    input: CleaningOutput & { history: DailyInput[] },
    context: AthleteContext,
    config: PipelineConfig,
  ): Promise<NodeResult<FeatureVector>> {
    const startMs = performance.now();
    const warnings: string[] = [];

    const { cleanedInput, history } = input;

    // 当日データを含む完全な履歴を構築
    const fullHistory = [...history, cleanedInput];

    // ----- Step 1: ACWR 計算 -----
    const acwrResult = adaptACWR(fullHistory, config);

    // ----- Step 2: 単調性指標 -----
    const monotonyIndex = calculateMonotonyIndex(fullHistory);

    // ----- Step 3: Z-Score 計算 -----
    const zScores = calculateZScores(
      cleanedInput.subjectiveScores,
      history,
      context.validDataDays,
    );

    if (Object.keys(zScores).length === 0 && context.validDataDays < Z_SCORE_MIN_DAYS) {
      warnings.push(
        `データ蓄積日数（${context.validDataDays}日）が ${Z_SCORE_MIN_DAYS} 日未満のため Z-Score は未計算`,
      );
    }

    // ----- Step 4: ODE 組織ダメージ計算 -----
    const tissueDamage = await calculateTissueDamage(
      fullHistory,
      context,
      config,
    );

    // ----- Step 5: EKF デカップリング計算 -----
    const decouplingScore = await calculateDecoupling(history, cleanedInput);

    // ----- Step 6: プレパレッドネス計算 -----
    // 組織別急性負荷の最大値
    const maxTissueAcuteLoad = Math.max(
      ...Object.values(tissueDamage),
      0,
    );
    const preparedness = calculatePreparedness(
      acwrResult.chronicEWMA,
      maxTissueAcuteLoad,
      config,
    );

    // ----- Step 7: 特徴量ベクトル組み立て -----
    const featureVector: FeatureVector = {
      acwr: acwrResult.acwr,
      monotonyIndex,
      preparedness,
      tissueDamage,
      zScores,
      ...(decouplingScore !== undefined ? { decouplingScore } : {}),
    };

    return {
      nodeId: 'node2_feature',
      success: true,
      executionTimeMs: performance.now() - startMs,
      data: featureVector,
      warnings,
    };
  },
};

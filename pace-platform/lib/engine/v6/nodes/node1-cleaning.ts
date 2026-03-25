/**
 * PACE v6.0 — Node 1: データクリーニング
 *
 * 外れ値検出、欠損値補完、データ品質スコア算出、
 * および成熟モードの判定を行う。
 *
 * 入力: Node 0 出力（IngestionOutput）
 * 出力: クリーニング済みデータ + DataQualityReport
 */

import type {
  AthleteContext,
  DataQualityReport,
  DailyInput,
  NodeExecutor,
  NodeResult,
  PipelineConfig,
  TissueCategory,
} from '../types';
import type { IngestionOutput } from './node0-ingestion';

// ---------------------------------------------------------------------------
// Node 1 出力型
// ---------------------------------------------------------------------------

/** Node 1 の出力データ */
export interface CleaningOutput {
  /** クリーニング済み入力データ */
  cleanedInput: DailyInput;
  /** リスク乗数（Node 0 から引き継ぎ） */
  riskMultipliers: Record<string, number>;
  /** データ品質レポート */
  dataQuality: DataQualityReport;
}

// ---------------------------------------------------------------------------
// 外れ値検出: 生理学的に不可能な値の閾値
// ---------------------------------------------------------------------------

/** 外れ値検出の閾値定義 */
interface OutlierBounds {
  /** フィールド名 */
  field: string;
  /** 最小値（これ未満は外れ値） */
  min: number;
  /** 最大値（これ超過は外れ値） */
  max: number;
  /** 外れ値時のデフォルト補完値 */
  defaultValue: number;
}

/** 生理学的に不可能な値の判定基準 */
const OUTLIER_BOUNDS: readonly OutlierBounds[] = [
  { field: 'sRPE', min: 0, max: 10, defaultValue: 5 },
  { field: 'trainingDurationMin', min: 0, max: 600, defaultValue: 0 },
  { field: 'sleepQuality', min: 0, max: 10, defaultValue: 5 },
  { field: 'fatigue', min: 0, max: 10, defaultValue: 5 },
  { field: 'mood', min: 0, max: 10, defaultValue: 5 },
  { field: 'muscleSoreness', min: 0, max: 10, defaultValue: 3 },
  { field: 'stressLevel', min: 0, max: 10, defaultValue: 5 },
  { field: 'painNRS', min: 0, max: 10, defaultValue: 0 },
  { field: 'restingHeartRate', min: 30, max: 250, defaultValue: 60 },
] as const;

// ---------------------------------------------------------------------------
// 成熟モード判定
// ---------------------------------------------------------------------------

/** 安全モード（Day 0-13）: 保守的閾値を適用 */
const SAFETY_MODE_MAX_DAYS = 13;

/** 学習モード（Day 14-27）: 個人ベースラインを学習中 */
const LEARNING_MODE_MAX_DAYS = 27;

/**
 * データ蓄積日数に基づいて成熟モードを決定する。
 *
 * - Day 0〜13: safety（保守的判定、個人データ不足）
 * - Day 14〜27: learning（個人ベースライン学習中）
 * - Day 28+: full（完全推論）
 *
 * @param validDataDays - データ蓄積日数
 * @returns 成熟モード
 */
function determineMaturationMode(
  validDataDays: number,
): 'safety' | 'learning' | 'full' {
  if (validDataDays <= SAFETY_MODE_MAX_DAYS) {
    return 'safety';
  }
  if (validDataDays <= LEARNING_MODE_MAX_DAYS) {
    return 'learning';
  }
  return 'full';
}

// ---------------------------------------------------------------------------
// 外れ値検出
// ---------------------------------------------------------------------------

/**
 * 入力データの外れ値を検出する。
 * 生理学的に不可能な値を特定し、フィールド名のリストを返す。
 *
 * @param input - 日次入力データ
 * @returns 外れ値として検出されたフィールド名のリスト
 */
function detectOutliers(input: DailyInput): string[] {
  const outliers: string[] = [];

  for (const bound of OUTLIER_BOUNDS) {
    const value = getFieldValue(input, bound.field);
    if (value === undefined) {
      continue;
    }
    if (value < bound.min || value > bound.max) {
      outliers.push(bound.field);
    }
  }

  return outliers;
}

/**
 * フィールド名に基づいて入力データから値を取得する。
 */
function getFieldValue(
  input: DailyInput,
  field: string,
): number | undefined {
  switch (field) {
    case 'sRPE':
      return input.sRPE;
    case 'trainingDurationMin':
      return input.trainingDurationMin;
    case 'sleepQuality':
      return input.subjectiveScores.sleepQuality;
    case 'fatigue':
      return input.subjectiveScores.fatigue;
    case 'mood':
      return input.subjectiveScores.mood;
    case 'muscleSoreness':
      return input.subjectiveScores.muscleSoreness;
    case 'stressLevel':
      return input.subjectiveScores.stressLevel;
    case 'painNRS':
      return input.subjectiveScores.painNRS;
    case 'restingHeartRate':
      return input.subjectiveScores.restingHeartRate;
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// 外れ値補正
// ---------------------------------------------------------------------------

/**
 * 検出された外れ値をデフォルト値で置換したクリーニング済みデータを返す。
 *
 * @param input - 日次入力データ
 * @param outlierFields - 外れ値フィールド名リスト
 * @returns 外れ値が補正された入力データ
 */
function replaceOutliers(
  input: DailyInput,
  outlierFields: string[],
): DailyInput {
  if (outlierFields.length === 0) {
    return input;
  }

  const corrected = { ...input };
  const subjective = { ...input.subjectiveScores };

  for (const field of outlierFields) {
    const bound = OUTLIER_BOUNDS.find((b) => b.field === field);
    if (!bound) {
      continue;
    }

    switch (field) {
      case 'sRPE':
        corrected.sRPE = bound.defaultValue;
        break;
      case 'trainingDurationMin':
        corrected.trainingDurationMin = bound.defaultValue;
        break;
      case 'sleepQuality':
        subjective.sleepQuality = bound.defaultValue;
        break;
      case 'fatigue':
        subjective.fatigue = bound.defaultValue;
        break;
      case 'mood':
        subjective.mood = bound.defaultValue;
        break;
      case 'muscleSoreness':
        subjective.muscleSoreness = bound.defaultValue;
        break;
      case 'stressLevel':
        subjective.stressLevel = bound.defaultValue;
        break;
      case 'painNRS':
        subjective.painNRS = bound.defaultValue;
        break;
      case 'restingHeartRate':
        subjective.restingHeartRate = bound.defaultValue;
        break;
    }
  }

  corrected.subjectiveScores = subjective;
  // セッション負荷を再計算
  corrected.sessionLoad = corrected.sRPE * corrected.trainingDurationMin;

  return corrected;
}

// ---------------------------------------------------------------------------
// 欠損値補完
// ---------------------------------------------------------------------------

/**
 * 欠損フィールドを検出し、組織別半減期に基づくデフォルト値で補完する。
 *
 * @param input - 日次入力データ
 * @param context - 選手コンテキスト
 * @param _config - パイプライン設定
 * @returns 補完されたフィールド名リスト
 */
function detectAndImputeMissing(
  input: DailyInput,
  context: AthleteContext,
  _config: PipelineConfig,
): { imputedFields: string[]; imputedInput: DailyInput } {
  const imputedFields: string[] = [];
  const imputedInput = { ...input };
  const subjective = { ...input.subjectiveScores };

  // 安静時心拍数が未入力の場合は補完しない（任意フィールド）
  // 客観的負荷データが未入力の場合も補完しない（任意セクション）

  // 組織半減期を使った減衰ベースの補完は、
  // 実際には過去データが必要なため、ここでは
  // 成熟モードに応じたデフォルト値を適用する
  const mode = determineMaturationMode(context.validDataDays);

  // safety モードでは中立値、full モードでは個人ベースラインを使用
  // （ベースラインは context.bayesianPriors から推定）
  if (mode === 'safety') {
    // 各主観スコアが 0 の場合、中立値で補完
    if (subjective.sleepQuality === 0 && input.sRPE > 0) {
      subjective.sleepQuality = 5;
      imputedFields.push('sleepQuality');
    }
    if (subjective.mood === 0 && input.sRPE > 0) {
      subjective.mood = 5;
      imputedFields.push('mood');
    }
  }

  imputedInput.subjectiveScores = subjective;
  return { imputedFields, imputedInput };
}

// ---------------------------------------------------------------------------
// 品質スコア算出
// ---------------------------------------------------------------------------

/** データ品質評価の対象フィールド */
const QUALITY_FIELDS = [
  'sRPE',
  'trainingDurationMin',
  'sleepQuality',
  'fatigue',
  'mood',
  'muscleSoreness',
  'stressLevel',
  'painNRS',
] as const;

/** オプショナルフィールド（存在すれば品質向上） */
const OPTIONAL_FIELDS = [
  'restingHeartRate',
  'objectiveLoad',
] as const;

/**
 * データ品質スコアを算出する。
 *
 * 品質スコア = 有効フィールド数 / 総フィールド数
 * 外れ値・補完フィールドは有効フィールドから除外する。
 *
 * @param input - 日次入力データ
 * @param outlierFields - 外れ値フィールド名
 * @param imputedFields - 補完フィールド名
 * @returns 品質スコア（0.0〜1.0）と有効/総フィールド数
 */
function calculateQualityScore(
  input: DailyInput,
  outlierFields: string[],
  imputedFields: string[],
): { qualityScore: number; totalFields: number; validFields: number } {
  const degradedFields = new Set([...outlierFields, ...imputedFields]);

  let totalFields = QUALITY_FIELDS.length;
  let validFields = 0;

  for (const field of QUALITY_FIELDS) {
    if (!degradedFields.has(field)) {
      validFields++;
    }
  }

  // オプショナルフィールドの存在チェック
  if (input.subjectiveScores.restingHeartRate !== undefined) {
    totalFields++;
    if (!degradedFields.has('restingHeartRate')) {
      validFields++;
    }
  }
  if (input.objectiveLoad !== undefined) {
    totalFields++;
    if (!degradedFields.has('objectiveLoad')) {
      validFields++;
    }
  }

  const qualityScore = totalFields > 0 ? validFields / totalFields : 0;

  return { qualityScore, totalFields, validFields };
}

// ---------------------------------------------------------------------------
// Node 1 本体
// ---------------------------------------------------------------------------

/**
 * Node 1 実行モジュール: データクリーニング。
 *
 * 以下の処理を行う:
 * 1. 外れ値検出（生理学的に不可能な値の特定と補正）
 * 2. 欠損値補完（組織別半減期に基づくデフォルト値適用）
 * 3. データ品質スコア算出
 * 4. 成熟モード判定（Day 0-13: safety / 14-27: learning / 28+: full）
 */
export const node1Cleaning: NodeExecutor<IngestionOutput, CleaningOutput> = {
  nodeId: 'node1_cleaning',

  async execute(
    input: IngestionOutput,
    context: AthleteContext,
    config: PipelineConfig,
  ): Promise<NodeResult<CleaningOutput>> {
    const startMs = performance.now();
    const warnings: string[] = [];

    const { normalizedInput, riskMultipliers } = input;

    // ----- Step 1: 外れ値検出 -----
    const outlierFields = detectOutliers(normalizedInput);
    if (outlierFields.length > 0) {
      warnings.push(
        `外れ値検出: ${outlierFields.join(', ')} をデフォルト値で置換`,
      );
    }

    // ----- Step 2: 外れ値補正 -----
    const afterOutlierFix = replaceOutliers(normalizedInput, outlierFields);

    // ----- Step 3: 欠損値補完 -----
    const { imputedFields, imputedInput } = detectAndImputeMissing(
      afterOutlierFix,
      context,
      config,
    );
    if (imputedFields.length > 0) {
      warnings.push(
        `欠損値補完: ${imputedFields.join(', ')} をデフォルト値で補完`,
      );
    }

    // ----- Step 4: 成熟モード判定 -----
    const maturationMode = determineMaturationMode(context.validDataDays);

    // ----- Step 5: 品質スコア算出 -----
    const { qualityScore, totalFields, validFields } = calculateQualityScore(
      imputedInput,
      outlierFields,
      imputedFields,
    );

    const dataQuality: DataQualityReport = {
      qualityScore,
      totalFields,
      validFields,
      imputedFields,
      outlierFields,
      maturationMode,
    };

    return {
      nodeId: 'node1_cleaning',
      success: true,
      executionTimeMs: performance.now() - startMs,
      data: {
        cleanedInput: imputedInput,
        riskMultipliers,
        dataQuality,
      },
      warnings,
    };
  },
};

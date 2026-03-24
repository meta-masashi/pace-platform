/**
 * PACE Platform — コンディショニングスコアエンジン（Hybrid Peaking モデル）
 *
 * フィットネス/疲労モデル（Banister TRIMP 系）をベースにしたコンディショニング
 * スコアの算出ロジック。
 *
 * アルゴリズム概要:
 *   1. フィットネス = EWMA(sRPE, 42日)
 *   2. 疲労 = EWMA(sRPE, 7日) + 主観ペナルティ（睡眠・疲労スコア）
 *   3. Readiness = normalize(フィットネス − 疲労, 0, 100)
 *   4. Pro Mode: HRV がベースラインを下回った場合、疲労に係数を乗算
 *   5. ACWR = 7日間負荷 / 28日間負荷（後方互換性維持）
 */

import type {
  ConditioningInput,
  ConditioningPenalties,
  ConditioningResult,
  DailyMetricRow,
} from "./types";
import {
  calculateEWMA,
  FITNESS_EWMA_SPAN,
  FATIGUE_EWMA_SPAN,
} from "./ewma";

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** ACWR 急性負荷期間（日数）*/
const ACWR_ACUTE_DAYS = 7;

/** ACWR 慢性負荷期間（日数）*/
const ACWR_CHRONIC_DAYS = 28;

/** 睡眠スコアの「不良」閾値（これ以下でペナルティ発生）*/
const SLEEP_POOR_THRESHOLD = 5;

/** 主観的疲労の「高い」閾値（これ以上でペナルティ発生）*/
const FATIGUE_HIGH_THRESHOLD = 6;

/** 睡眠ペナルティの最大値 */
const SLEEP_PENALTY_MAX = 15;

/** 疲労ペナルティの最大値 */
const FATIGUE_PENALTY_MAX = 10;

/** HRV ペナルティ係数（HRV がベースラインを下回った場合の疲労増幅率）*/
const HRV_PENALTY_COEFFICIENT = 1 / 0.85;

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

/**
 * 値を [min, max] の範囲にクランプする。
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * sRPE 時系列を DailyMetricRow 配列から抽出する（古い順）。
 * null 値は 0 として扱う。
 */
function extractSrpeTimeSeries(rows: DailyMetricRow[]): number[] {
  return rows.map((row) => row.srpe ?? 0);
}

/**
 * 直近 N 日間の sRPE 合計を計算する。
 */
function sumRecentDays(srpeValues: number[], days: number): number {
  const start = Math.max(0, srpeValues.length - days);
  let sum = 0;
  for (let i = start; i < srpeValues.length; i++) {
    sum += srpeValues[i]!;
  }
  return sum;
}

// ---------------------------------------------------------------------------
// ペナルティ計算
// ---------------------------------------------------------------------------

/**
 * 睡眠スコアからペナルティを計算する。
 *
 * 睡眠スコアが閾値以下の場合、スコアに比例したペナルティを返す。
 * ペナルティ計算式: (閾値 − 睡眠スコア) / 閾値 × 最大ペナルティ
 *
 * @param sleepScore 睡眠スコア（0-10）
 * @returns ペナルティ値（0 以上）
 */
function calculateSleepPenalty(sleepScore: number): number {
  if (sleepScore >= SLEEP_POOR_THRESHOLD) {
    return 0;
  }

  const deficit = SLEEP_POOR_THRESHOLD - sleepScore;
  return (deficit / SLEEP_POOR_THRESHOLD) * SLEEP_PENALTY_MAX;
}

/**
 * 主観的疲労からペナルティを計算する。
 *
 * 疲労スコアが閾値以上の場合、超過分に比例したペナルティを返す。
 * ペナルティ計算式: (疲労 − 閾値) / (10 − 閾値) × 最大ペナルティ
 *
 * @param fatigueSubjective 主観的疲労度（0-10）
 * @returns ペナルティ値（0 以上）
 */
function calculateFatiguePenalty(fatigueSubjective: number): number {
  if (fatigueSubjective <= FATIGUE_HIGH_THRESHOLD) {
    return 0;
  }

  const excess = fatigueSubjective - FATIGUE_HIGH_THRESHOLD;
  const range = 10 - FATIGUE_HIGH_THRESHOLD;
  return (excess / range) * FATIGUE_PENALTY_MAX;
}

// ---------------------------------------------------------------------------
// ACWR 計算
// ---------------------------------------------------------------------------

/**
 * Acute:Chronic Workload Ratio を計算する。
 *
 * ACWR = 7日間平均負荷 / 28日間平均負荷
 * 慢性負荷が 0 の場合は 0 を返す（ゼロ除算防止）。
 *
 * @param srpeValues sRPE 時系列（古い順、当日の値を含む）
 * @returns ACWR 値
 */
function calculateACWR(srpeValues: number[]): number {
  const acuteLoad = sumRecentDays(srpeValues, ACWR_ACUTE_DAYS);
  const chronicLoad = sumRecentDays(srpeValues, ACWR_CHRONIC_DAYS);

  const acuteAvg = acuteLoad / ACWR_ACUTE_DAYS;
  const chronicAvg = chronicLoad / ACWR_CHRONIC_DAYS;

  if (chronicAvg === 0) {
    return 0;
  }

  return acuteAvg / chronicAvg;
}

// ---------------------------------------------------------------------------
// メインエンジン
// ---------------------------------------------------------------------------

/**
 * コンディショニングスコアを算出する。
 *
 * Hybrid Peaking モデルに基づき、EWMA ベースのフィットネス/疲労バランスから
 * 選手のレディネス（準備状態）を 0-100 のスコアとして算出する。
 *
 * @param history  過去の daily_metrics 行（日付昇順ソート済みであること）
 * @param today    当日の入力データ
 * @returns コンディショニングスコア算出結果
 *
 * @example
 * ```ts
 * const result = calculateConditioningScore(last42DaysMetrics, {
 *   srpe: 450,
 *   sleepScore: 7,
 *   fatigueSubjective: 4,
 * });
 * console.log(result.conditioningScore); // 72.5
 * ```
 */
export function calculateConditioningScore(
  history: DailyMetricRow[],
  today: ConditioningInput
): ConditioningResult {
  // 当日のデータを含む時系列を構築
  const todayRow: DailyMetricRow = {
    date: new Date().toISOString().split("T")[0]!,
    srpe: today.srpe,
    sleepScore: today.sleepScore,
    fatigueSubjective: today.fatigueSubjective,
    hrv: today.hrv ?? null,
    hrvBaseline: today.hrvBaseline ?? null,
  };
  const allRows = [...history, todayRow];

  // sRPE 時系列を抽出
  const srpeTimeSeries = extractSrpeTimeSeries(allRows);

  // -----------------------------------------------------------------------
  // 1. フィットネス EWMA（42日スパン）
  // -----------------------------------------------------------------------
  const fitnessEwma = calculateEWMA(srpeTimeSeries, FITNESS_EWMA_SPAN);

  // -----------------------------------------------------------------------
  // 2. 疲労 EWMA（7日スパン）+ 主観ペナルティ
  // -----------------------------------------------------------------------
  const rawFatigueEwma = calculateEWMA(srpeTimeSeries, FATIGUE_EWMA_SPAN);

  const sleepPenalty = calculateSleepPenalty(today.sleepScore);
  const fatiguePenalty = calculateFatiguePenalty(today.fatigueSubjective);

  let adjustedFatigueEwma = rawFatigueEwma + sleepPenalty + fatiguePenalty;

  // -----------------------------------------------------------------------
  // 3. Pro Mode: HRV ベースライン補正
  // -----------------------------------------------------------------------
  const isProMode =
    today.hrv !== undefined &&
    today.hrvBaseline !== undefined &&
    today.hrv > 0 &&
    today.hrvBaseline > 0;

  let hrvPenaltyCoefficient: number | null = null;

  if (isProMode) {
    const hrvRatio = today.hrv! / today.hrvBaseline!;
    if (hrvRatio < 1.0) {
      // HRV がベースラインを下回っている場合、疲労を増幅
      hrvPenaltyCoefficient = HRV_PENALTY_COEFFICIENT;
      adjustedFatigueEwma *= hrvPenaltyCoefficient;
    }
  }

  // -----------------------------------------------------------------------
  // 4. レディネス = normalize(フィットネス − 疲労, 0, 100)
  // -----------------------------------------------------------------------
  const rawReadiness = fitnessEwma - adjustedFatigueEwma;

  // フィットネスが 0 の場合（データ不足）、スコアは 50（中立値）
  let conditioningScore: number;
  if (fitnessEwma === 0 && adjustedFatigueEwma === 0) {
    conditioningScore = 50;
  } else {
    // rawReadiness を 0-100 の範囲に正規化
    // フィットネスと疲労の差が正の場合 → 50 以上（レディ）
    // フィットネスと疲労の差が負の場合 → 50 以下（疲労蓄積）
    // スケーリング: fitnessEwma をフルスケールとして使用
    const scale = Math.max(fitnessEwma, adjustedFatigueEwma, 1);
    conditioningScore = 50 + (rawReadiness / scale) * 50;
    conditioningScore = clamp(conditioningScore, 0, 100);
  }

  // -----------------------------------------------------------------------
  // 5. ACWR（後方互換性維持）
  // -----------------------------------------------------------------------
  const acwr = calculateACWR(srpeTimeSeries);

  // -----------------------------------------------------------------------
  // ペナルティ詳細
  // -----------------------------------------------------------------------
  const penalties: ConditioningPenalties = {
    sleepPenalty,
    fatiguePenalty,
    hrvPenaltyCoefficient,
  };

  return {
    conditioningScore: Math.round(conditioningScore * 10) / 10,
    fitnessEwma: Math.round(fitnessEwma * 100) / 100,
    fatigueEwma: Math.round(adjustedFatigueEwma * 100) / 100,
    acwr: Math.round(acwr * 1000) / 1000,
    isProMode,
    penalties,
  };
}

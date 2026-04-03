/**
 * PACE Platform — チームコンディショニングスコア集約エンジン
 *
 * 個別選手の ConditioningResult を集約し、チーム全体のコンディショニング
 * スコア・バケット分類・トレンド・可用率を算出する。
 *
 * 集約方式:
 *   - teamScore = データ完全性で重み付けした加重平均
 *   - scoreBuckets: optimal(70-100), caution(40-69), recovery(0-39)
 *   - trend: 直近7日の線形回帰傾きで判定
 *   - availability: Hard Lock / critical 以外をプレー可能としてカウント
 */

import type { ConditioningResult } from './types';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export interface AthleteConditioningEntry {
  athleteId: string;
  name: string;
  conditioningScore: number;
  fitnessEwma: number;
  fatigueEwma: number;
  acwr: number;
  isProMode: boolean;
  trend: 'improving' | 'stable' | 'declining';
  /** データの完全性（0-1）: 42日中何日分のデータがあるか */
  dataCompleteness: number;
  /** Hard Lock 状態 */
  isHardLocked: boolean;
  /** critical リスク判定 */
  isCritical: boolean;
}

export interface TeamConditioningResult {
  teamId: string;
  date: string;
  /** チーム集約スコア（加重平均） */
  teamScore: number;
  /** 集計対象の選手数 */
  athleteCount: number;
  /** プレー可用率 */
  availability: {
    total: number;
    available: number;
    rate: number;
  };
  /** スコアバケット分類 */
  scoreBuckets: {
    optimal: number;
    caution: number;
    recovery: number;
    noData: number;
  };
  /** 各選手の詳細データ */
  athletes: AthleteConditioningEntry[];
}

// ---------------------------------------------------------------------------
// スコアバケット閾値
// ---------------------------------------------------------------------------

const OPTIMAL_THRESHOLD = 70;
const CAUTION_THRESHOLD = 40;

// ---------------------------------------------------------------------------
// トレンド分類
// ---------------------------------------------------------------------------

/** 線形回帰の傾き閾値（1日あたりのスコア変化量） */
const TREND_IMPROVING_SLOPE = 1.0;
const TREND_DECLINING_SLOPE = -1.0;

/**
 * 直近のスコア配列から線形回帰の傾きでトレンドを分類する。
 *
 * @param recentScores 直近7日分のスコア（古い順）
 * @returns トレンド分類
 */
export function classifyTrend(
  recentScores: number[],
): 'improving' | 'stable' | 'declining' {
  if (recentScores.length < 2) {
    return 'stable';
  }

  const n = recentScores.length;

  // 線形回帰（最小二乗法）で傾きを算出
  // x = 0, 1, 2, ..., n-1  /  y = scores
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += recentScores[i]!;
    sumXY += i * recentScores[i]!;
    sumX2 += i * i;
  }

  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) {
    return 'stable';
  }

  const slope = (n * sumXY - sumX * sumY) / denominator;

  if (slope >= TREND_IMPROVING_SLOPE) {
    return 'improving';
  }
  if (slope <= TREND_DECLINING_SLOPE) {
    return 'declining';
  }
  return 'stable';
}

// ---------------------------------------------------------------------------
// チームスコア集約
// ---------------------------------------------------------------------------

/**
 * チーム全体のコンディショニングスコアを集約する。
 *
 * @param teamId   チーム ID
 * @param date     対象日（YYYY-MM-DD）
 * @param athletes 各選手のコンディショニングデータ
 * @returns チーム集約結果
 */
export function calculateTeamConditioningScore(
  teamId: string,
  date: string,
  athletes: AthleteConditioningEntry[],
): TeamConditioningResult {
  const athleteCount = athletes.length;

  // 空チーム → デフォルト値
  if (athleteCount === 0) {
    return {
      teamId,
      date,
      teamScore: 50,
      athleteCount: 0,
      availability: { total: 0, available: 0, rate: 0 },
      scoreBuckets: { optimal: 0, caution: 0, recovery: 0, noData: 0 },
      athletes: [],
    };
  }

  // -----------------------------------------------------------------------
  // 加重平均（データ完全性による重み付け）
  // -----------------------------------------------------------------------
  let weightedSum = 0;
  let totalWeight = 0;

  for (const athlete of athletes) {
    // データ完全性が 0 の場合はスキップ（noData 扱い）
    if (athlete.dataCompleteness > 0) {
      const weight = athlete.dataCompleteness;
      weightedSum += athlete.conditioningScore * weight;
      totalWeight += weight;
    }
  }

  const teamScore =
    totalWeight > 0
      ? Math.round((weightedSum / totalWeight) * 10) / 10
      : 50;

  // -----------------------------------------------------------------------
  // スコアバケット
  // -----------------------------------------------------------------------
  const scoreBuckets = { optimal: 0, caution: 0, recovery: 0, noData: 0 };

  for (const athlete of athletes) {
    if (athlete.dataCompleteness === 0) {
      scoreBuckets.noData++;
    } else if (athlete.conditioningScore >= OPTIMAL_THRESHOLD) {
      scoreBuckets.optimal++;
    } else if (athlete.conditioningScore >= CAUTION_THRESHOLD) {
      scoreBuckets.caution++;
    } else {
      scoreBuckets.recovery++;
    }
  }

  // -----------------------------------------------------------------------
  // Availability（プレー可用率）
  // Hard Lock または critical リスク以外がプレー可能
  // -----------------------------------------------------------------------
  const total = athleteCount;
  const available = athletes.filter(
    (a) => !a.isHardLocked && !a.isCritical,
  ).length;
  const rate = total > 0 ? Math.round((available / total) * 1000) / 10 : 0;

  return {
    teamId,
    date,
    teamScore,
    athleteCount,
    availability: { total, available, rate },
    scoreBuckets,
    athletes,
  };
}

/**
 * PACE v6.0 — トレンド検出モジュール
 *
 * Go エンジン `pipeline/trend.go` の TypeScript 移植。
 *
 * 直近 3 データポイントの線形回帰で傾きを算出し、
 * 3 日先の外挿値が閾値を超える場合にトレンド通知を発行する。
 *
 * 重要: トレンド通知は情報提供のみ。判定色（RED/ORANGE/YELLOW/GREEN）は変更しない。
 */

import type { FeatureVector, TrendDirection, TrendNotice } from './types';

// ---------------------------------------------------------------------------
// トレンド監視設定（Go monitoredTrends 準拠）
// ---------------------------------------------------------------------------

export interface TrendConfig {
  /** メトリクスキー */
  metric: string;
  /** 日本語ラベル */
  label: string;
  /** 英語ラベル */
  labelEn: string;
  /** 閾値 */
  threshold: number;
  /** rising = 上昇時に危険、falling = 下降時に危険 */
  direction: TrendDirection;
}

export const MONITORED_TRENDS: TrendConfig[] = [
  { metric: 'acwr', label: 'ACWR', labelEn: 'ACWR', threshold: 1.5, direction: 'rising' },
  { metric: 'monotony', label: '単調性', labelEn: 'Monotony', threshold: 2.0, direction: 'rising' },
  { metric: 'z_sleep_quality', label: '睡眠Z-Score', labelEn: 'Sleep Z-Score', threshold: -1.5, direction: 'falling' },
  { metric: 'z_fatigue', label: '疲労Z-Score', labelEn: 'Fatigue Z-Score', threshold: -1.5, direction: 'falling' },
];

// ---------------------------------------------------------------------------
// 線形回帰（最小二乗法）
// ---------------------------------------------------------------------------

/**
 * 値の配列に対して線形回帰の傾きを計算する。
 * Go の linearSlope() と同一ロジック。
 */
export function linearSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (let i = 0; i < n; i++) {
    const x = i;
    sumX += x;
    sumY += values[i]!;
    sumXY += x * values[i]!;
    sumX2 += x * x;
  }

  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) return 0;

  return (n * sumXY - sumX * sumY) / denominator;
}

// ---------------------------------------------------------------------------
// メトリクス値の抽出
// ---------------------------------------------------------------------------

/**
 * FeatureVector の履歴から指定メトリクスの値を抽出する。
 */
export function extractMetricFromHistory(
  historyFeatures: FeatureVector[],
  metric: string,
): number[] {
  return historyFeatures.map((fv) => {
    switch (metric) {
      case 'acwr':
        return fv.acwr;
      case 'monotony':
        return fv.monotonyIndex;
      case 'z_sleep_quality':
        return fv.zScores['sleepQuality'] ?? 0;
      case 'z_fatigue':
        return fv.zScores['fatigue'] ?? 0;
      default:
        return 0;
    }
  });
}

// ---------------------------------------------------------------------------
// トレンド検出メイン（Go DetectTrends 準拠）
// ---------------------------------------------------------------------------

/** 外挿日数 */
const EXTRAPOLATION_DAYS = 3;
/** 最小データポイント数 */
const MIN_DATA_POINTS = 3;

/**
 * 直近の FeatureVector 履歴からトレンド通知を検出する。
 *
 * Go エンジンと同一アルゴリズム:
 * 1. 直近 3 データポイントの値を取得
 * 2. 線形回帰で傾きを算出
 * 3. 3 日先の外挿値が閾値を超える場合に通知を発行
 *
 * @param historyFeatures - 直近の FeatureVector 配列（古い順、最低 3 件）
 * @param configs - 監視設定（デフォルト: MONITORED_TRENDS）
 * @returns TrendNotice の配列
 */
export function detectTrends(
  historyFeatures: FeatureVector[],
  configs: TrendConfig[] = MONITORED_TRENDS,
): TrendNotice[] {
  const notices: TrendNotice[] = [];

  if (historyFeatures.length < MIN_DATA_POINTS) {
    return notices;
  }

  // 直近 3 件を使用
  const recent = historyFeatures.slice(-MIN_DATA_POINTS);

  for (const tc of configs) {
    const values = extractMetricFromHistory(recent, tc.metric);
    if (values.length < MIN_DATA_POINTS) continue;

    const slope = linearSlope(values);
    const current = values[values.length - 1]!;
    const projected = current + slope * EXTRAPOLATION_DAYS;

    let triggered = false;
    if (tc.direction === 'rising') {
      triggered = current < tc.threshold && projected >= tc.threshold && slope > 0;
    } else {
      triggered = current > tc.threshold && projected <= tc.threshold && slope < 0;
    }

    if (triggered) {
      notices.push({
        metric: tc.metric,
        direction: tc.direction,
        currentValue: current,
        threshold: tc.threshold,
        message: `傾向通知: ${tc.label}が閾値に接近中（${current.toFixed(2)} → ${tc.threshold.toFixed(2)}）`,
        messageEn: `Trend notice: ${tc.labelEn} approaching threshold (${current.toFixed(2)} → ${tc.threshold.toFixed(2)})`,
      });
    }
  }

  return notices;
}

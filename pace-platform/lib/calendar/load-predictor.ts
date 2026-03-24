/**
 * PACE Platform — カレンダーベース負荷予測エンジン
 *
 * スケジュールされたイベント種別と現在のチームメトリクスから、
 * 将来のプレー可能率とチームコンディションスコアを予測する。
 *
 * 予測モデル:
 * - 試合（match）: 疲労蓄積により可能率を約 15% 低下
 * - 高強度トレーニング（high_intensity）: 約 8% 低下
 * - 回復日（recovery）: 約 5% 改善
 * - その他（other）: 約 2% 低下（軽度の疲労）
 *
 * 日間減衰: イベントの効果は翌日以降 50% ずつ減衰する
 */

import type { ClassifiedEvent, EventType, LoadPrediction, TeamMetrics } from './types';

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** イベント種別ごとのプレー可能率への影響（パーセントポイント） */
const AVAILABILITY_IMPACT: Readonly<Record<EventType, number>> = {
  match: -15,
  high_intensity: -8,
  recovery: 5,
  other: -2,
} as const;

/** イベント種別ごとのチームスコアへの影響（パーセントポイント） */
const SCORE_IMPACT: Readonly<Record<EventType, number>> = {
  match: -12,
  high_intensity: -6,
  recovery: 4,
  other: -1,
} as const;

/** イベント効果の日間減衰率（前日の効果をこの割合で持ち越す） */
const DAILY_DECAY_RATE = 0.5;

/** ACWR に基づく補正係数の閾値 */
const ACWR_HIGH_THRESHOLD = 1.3;
const ACWR_DANGER_THRESHOLD = 1.5;

// ---------------------------------------------------------------------------
// 予測ロジック
// ---------------------------------------------------------------------------

/**
 * スケジュールされたイベントと現在のチームメトリクスから、
 * 日別のプレー可能率・チームスコアを予測する。
 *
 * @param events 分類済みカレンダーイベントの配列（未来日のみ推奨）
 * @param currentMetrics 現在のチームメトリクス
 * @returns 日別の負荷予測結果の配列
 */
export function predictAvailability(
  events: ClassifiedEvent[],
  currentMetrics: TeamMetrics,
): LoadPrediction[] {
  if (events.length === 0) {
    return [];
  }

  // 日付順にソート
  const sorted = [...events].sort(
    (a, b) => new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime(),
  );

  // ACWR に基づく疲労補正係数を算出
  const acwrModifier = computeAcwrModifier(currentMetrics.averageAcwr);

  let cumulativeAvailabilityDelta = 0;
  let cumulativeScoreDelta = 0;
  let previousDate = '';

  const predictions: LoadPrediction[] = [];

  for (const event of sorted) {
    const eventDate = extractDateString(event.startDateTime);

    // 日付が変わった場合、前日までの蓄積効果を減衰させる
    if (previousDate && eventDate !== previousDate) {
      const dayGap = daysBetween(previousDate, eventDate);
      const decay = Math.pow(DAILY_DECAY_RATE, dayGap);
      cumulativeAvailabilityDelta *= decay;
      cumulativeScoreDelta *= decay;
    }

    // イベント種別の影響を加算（ACWR 補正適用）
    const availabilityImpact = AVAILABILITY_IMPACT[event.eventType] * acwrModifier;
    const scoreImpact = SCORE_IMPACT[event.eventType] * acwrModifier;

    cumulativeAvailabilityDelta += availabilityImpact;
    cumulativeScoreDelta += scoreImpact;

    // 予測値を算出（0-100 にクランプ）
    const predictedAvailability = clamp(
      currentMetrics.currentAvailability + cumulativeAvailabilityDelta,
      0,
      100,
    );
    const predictedTeamScore = clamp(
      currentMetrics.currentTeamScore + cumulativeScoreDelta,
      0,
      100,
    );

    predictions.push({
      date: eventDate,
      eventType: event.eventType,
      eventName: event.summary,
      predictedAvailability: Math.round(predictedAvailability * 10) / 10,
      predictedTeamScore: Math.round(predictedTeamScore * 10) / 10,
    });

    previousDate = eventDate;
  }

  return predictions;
}

// ---------------------------------------------------------------------------
// ヘルパー関数
// ---------------------------------------------------------------------------

/**
 * ACWR 値に基づく疲労補正係数を算出する。
 *
 * - ACWR < 1.3 : 1.0（正常、補正なし）
 * - 1.3 <= ACWR < 1.5 : 1.2（警告ゾーン、悪影響が 20% 増加）
 * - ACWR >= 1.5 : 1.5（危険ゾーン、悪影響が 50% 増加）
 */
function computeAcwrModifier(acwr: number): number {
  if (acwr >= ACWR_DANGER_THRESHOLD) {
    return 1.5;
  }
  if (acwr >= ACWR_HIGH_THRESHOLD) {
    return 1.2;
  }
  return 1.0;
}

/**
 * ISO 8601 日時文字列から日付部分（YYYY-MM-DD）を抽出する。
 */
function extractDateString(isoDateTime: string): string {
  return isoDateTime.slice(0, 10);
}

/**
 * 2 つの日付文字列間の日数差を算出する。
 */
function daysBetween(dateA: string, dateB: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const a = new Date(dateA).getTime();
  const b = new Date(dateB).getTime();
  return Math.max(1, Math.round(Math.abs(b - a) / msPerDay));
}

/**
 * 値を指定範囲内にクランプする。
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

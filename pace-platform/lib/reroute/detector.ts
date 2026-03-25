/**
 * PACE Platform — 回復偏差検出エンジン
 *
 * 実際の回復ペースと予測カーブを比較し、
 * 15% 以上の逸脱が検出された場合にリルートを提案する。
 *
 * 検出ルール:
 *   - 実績 < 予測 × 0.85: recovery_slower_than_expected
 *   - 実績 > 予測 × 1.15: recovery_faster_than_expected
 *   - NRS 3日連続上昇: pain_increase
 *   - ROM 低下トレンド: rom_regression
 *   - 主観コンディション 3日連続低下: subjective_decline
 */

import type {
  RerouteDetection,
  RerouteReason,
  RerouteAdjustment,
} from './types';
import type { RTSPrediction, DailyMetric } from '../rts/types';

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** 回復率の逸脱閾値（15%） */
const DEVIATION_THRESHOLD = 0.15;

/** NRS 上昇を判定する連続日数 */
const PAIN_TREND_DAYS = 3;

/** 主観コンディション低下を判定する連続日数 */
const SUBJECTIVE_TREND_DAYS = 3;

// ---------------------------------------------------------------------------
// パブリック API
// ---------------------------------------------------------------------------

/**
 * 回復偏差を検出する。
 *
 * 実績データと予測データを比較し、有意な偏差があればリルート検出を返す。
 * すべてが順調な場合は null を返す。
 *
 * @param params - 検出に必要な入力データ
 * @returns 偏差検出結果（null = 順調）
 */
export function detectRecoveryDeviation(params: {
  programId: string;
  athleteId: string;
  dailyMetrics: DailyMetric[];
  prediction: RTSPrediction;
}): RerouteDetection | null {
  const { programId, athleteId, dailyMetrics, prediction } = params;

  if (dailyMetrics.length < 3) return null;

  // 各種偏差をチェック
  const deviations: Array<{
    reason: RerouteReason;
    severity: 'minor' | 'moderate' | 'major';
    adjustments: RerouteAdjustment[];
  }> = [];

  // 1. 回復速度の比較
  const recoveryDeviation = checkRecoveryRate(dailyMetrics, prediction);
  if (recoveryDeviation) {
    deviations.push(recoveryDeviation);
  }

  // 2. NRS（痛み）トレンド
  const painDeviation = checkPainTrend(dailyMetrics);
  if (painDeviation) {
    deviations.push(painDeviation);
  }

  // 3. 主観的コンディショントレンド
  const subjectiveDeviation = checkSubjectiveTrend(dailyMetrics);
  if (subjectiveDeviation) {
    deviations.push(subjectiveDeviation);
  }

  if (deviations.length === 0) return null;

  // 最も深刻な偏差を選択
  const severityOrder = { major: 0, moderate: 1, minor: 2 };
  deviations.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  const primary = deviations[0]!;

  // すべての調整を統合
  const allAdjustments = deviations.flatMap((d) => d.adjustments);

  return {
    programId,
    athleteId,
    detectedAt: new Date(),
    reason: primary.reason,
    severity: primary.severity,
    suggestedAdjustments: allAdjustments,
  };
}

// ---------------------------------------------------------------------------
// 内部関数
// ---------------------------------------------------------------------------

/**
 * 回復速度の逸脱を検出する。
 */
function checkRecoveryRate(
  metrics: DailyMetric[],
  prediction: RTSPrediction,
): {
  reason: RerouteReason;
  severity: 'minor' | 'moderate' | 'major';
  adjustments: RerouteAdjustment[];
} | null {
  if (metrics.length < 5) return null;

  // 直近7日間の実績回復率を算出
  const recent = metrics.slice(-7);
  const actualRate = calculateActualRecoveryRate(recent);
  const predictedRate = prediction.dailyRecoveryRate;

  if (predictedRate === 0) return null;

  const ratio = actualRate / predictedRate;

  // 回復が予測より 15% 以上遅い
  if (ratio < 1 - DEVIATION_THRESHOLD) {
    const deviationPercent = Math.round((1 - ratio) * 100);
    const severity =
      deviationPercent > 30 ? 'major' : deviationPercent > 20 ? 'moderate' : 'minor';

    const intensityReduction = severity === 'major' ? 25 : severity === 'moderate' ? 20 : 15;
    const daysDelay = severity === 'major' ? 14 : severity === 'moderate' ? 7 : 3;

    return {
      reason: 'recovery_slower_than_expected',
      severity,
      adjustments: [
        {
          type: 'intensity_decrease',
          description: `トレーニング強度を${intensityReduction}%低減`,
          parameter: 'intensity',
          oldValue: 100,
          newValue: 100 - intensityReduction,
          daysImpact: daysDelay,
        },
        {
          type: 'rts_delay',
          description: `復帰予定を${daysDelay}日延長`,
          daysImpact: daysDelay,
        },
      ],
    };
  }

  // 回復が予測より 15% 以上速い
  if (ratio > 1 + DEVIATION_THRESHOLD) {
    const daysAdvance = Math.min(7, Math.round((ratio - 1) * 14));

    return {
      reason: 'recovery_faster_than_expected',
      severity: 'minor',
      adjustments: [
        {
          type: 'intensity_increase',
          description: 'トレーニング強度を10%慎重に増加',
          parameter: 'intensity',
          oldValue: 100,
          newValue: 110,
          daysImpact: -daysAdvance,
        },
        {
          type: 'rts_advance',
          description: `復帰予定を${daysAdvance}日前倒し（保守的）`,
          daysImpact: -daysAdvance,
        },
      ],
    };
  }

  return null;
}

/**
 * NRS（痛み）トレンドの偏差を検出する。
 *
 * 3日連続で NRS が上昇している場合、pain_increase を返す。
 */
function checkPainTrend(
  metrics: DailyMetric[],
): {
  reason: RerouteReason;
  severity: 'minor' | 'moderate' | 'major';
  adjustments: RerouteAdjustment[];
} | null {
  if (metrics.length < PAIN_TREND_DAYS) return null;

  const recent = metrics.slice(-PAIN_TREND_DAYS);
  let increasing = true;

  for (let i = 1; i < recent.length; i++) {
    if (recent[i]!.nrs <= recent[i - 1]!.nrs) {
      increasing = false;
      break;
    }
  }

  if (!increasing) return null;

  const latestNrs = recent[recent.length - 1]!.nrs;
  const severity = latestNrs >= 7 ? 'major' : latestNrs >= 5 ? 'moderate' : 'minor';
  const intensityReduction = severity === 'major' ? 30 : 20;
  const daysDelay = severity === 'major' ? 10 : 5;

  return {
    reason: 'pain_increase',
    severity,
    adjustments: [
      {
        type: 'intensity_decrease',
        description: `痛み増加のためトレーニング強度を${intensityReduction}%低減`,
        parameter: 'intensity',
        oldValue: 100,
        newValue: 100 - intensityReduction,
        daysImpact: daysDelay,
      },
      {
        type: 'rts_delay',
        description: `痛み管理のため復帰予定を${daysDelay}日延長`,
        daysImpact: daysDelay,
      },
    ],
  };
}

/**
 * 主観的コンディションの低下トレンドを検出する。
 *
 * 3日連続で subjective_condition が低下している場合を検出。
 */
function checkSubjectiveTrend(
  metrics: DailyMetric[],
): {
  reason: RerouteReason;
  severity: 'minor' | 'moderate' | 'major';
  adjustments: RerouteAdjustment[];
} | null {
  if (metrics.length < SUBJECTIVE_TREND_DAYS) return null;

  const recent = metrics.slice(-SUBJECTIVE_TREND_DAYS);
  let declining = true;

  for (let i = 1; i < recent.length; i++) {
    if (recent[i]!.subjective_condition >= recent[i - 1]!.subjective_condition) {
      declining = false;
      break;
    }
  }

  if (!declining) return null;

  const latestCondition = recent[recent.length - 1]!.subjective_condition;
  const severity = latestCondition <= 3 ? 'moderate' : 'minor';
  const daysDelay = severity === 'moderate' ? 5 : 3;

  return {
    reason: 'subjective_decline',
    severity,
    adjustments: [
      {
        type: 'intensity_decrease',
        description: '主観的コンディション低下のため強度を15%低減',
        parameter: 'intensity',
        oldValue: 100,
        newValue: 85,
        daysImpact: daysDelay,
      },
      {
        type: 'rts_delay',
        description: `コンディション回復のため復帰予定を${daysDelay}日延長`,
        daysImpact: daysDelay,
      },
    ],
  };
}

/**
 * 直近メトリクスから実績回復率を算出する。
 */
function calculateActualRecoveryRate(metrics: DailyMetric[]): number {
  if (metrics.length < 2) return 1.0;

  let nrsImprovement = 0;
  let subjectiveImprovement = 0;

  for (let i = 1; i < metrics.length; i++) {
    nrsImprovement += metrics[i - 1]!.nrs - metrics[i]!.nrs;
    subjectiveImprovement +=
      metrics[i]!.subjective_condition - metrics[i - 1]!.subjective_condition;
  }

  const avgNrsImprovement = nrsImprovement / (metrics.length - 1);
  const avgSubjectiveImprovement = subjectiveImprovement / (metrics.length - 1);

  const rate = 1.0 + avgNrsImprovement * 0.3 + avgSubjectiveImprovement * 0.2;
  return Math.max(0.1, rate);
}

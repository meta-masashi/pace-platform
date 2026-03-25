/**
 * PACE Platform — RTS 予測エンジン
 *
 * 日次メトリクス・ゲート進捗・時間減衰ステータスから、
 * シグモイド回復モデルに基づく復帰予測を生成する。
 *
 * シグモイドモデル:
 *   progress(t) = 100 / (1 + e^(-k × (t - t_mid)))
 *
 * k: 回復速度パラメータ（日次メトリクスのトレンドから算出）
 * t_mid: 回復の中間点（全回復期間の50%地点）
 */

import type {
  RTSPrediction,
  RTSMilestone,
  RTSRiskFactor,
  RecoveryDataPoint,
  DailyMetric,
  GateProgress,
  DecayStatus,
} from './types';

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** 最大フェーズ数 */
const MAX_PHASE = 4;

/** フェーズごとの標準所要日数（ベースライン） */
const BASE_DAYS_PER_PHASE: Record<number, number> = {
  1: 14,
  2: 21,
  3: 28,
  4: 21,
};

/** フェーズ名称（日本語） */
const PHASE_NAMES: Record<number, string> = {
  1: '急性期（保護・炎症管理）',
  2: '回復期（可動域・筋力回復）',
  3: '機能回復期（スポーツ動作）',
  4: '復帰準備期（チーム合流）',
};

/** 信頼度の最低データ日数（これ以下だと信頼度ペナルティ） */
const MIN_DATA_DAYS_FOR_CONFIDENCE = 7;

/** 慢性修正係数が回復を遅延させる閾値 */
const CHRONIC_MODIFIER_THRESHOLD = 1.0;

// ---------------------------------------------------------------------------
// パブリック API
// ---------------------------------------------------------------------------

/**
 * RTS 予測を生成する。
 *
 * @param params - 予測に必要な入力データ
 * @returns RTS 予測結果
 */
export function predictRTS(params: {
  programId: string;
  athleteId: string;
  currentPhase: number;
  startDate: string;
  dailyMetrics: DailyMetric[];
  gateProgress: GateProgress[];
  decayStatus: DecayStatus[];
  estimatedRtpDate?: string | null;
}): RTSPrediction {
  const {
    programId,
    athleteId,
    currentPhase,
    startDate,
    dailyMetrics,
    gateProgress,
    decayStatus,
    estimatedRtpDate,
  } = params;

  // 1. 日次メトリクスから回復率を算出
  const dailyRecoveryRate = calculateDailyRecoveryRate(dailyMetrics);

  // 2. フェーズごとの残り日数を推定
  const phaseDaysEstimates = estimatePhaseDays(
    currentPhase,
    dailyRecoveryRate,
    gateProgress,
  );

  // 3. 時間減衰ステータスによる遅延を適用
  const decayDelay = calculateDecayDelay(decayStatus);

  // 4. 慢性修正係数による遅延を適用
  const chronicDelay = calculateChronicDelay(decayStatus);

  // 5. 合計残り日数を算出
  const totalRemainingDays =
    phaseDaysEstimates.reduce((sum, d) => sum + d.days, 0) +
    decayDelay +
    chronicDelay;

  // 6. 推定 RTS 日を算出
  const today = new Date();
  const estimatedRTSDate = new Date(today);
  estimatedRTSDate.setDate(estimatedRTSDate.getDate() + totalRemainingDays);

  // 既存の推定日がある場合は加重平均
  if (estimatedRtpDate) {
    const existingDate = new Date(estimatedRtpDate);
    if (!isNaN(existingDate.getTime())) {
      const existingMs = existingDate.getTime();
      const calculatedMs = estimatedRTSDate.getTime();
      // 既存推定の 30%、新規計算の 70% で加重平均
      const blendedMs = existingMs * 0.3 + calculatedMs * 0.7;
      estimatedRTSDate.setTime(blendedMs);
    }
  }

  // 7. マイルストーンを生成
  const milestones = generateMilestones(
    currentPhase,
    phaseDaysEstimates,
    gateProgress,
    startDate,
  );

  // 8. リスク要因を生成
  const riskFactors = generateRiskFactors(decayStatus, dailyMetrics);

  // 9. 信頼度を算出（データ量に基づく）
  const confidence = calculateConfidence(dailyMetrics, gateProgress);

  return {
    athleteId,
    programId,
    currentPhase,
    estimatedRTSDate,
    confidence,
    milestones,
    riskFactors,
    dailyRecoveryRate,
  };
}

/**
 * シグモイド回復モデルに基づく回復カーブを生成する。
 *
 * progress(t) = 100 / (1 + e^(-k × (t - t_mid)))
 *
 * @param prediction - RTS 予測結果
 * @param daysAhead - 先読み日数
 * @param actualMetrics - 実績メトリクス（オーバーレイ用）
 * @returns 日次回復データポイント配列
 */
export function generateRecoveryCurve(
  prediction: RTSPrediction,
  daysAhead: number,
  actualMetrics?: DailyMetric[],
): RecoveryDataPoint[] {
  const today = new Date();
  const totalDays = Math.ceil(
    (prediction.estimatedRTSDate.getTime() - today.getTime()) /
      (1000 * 60 * 60 * 24),
  );

  // シグモイドパラメータ
  const tMid = totalDays * 0.5; // 中間点
  const k = calculateSigmoidK(prediction.dailyRecoveryRate, totalDays);

  // 実績データを日付マップ化
  const actualMap = new Map<string, number>();
  if (actualMetrics) {
    for (const m of actualMetrics) {
      // NRS が下がり、subjective_condition が上がるほど回復が進んでいる
      const progress = calculateActualProgress(m);
      actualMap.set(m.date, progress);
    }
  }

  // マイルストーンの日付からフェーズマップを構築
  const phaseMap = buildPhaseMap(prediction);

  const dataPoints: RecoveryDataPoint[] = [];
  const renderDays = Math.min(daysAhead, totalDays + 14);

  for (let d = -7; d <= renderDays; d++) {
    const date = new Date(today);
    date.setDate(date.getDate() + d);
    const dateStr = toDateString(date);

    // シグモイド予測値
    const t = d;
    const predictedProgress = sigmoid(t, k, tMid);

    // 該当フェーズの判定
    const phase = getPhaseForDay(d, phaseMap, prediction.currentPhase);

    const point: RecoveryDataPoint = {
      date: dateStr,
      predictedProgress: Math.round(predictedProgress * 10) / 10,
      phase,
    };

    // 実績値があればオーバーレイ
    const actual = actualMap.get(dateStr);
    if (actual !== undefined) {
      point.actualProgress = Math.round(actual * 10) / 10;
    }

    dataPoints.push(point);
  }

  return dataPoints;
}

// ---------------------------------------------------------------------------
// 内部関数
// ---------------------------------------------------------------------------

/**
 * 日次メトリクスのトレンドから日次回復率を算出する。
 *
 * RPE の低下率と subjective_condition の上昇率の平均を使用。
 */
function calculateDailyRecoveryRate(metrics: DailyMetric[]): number {
  if (metrics.length < 2) return 1.0;

  // 最新7日間でトレンドを算出
  const recent = metrics.slice(-7);
  if (recent.length < 2) return 1.0;

  // NRS の低下トレンド（下がるほど良い）
  let nrsSlope = 0;
  for (let i = 1; i < recent.length; i++) {
    nrsSlope += (recent[i - 1]!.nrs - recent[i]!.nrs);
  }
  nrsSlope /= recent.length - 1;

  // subjective_condition の上昇トレンド（上がるほど良い）
  let subjectiveSlope = 0;
  for (let i = 1; i < recent.length; i++) {
    subjectiveSlope +=
      (recent[i]!.subjective_condition - recent[i - 1]!.subjective_condition);
  }
  subjectiveSlope /= recent.length - 1;

  // 日次回復率（%/日）: 0.5〜3.0 にクランプ
  const rate = 1.0 + (nrsSlope * 0.3 + subjectiveSlope * 0.2);
  return Math.max(0.5, Math.min(3.0, rate));
}

/**
 * フェーズごとの残り日数を推定する。
 */
function estimatePhaseDays(
  currentPhase: number,
  recoveryRate: number,
  gateProgress: GateProgress[],
): Array<{ phase: number; days: number }> {
  const result: Array<{ phase: number; days: number }> = [];

  for (let phase = currentPhase; phase <= MAX_PHASE; phase++) {
    const baseDays = BASE_DAYS_PER_PHASE[phase] ?? 21;
    const gate = gateProgress.find((g) => g.phase === phase);

    if (gate?.gate_met_at) {
      // すでにゲート通過済み → 0日
      result.push({ phase, days: 0 });
      continue;
    }

    // 回復率で補正（率が高いほど日数が短い）
    const adjustedDays = Math.round(baseDays / recoveryRate);
    result.push({ phase, days: adjustedDays });
  }

  return result;
}

/**
 * 時間減衰ステータスによる遅延日数を算出する。
 *
 * 高リスクの減衰エントリが残っている場合、その回復日数を遅延に加算。
 */
function calculateDecayDelay(decayStatus: DecayStatus[]): number {
  if (decayStatus.length === 0) return 0;

  // 現在リスクが 0.3 以上のエントリの最大回復日数を遅延とする
  const highRiskEntries = decayStatus.filter((d) => d.currentRisk >= 0.3);
  if (highRiskEntries.length === 0) return 0;

  return Math.max(...highRiskEntries.map((d) => d.estimatedDaysToRecovery));
}

/**
 * 慢性修正係数（繰り返し受傷）による遅延日数を算出する。
 */
function calculateChronicDelay(decayStatus: DecayStatus[]): number {
  const chronicEntries = decayStatus.filter(
    (d) => d.chronicModifier > CHRONIC_MODIFIER_THRESHOLD,
  );
  if (chronicEntries.length === 0) return 0;

  // 最大の慢性修正係数から追加遅延日数を算出
  const maxModifier = Math.max(...chronicEntries.map((d) => d.chronicModifier));
  // modifier 1.5 → +7日、2.0 → +14日 のスケーリング
  return Math.round((maxModifier - 1.0) * 14);
}

/**
 * マイルストーンを生成する。
 */
function generateMilestones(
  currentPhase: number,
  phaseDays: Array<{ phase: number; days: number }>,
  gateProgress: GateProgress[],
  startDate: string,
): RTSMilestone[] {
  const milestones: RTSMilestone[] = [];
  const today = new Date();
  let cumulativeDays = 0;

  for (const { phase, days } of phaseDays) {
    const gate = gateProgress.find((g) => g.phase === phase);
    const isCompleted = !!gate?.gate_met_at;

    cumulativeDays += days;
    const targetDate = new Date(today);
    targetDate.setDate(targetDate.getDate() + cumulativeDays);

    // 進捗率の推定
    let progress = 0;
    if (isCompleted) {
      progress = 100;
    } else if (phase === currentPhase) {
      // 現在フェーズの経過日数から進捗を推定
      const programStart = new Date(startDate);
      const elapsedSinceStart = Math.ceil(
        (today.getTime() - programStart.getTime()) / (1000 * 60 * 60 * 24),
      );
      // 過去フェーズの標準日数を差し引く
      let pastPhaseDays = 0;
      for (let p = 1; p < currentPhase; p++) {
        pastPhaseDays += BASE_DAYS_PER_PHASE[p] ?? 21;
      }
      const daysInCurrentPhase = Math.max(0, elapsedSinceStart - pastPhaseDays);
      const baseDays = BASE_DAYS_PER_PHASE[phase] ?? 21;
      progress = Math.min(95, Math.round((daysInCurrentPhase / baseDays) * 100));
    }

    const daysRemaining = isCompleted
      ? 0
      : Math.max(0, Math.ceil(
          (targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
        ));

    milestones.push({
      phase,
      gateName: PHASE_NAMES[phase] ?? `フェーズ${phase}`,
      targetDate,
      currentProgress: progress,
      isOnTrack: phase < currentPhase || progress >= (days > 0 ? (1 - daysRemaining / days) * 100 * 0.8 : 0),
      daysRemaining,
    });
  }

  return milestones;
}

/**
 * リスク要因を生成する。
 */
function generateRiskFactors(
  decayStatus: DecayStatus[],
  dailyMetrics: DailyMetric[],
): RTSRiskFactor[] {
  const factors: RTSRiskFactor[] = [];

  // 時間減衰ベースのリスク
  for (const decay of decayStatus) {
    if (decay.currentRisk >= 0.3) {
      factors.push({
        nodeId: decay.nodeId,
        description: `リスクノード ${decay.nodeId} の減衰後リスクが ${Math.round(decay.currentRisk * 100)}% — 回復まであと約${decay.estimatedDaysToRecovery}日`,
        impact: 'delays',
        estimatedDaysImpact: decay.estimatedDaysToRecovery,
      });
    }

    if (decay.chronicModifier > CHRONIC_MODIFIER_THRESHOLD) {
      factors.push({
        nodeId: decay.nodeId,
        description: `繰り返し受傷修正（×${decay.chronicModifier.toFixed(1)}）— 回復速度が低下`,
        impact: 'delays',
        estimatedDaysImpact: Math.round((decay.chronicModifier - 1.0) * 14),
      });
    }
  }

  // メトリクスベースのリスク
  if (dailyMetrics.length >= 3) {
    const recent3 = dailyMetrics.slice(-3);
    const avgNrs = recent3.reduce((s, m) => s + m.nrs, 0) / recent3.length;

    if (avgNrs >= 6) {
      factors.push({
        nodeId: 'nrs_trend',
        description: `直近3日間の平均 NRS が ${avgNrs.toFixed(1)} — 痛みが持続`,
        impact: 'delays',
        estimatedDaysImpact: 7,
      });
    }

    const avgSubjective =
      recent3.reduce((s, m) => s + m.subjective_condition, 0) / recent3.length;
    if (avgSubjective <= 3) {
      factors.push({
        nodeId: 'subjective_trend',
        description: `直近3日間の主観的コンディションが ${avgSubjective.toFixed(1)} — 低調`,
        impact: 'delays',
        estimatedDaysImpact: 5,
      });
    }
  }

  return factors;
}

/**
 * 信頼度を算出する。
 *
 * データ量が多いほど信頼度が高い。
 */
function calculateConfidence(
  dailyMetrics: DailyMetric[],
  gateProgress: GateProgress[],
): number {
  let confidence = 50; // ベースライン

  // データ量ボーナス: 最大 +30
  const dataBonus = Math.min(30, (dailyMetrics.length / MIN_DATA_DAYS_FOR_CONFIDENCE) * 15);
  confidence += dataBonus;

  // ゲート通過実績ボーナス: 各 +5（最大 +20）
  const gateBonus = gateProgress.filter((g) => g.gate_met_at).length * 5;
  confidence += Math.min(20, gateBonus);

  return Math.min(100, Math.round(confidence));
}

/**
 * シグモイド関数の速度パラメータ k を算出する。
 */
function calculateSigmoidK(recoveryRate: number, totalDays: number): number {
  // 標準的な k: 回復率 1.0 のとき約 0.1
  // totalDays が短いほど k が大きい（急速な回復カーブ）
  const baseK = 0.1 * recoveryRate;
  const daysAdjustment = 60 / Math.max(totalDays, 30);
  return baseK * daysAdjustment;
}

/**
 * シグモイド関数。
 *
 * progress(t) = 100 / (1 + e^(-k × (t - t_mid)))
 */
function sigmoid(t: number, k: number, tMid: number): number {
  const exponent = -k * (t - tMid);
  const value = 100 / (1 + Math.exp(exponent));
  return Math.max(0, Math.min(100, value));
}

/**
 * 実績メトリクスから進捗率を算出する。
 *
 * NRS の低下と subjective_condition の上昇を組み合わせる。
 */
function calculateActualProgress(metric: DailyMetric): number {
  // NRS: 10→0% 回復、0→100% 回復
  const nrsProgress = (10 - metric.nrs) * 10;
  // subjective_condition: 0→0%、10→100%
  const subjectiveProgress = metric.subjective_condition * 10;
  // 加重平均
  return nrsProgress * 0.4 + subjectiveProgress * 0.6;
}

/**
 * フェーズマップを構築する（日数→フェーズの対応表）。
 */
function buildPhaseMap(
  prediction: RTSPrediction,
): Array<{ phase: number; endDay: number }> {
  const entries: Array<{ phase: number; endDay: number }> = [];
  const today = new Date();

  for (const ms of prediction.milestones) {
    const dayDiff = Math.ceil(
      (ms.targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );
    entries.push({ phase: ms.phase, endDay: dayDiff });
  }

  return entries;
}

/**
 * 指定日がどのフェーズに属するかを判定する。
 */
function getPhaseForDay(
  day: number,
  phaseMap: Array<{ phase: number; endDay: number }>,
  currentPhase: number,
): number {
  for (const entry of phaseMap) {
    if (day <= entry.endDay) return entry.phase;
  }
  return currentPhase;
}

/**
 * Date を YYYY-MM-DD 文字列に変換する。
 */
function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

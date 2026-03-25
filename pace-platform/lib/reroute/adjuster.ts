/**
 * PACE Platform — リルート調整生成エンジン
 *
 * 偏差検出結果に基づき、リハビリプランの具体的な調整案を生成する。
 *
 * 調整ルール:
 *   - recovery_slower_than_expected → 強度 15〜25% 減、RTS 延長、高負荷エクササイズ交換
 *   - pain_increase → 強度 30% 減、疼痛管理エクササイズ追加、RTS 延長
 *   - recovery_faster_than_expected → 強度 10% 増（保守的）、RTS 前倒し
 *   - subjective_decline → 強度 15% 減、RTS 延長
 *   - rom_regression → 強度 20% 減、可動域回復エクササイズ追加
 */

import type {
  RerouteDetection,
  RerouteAdjustment,
  RehabProgramForReroute,
} from './types';

// ---------------------------------------------------------------------------
// パブリック API
// ---------------------------------------------------------------------------

/**
 * 偏差検出に基づく調整案を生成する。
 *
 * @param detection - 偏差検出結果
 * @param currentProgram - 現在のリハビリプログラム情報
 * @returns 調整案リスト
 */
export function generateAdjustments(
  detection: RerouteDetection,
  currentProgram: RehabProgramForReroute,
): RerouteAdjustment[] {
  switch (detection.reason) {
    case 'recovery_slower_than_expected':
      return generateSlowerRecoveryAdjustments(detection, currentProgram);
    case 'pain_increase':
      return generatePainIncreaseAdjustments(detection, currentProgram);
    case 'recovery_faster_than_expected':
      return generateFasterRecoveryAdjustments(detection, currentProgram);
    case 'subjective_decline':
      return generateSubjectiveDeclineAdjustments(detection, currentProgram);
    case 'rom_regression':
      return generateRomRegressionAdjustments(detection, currentProgram);
    default:
      return detection.suggestedAdjustments;
  }
}

// ---------------------------------------------------------------------------
// 内部関数
// ---------------------------------------------------------------------------

/**
 * 回復遅延時の調整案を生成する。
 */
function generateSlowerRecoveryAdjustments(
  detection: RerouteDetection,
  _currentProgram: RehabProgramForReroute,
): RerouteAdjustment[] {
  const adjustments: RerouteAdjustment[] = [];
  const intensityReduction =
    detection.severity === 'major' ? 25 : detection.severity === 'moderate' ? 20 : 15;
  const daysDelay =
    detection.severity === 'major' ? 14 : detection.severity === 'moderate' ? 7 : 3;

  adjustments.push({
    type: 'intensity_decrease',
    description: `トレーニング強度を${intensityReduction}%低減（回復ペース調整）`,
    parameter: 'percent_1rm',
    oldValue: 100,
    newValue: 100 - intensityReduction,
    daysImpact: daysDelay,
  });

  adjustments.push({
    type: 'rts_delay',
    description: `復帰予定を${daysDelay}日延長（回復ペースに合わせた調整）`,
    daysImpact: daysDelay,
  });

  // 重症度が moderate 以上の場合、高負荷エクササイズの交換を提案
  if (detection.severity !== 'minor') {
    adjustments.push({
      type: 'exercise_swap',
      description: '高負荷エクササイズを低負荷の代替に変更',
      daysImpact: 0,
    });
  }

  return adjustments;
}

/**
 * 痛み増加時の調整案を生成する。
 */
function generatePainIncreaseAdjustments(
  detection: RerouteDetection,
  _currentProgram: RehabProgramForReroute,
): RerouteAdjustment[] {
  const adjustments: RerouteAdjustment[] = [];
  const daysDelay = detection.severity === 'major' ? 10 : 5;

  adjustments.push({
    type: 'intensity_decrease',
    description: 'トレーニング強度を30%低減（疼痛管理）',
    parameter: 'percent_1rm',
    oldValue: 100,
    newValue: 70,
    daysImpact: daysDelay,
  });

  adjustments.push({
    type: 'exercise_swap',
    description: '疼痛管理エクササイズを追加（アイシング・軽負荷 ROM）',
    daysImpact: 0,
  });

  adjustments.push({
    type: 'rts_delay',
    description: `痛みが安定するまで復帰予定を${daysDelay}日延長`,
    daysImpact: daysDelay,
  });

  return adjustments;
}

/**
 * 回復加速時の調整案を生成する。
 */
function generateFasterRecoveryAdjustments(
  _detection: RerouteDetection,
  _currentProgram: RehabProgramForReroute,
): RerouteAdjustment[] {
  return [
    {
      type: 'intensity_increase',
      description: 'トレーニング強度を10%慎重に増加（回復良好のため）',
      parameter: 'percent_1rm',
      oldValue: 100,
      newValue: 110,
      daysImpact: -3,
    },
    {
      type: 'rts_advance',
      description: '復帰予定を3日前倒し（保守的に評価）',
      daysImpact: -3,
    },
  ];
}

/**
 * 主観コンディション低下時の調整案を生成する。
 */
function generateSubjectiveDeclineAdjustments(
  detection: RerouteDetection,
  _currentProgram: RehabProgramForReroute,
): RerouteAdjustment[] {
  const daysDelay = detection.severity === 'moderate' ? 5 : 3;

  return [
    {
      type: 'intensity_decrease',
      description: '主観コンディション低下のためトレーニング強度を15%低減',
      parameter: 'percent_1rm',
      oldValue: 100,
      newValue: 85,
      daysImpact: daysDelay,
    },
    {
      type: 'rts_delay',
      description: `コンディション回復のため復帰予定を${daysDelay}日延長`,
      daysImpact: daysDelay,
    },
  ];
}

/**
 * ROM 退行時の調整案を生成する。
 */
function generateRomRegressionAdjustments(
  detection: RerouteDetection,
  _currentProgram: RehabProgramForReroute,
): RerouteAdjustment[] {
  const daysDelay = detection.severity === 'major' ? 7 : 5;

  return [
    {
      type: 'intensity_decrease',
      description: 'ROM 退行のためトレーニング強度を20%低減',
      parameter: 'percent_1rm',
      oldValue: 100,
      newValue: 80,
      daysImpact: daysDelay,
    },
    {
      type: 'exercise_swap',
      description: '可動域回復エクササイズを優先的に追加',
      daysImpact: 0,
    },
    {
      type: 'rts_delay',
      description: `ROM 回復のため復帰予定を${daysDelay}日延長`,
      daysImpact: daysDelay,
    },
  ];
}

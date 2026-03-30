/**
 * PACE v6.0 — Node 4: 判定サポート
 *
 * P1-P5 優先度階層に基づくリスク判定と推奨アクション生成。
 * コンテキスト・オーバーライド（試合日、順化、減量）を適用し、
 * 最終的な判定色（RED/ORANGE/YELLOW/GREEN）を決定する。
 *
 * 優先度階層:
 *   P1: 絶対的禁忌（痛み ≥ 8、心拍スパイク、発熱/ワクチン後）
 *   P2: 力学的崩壊（ACWR > 1.5、Monotony > 2.0、ODE D > D_crit）
 *   P3: デカップリング（EKF 検出）
 *   P4: GAS 疲憊期（複数 Z ≤ -1.5、ACWR/Monotony 正常）
 *   P5: 正常適応（Preparedness > 0）
 *
 * 入力: InferenceOutput（Node 3）+ FeatureVector + DailyInput
 * 出力: NodeResult<DecisionOutput>
 */

import type {
  AthleteContext,
  ContextFlags,
  DailyInput,
  DecisionOutput,
  FeatureVector,
  InferenceDecision,
  InferenceOutput,
  InferencePriority,
  NodeExecutor,
  NodeResult,
  PipelineConfig,
  RecommendedAction,
} from '../types';

// ---------------------------------------------------------------------------
// 判定入力型（Node 3 + 追加コンテキスト）
// ---------------------------------------------------------------------------

/** Node 4 の入力データ（Node 3 出力 + 追加情報） */
export interface DecisionInput {
  /** 推論結果（Node 3） */
  inference: InferenceOutput;
  /** 特徴量ベクトル（Node 2） */
  featureVector: FeatureVector;
  /** クリーニング済み入力データ */
  cleanedInput: DailyInput;
}

// ---------------------------------------------------------------------------
// P1 判定: 絶対的禁忌
// ---------------------------------------------------------------------------

/**
 * P1 判定: 絶対的禁忌の検出。
 *
 * 以下の条件のいずれかに該当する場合 RED を返す:
 * - 痛み NRS ≥ 8
 * - 安静時心拍スパイク > 30%（28日平均比）
 * - 発熱後 7 日以内
 * - ワクチン接種後 7 日以内
 *
 * @param input - 判定入力
 * @param context - 選手コンテキスト
 * @param config - パイプライン設定
 * @param flags - コンテキストフラグ
 * @returns P1 トリガーされた場合の理由リスト（空なら P1 非該当）
 */
function checkP1Safety(
  input: DecisionInput,
  _context: AthleteContext,
  config: PipelineConfig,
  flags: ContextFlags,
): { triggered: boolean; reasons: string[]; reasonsEn: string[] } {
  const reasons: string[] = [];
  const reasonsEn: string[] = [];

  // 痛み NRS ≥ 8（NSAID 服用中はマスク: 鎮痛剤で痛みが隠蔽されている可能性があるため P1 を抑制）
  if (!flags.isMedicationNsaid24h && input.cleanedInput.subjectiveScores.painNRS >= config.thresholds.painRedFlag) {
    reasons.push(
      `痛み NRS が ${input.cleanedInput.subjectiveScores.painNRS} で安全閾値（${config.thresholds.painRedFlag}）以上です。トレーニングの即座の中止と医療スタッフへの相談を推奨します。`,
    );
    reasonsEn.push(
      `Pain NRS is ${input.cleanedInput.subjectiveScores.painNRS}, exceeding safety threshold (${config.thresholds.painRedFlag}).`,
    );
  }

  // 安静時心拍スパイク（順化期間中はミュート可能）
  const rhr = input.cleanedInput.subjectiveScores.restingHeartRate;
  if (rhr !== undefined && !flags.isAcclimatization) {
    // HR スパイク検出: 簡易的に高い絶対値で判定
    // 実際のベースラインは履歴から算出するが、ここでは Z-Score を参照
    const hrZScore = input.featureVector.zScores['restingHeartRate'];
    if (hrZScore !== undefined && hrZScore > 2.0) {
      reasons.push(
        `安静時心拍数が通常値から大幅に上昇しています（Z-Score: ${hrZScore.toFixed(2)}）。オーバートレーニングまたは体調不良の兆候の可能性があります。`,
      );
      reasonsEn.push(
        `Resting heart rate significantly elevated (Z-Score: ${hrZScore.toFixed(2)}).`,
      );
    }
  }

  // 発熱後 7 日以内
  if (flags.isPostFever) {
    reasons.push(
      '発熱後 7 日以内のため、段階的な復帰プロトコルに従ってください。高強度トレーニングは推奨されません。',
    );
    reasonsEn.push('Within 7 days post-fever. Graduated return-to-play protocol recommended.');
  }

  // ワクチン接種後 7 日以内
  if (flags.isPostVaccination) {
    reasons.push(
      'ワクチン接種後 7 日以内のため、強度を控えた活動を推奨します。心筋炎リスクに留意してください。',
    );
    reasonsEn.push(
      'Within 7 days post-vaccination. Reduced intensity recommended due to myocarditis risk.',
    );
  }

  // Sleep ≤ 2 AND Fatigue ≥ 8: 睡眠障害＋高度疲労の複合リスク
  const sleep = input.cleanedInput.subjectiveScores.sleepQuality;
  const fatigue = input.cleanedInput.subjectiveScores.fatigue;
  if (sleep <= 2 && fatigue >= 8) {
    reasons.push(
      `睡眠の質が著しく低下（${sleep}）し、かつ疲労度が高水準（${fatigue}）です。過剰疲労・オーバートレーニングの危険域にあります。即座に休養を取り、メディカルスタッフに報告してください。`,
    );
    reasonsEn.push(
      `Sleep quality severely impaired (${sleep}) combined with high fatigue (${fatigue}). Overtraining risk threshold reached.`,
    );
  }

  return { triggered: reasons.length > 0, reasons, reasonsEn };
}

// ---------------------------------------------------------------------------
// P2 判定: 力学的崩壊
// ---------------------------------------------------------------------------

/**
 * P2 判定: 力学的崩壊リスクの検出。
 *
 * 以下の条件のいずれかに該当する場合:
 * - ACWR > 1.5
 * - Monotony > 2.0
 * - ODE D > D_crit（臨界ダメージ超過）
 */
function checkP2MechanicalRisk(
  input: DecisionInput,
  _context: AthleteContext,
  config: PipelineConfig,
): { triggered: boolean; reasons: string[]; reasonsEn: string[] } {
  const reasons: string[] = [];
  const reasonsEn: string[] = [];

  // ACWR 超過
  if (input.featureVector.acwr > config.thresholds.acwrRedLine) {
    reasons.push(
      `ACWR が ${input.featureVector.acwr.toFixed(2)} で危険域（${config.thresholds.acwrRedLine}）を超えています。急激な負荷増加による傷害リスクが高まっています。負荷の段階的調整を推奨します。`,
    );
    reasonsEn.push(
      `ACWR is ${input.featureVector.acwr.toFixed(2)}, exceeding red line (${config.thresholds.acwrRedLine}).`,
    );
  }

  // Monotony 超過
  if (
    input.featureVector.monotonyIndex > config.thresholds.monotonyRedLine
  ) {
    reasons.push(
      `単調性指標が ${input.featureVector.monotonyIndex.toFixed(2)} で警告域（${config.thresholds.monotonyRedLine}）を超えています。トレーニング変動の不足により疲労蓄積のリスクがあります。メニューのバリエーションを推奨します。`,
    );
    reasonsEn.push(
      `Monotony index is ${input.featureVector.monotonyIndex.toFixed(2)}, exceeding red line (${config.thresholds.monotonyRedLine}).`,
    );
  }

  // ODE 組織ダメージ超過
  for (const [category, damage] of Object.entries(
    input.featureVector.tissueDamage,
  )) {
    if (damage > 0.8) {
      const categoryLabel = TISSUE_CATEGORY_LABELS[category] ?? category;
      reasons.push(
        `${categoryLabel}の組織ダメージが高水準（${damage.toFixed(2)}）です。回復に十分な時間を確保し、該当組織への負荷を軽減してください。`,
      );
      reasonsEn.push(
        `${category} tissue damage is high (${damage.toFixed(2)}).`,
      );
    }
  }

  return { triggered: reasons.length > 0, reasons, reasonsEn };
}

// ---------------------------------------------------------------------------
// P3 判定: デカップリング
// ---------------------------------------------------------------------------

/**
 * P3 判定: 主観-客観デカップリングの検出。
 */
function checkP3Decoupling(
  input: DecisionInput,
  _context: AthleteContext,
  config: PipelineConfig,
): { triggered: boolean; reasons: string[]; reasonsEn: string[] } {
  const reasons: string[] = [];
  const reasonsEn: string[] = [];

  if (
    input.featureVector.decouplingScore !== undefined &&
    input.featureVector.decouplingScore > config.thresholds.decouplingThreshold
  ) {
    reasons.push(
      `主観的負荷と客観的負荷の乖離（デカップリング: ${input.featureVector.decouplingScore.toFixed(2)}）が検出されました。主観評価と実際の生理的負荷にギャップがある可能性があります。客観データの確認を推奨します。`,
    );
    reasonsEn.push(
      `Subjective-objective load decoupling detected (score: ${input.featureVector.decouplingScore.toFixed(2)}).`,
    );
  }

  return { triggered: reasons.length > 0, reasons, reasonsEn };
}

// ---------------------------------------------------------------------------
// P4 判定: GAS 疲憊期
// ---------------------------------------------------------------------------

/**
 * P4 判定: GAS（汎適応症候群）疲憊期の検出。
 *
 * 複数の主観指標で Z ≤ -1.5 かつ ACWR/Monotony が正常範囲の場合。
 * 試合日・順化期間中はしきい値を緩和する。
 */
function checkP4GASExhaustion(
  input: DecisionInput,
  _context: AthleteContext,
  config: PipelineConfig,
  flags: ContextFlags,
): { triggered: boolean; reasons: string[]; reasonsEn: string[] } {
  const reasons: string[] = [];
  const reasonsEn: string[] = [];

  // コンテキスト・オーバーライド: 試合日は P4 閾値を緩和
  let zThreshold = config.thresholds.zScoreExhaustion;
  let requiredCount = config.thresholds.zScoreMultipleCount;

  if (flags.isGameDay) {
    // 試合日: 閾値を厳しくして P4 が発火しにくくする
    zThreshold = zThreshold - 0.5; // -1.5 → -2.0
    requiredCount = requiredCount + 1; // 2 → 3
  }

  if (flags.isAcclimatization) {
    // 順化期間: P4 閾値を緩和
    zThreshold = zThreshold - 0.5;
  }

  if (flags.isWeightMaking) {
    // 減量期: P4 疲労警告を抑制（1段階上げ）
    requiredCount = requiredCount + 1;
  }

  // Z-Score が閾値以下の項目をカウント
  let exhaustionCount = 0;
  const exhaustedMetrics: string[] = [];

  for (const [metric, zScore] of Object.entries(
    input.featureVector.zScores,
  )) {
    if (zScore <= zThreshold) {
      exhaustionCount++;
      exhaustedMetrics.push(
        `${SUBJECTIVE_METRIC_LABELS[metric] ?? metric}（Z=${zScore.toFixed(2)}）`,
      );
    }
  }

  // ACWR/Monotony が正常範囲かどうか確認
  const acwrNormal =
    input.featureVector.acwr <= config.thresholds.acwrRedLine;
  const monotonyNormal =
    input.featureVector.monotonyIndex <= config.thresholds.monotonyRedLine;

  if (
    exhaustionCount >= requiredCount &&
    acwrNormal &&
    monotonyNormal
  ) {
    reasons.push(
      `複数の主観指標で疲憊傾向が検出されました（${exhaustedMetrics.join('、')}）。負荷指標は正常範囲ですが、心理的・生理的な疲労蓄積の兆候です。リカバリーセッションの導入を推奨します。`,
    );
    reasonsEn.push(
      `GAS exhaustion detected: ${exhaustionCount} subjective metrics below threshold.`,
    );
  }

  return { triggered: reasons.length > 0, reasons, reasonsEn };
}

// ---------------------------------------------------------------------------
// P5 判定: 正常適応
// ---------------------------------------------------------------------------

/**
 * P5 判定: 正常適応状態の確認。
 *
 * Preparedness > 0 の場合、通常のトレーニング継続が可能。
 */
function checkP5Normal(
  input: DecisionInput,
): { reasons: string[]; reasonsEn: string[] } {
  const reasons: string[] = [];
  const reasonsEn: string[] = [];

  if (input.featureVector.preparedness > 0) {
    reasons.push(
      'コンディション良好です。計画通りのトレーニングを継続してください。',
    );
    reasonsEn.push(
      'Condition is good. Continue with planned training.',
    );
  } else {
    reasons.push(
      'プレパレッドネスが低下傾向にあります。負荷と回復のバランスに注意してください。',
    );
    reasonsEn.push(
      'Preparedness is declining. Monitor load-recovery balance.',
    );
  }

  return { reasons, reasonsEn };
}

// ---------------------------------------------------------------------------
// 推奨アクション生成
// ---------------------------------------------------------------------------

/**
 * 優先度に応じた推奨アクションを生成する。
 */
function generateActions(
  priority: InferencePriority,
  reasons: string[],
): RecommendedAction[] {
  switch (priority) {
    case 'P1_SAFETY':
      return [
        {
          actionType: 'rest',
          description:
            'トレーニングを即座に中止し、メディカルスタッフに相談してください。',
          priority: 'critical',
          requiresApproval: true,
        },
        {
          actionType: 'medical_review',
          description:
            'メディカルスタッフによる評価を受けてください。',
          priority: 'critical',
          requiresApproval: true,
        },
      ];

    case 'P2_MECHANICAL_RISK':
      return [
        {
          actionType: 'reduce_intensity',
          description:
            '負荷を 30-50% 軽減し、段階的な調整を行ってください。',
          priority: 'high',
          requiresApproval: true,
        },
        {
          actionType: 'modify_menu',
          description:
            '高負荷種目を低負荷の代替メニューに変更してください。',
          priority: 'high',
          requiresApproval: false,
        },
      ];

    case 'P3_DECOUPLING':
      return [
        {
          actionType: 'monitor',
          description:
            '主観的評価と客観的データの乖離を継続監視してください。',
          priority: 'medium',
          requiresApproval: false,
        },
        {
          actionType: 'modify_menu',
          description:
            '客観データに基づいた負荷調整を検討してください。',
          priority: 'medium',
          requiresApproval: false,
        },
      ];

    case 'P4_GAS_EXHAUSTION':
      return [
        {
          actionType: 'reduce_intensity',
          description:
            'リカバリーセッションを導入し、主観指標の回復を待ってください。',
          priority: 'medium',
          requiresApproval: false,
        },
        {
          actionType: 'monitor',
          description:
            '翌日の主観スコア変化を確認してください。',
          priority: 'low',
          requiresApproval: false,
        },
      ];

    case 'P5_NORMAL':
      return [
        {
          actionType: 'continue',
          description:
            '計画通りのトレーニングを継続してください。',
          priority: 'low',
          requiresApproval: false,
        },
      ];
  }
}

// ---------------------------------------------------------------------------
// 優先度 → 判定色マッピング
// ---------------------------------------------------------------------------

/** 優先度階層を判定色に変換する */
function priorityToDecision(
  priority: InferencePriority,
): InferenceDecision {
  switch (priority) {
    case 'P1_SAFETY':
      return 'RED';
    case 'P2_MECHANICAL_RISK':
      return 'ORANGE';
    case 'P3_DECOUPLING':
      return 'YELLOW';
    case 'P4_GAS_EXHAUSTION':
      return 'YELLOW';
    case 'P5_NORMAL':
      return 'GREEN';
  }
}

// ---------------------------------------------------------------------------
// ラベル定数
// ---------------------------------------------------------------------------

/** 組織カテゴリの日本語ラベル */
const TISSUE_CATEGORY_LABELS: Record<string, string> = {
  metabolic: '代謝系',
  structural_soft: '軟部組織',
  structural_hard: '骨・関節',
  neuromotor: '神経筋',
};

/** 主観指標の日本語ラベル */
const SUBJECTIVE_METRIC_LABELS: Record<string, string> = {
  sleepQuality: '睡眠の質',
  fatigue: '疲労度',
  mood: '気分',
  muscleSoreness: '筋肉痛',
  stressLevel: 'ストレス',
  painNRS: '痛み',
};

// ---------------------------------------------------------------------------
// Node 4 本体
// ---------------------------------------------------------------------------

/**
 * Node 4 実行モジュール: 判定サポート。
 *
 * P1（安全）→ P2（力学的リスク）→ P3（デカップリング）→
 * P4（GAS 疲憊期）→ P5（正常適応）の順に評価し、
 * 最初に該当する優先度レベルで判定を確定する。
 *
 * コンテキスト・オーバーライド:
 * - 試合日: P4 閾値緩和
 * - 順化期間: P1 HR スパイクミュート、P4 閾値緩和
 * - 減量期: P4 疲労警告抑制
 */
export const node4Decision: NodeExecutor<DecisionInput, DecisionOutput> = {
  nodeId: 'node4_decision',

  async execute(
    input: DecisionInput,
    context: AthleteContext,
    config: PipelineConfig,
  ): Promise<NodeResult<DecisionOutput>> {
    const startMs = performance.now();
    const warnings: string[] = [];
    const overridesApplied: string[] = [];

    const flags = input.cleanedInput.contextFlags;

    // コンテキスト・オーバーライドの記録
    if (flags.isGameDay) {
      overridesApplied.push('game_day');
    }
    if (flags.isAcclimatization) {
      overridesApplied.push('acclimatization');
    }
    if (flags.isWeightMaking) {
      overridesApplied.push('weight_making');
    }

    // ----- P1 判定 -----
    const p1 = checkP1Safety(input, context, config, flags);
    if (p1.triggered) {
      const priority: InferencePriority = 'P1_SAFETY';
      return {
        nodeId: 'node4_decision',
        success: true,
        executionTimeMs: performance.now() - startMs,
        data: {
          decision: priorityToDecision(priority),
          priority,
          reason: p1.reasons.join('\n'),
          reasonEn: p1.reasonsEn.join(' '),
          overridesApplied,
          recommendedActions: generateActions(priority, p1.reasons),
        },
        warnings,
      };
    }

    // ----- P2 判定 -----
    const p2 = checkP2MechanicalRisk(input, context, config);
    if (p2.triggered) {
      const priority: InferencePriority = 'P2_MECHANICAL_RISK';
      return {
        nodeId: 'node4_decision',
        success: true,
        executionTimeMs: performance.now() - startMs,
        data: {
          decision: priorityToDecision(priority),
          priority,
          reason: p2.reasons.join('\n'),
          reasonEn: p2.reasonsEn.join(' '),
          overridesApplied,
          recommendedActions: generateActions(priority, p2.reasons),
        },
        warnings,
      };
    }

    // ----- P3 判定 -----
    const p3 = checkP3Decoupling(input, context, config);
    if (p3.triggered) {
      const priority: InferencePriority = 'P3_DECOUPLING';
      return {
        nodeId: 'node4_decision',
        success: true,
        executionTimeMs: performance.now() - startMs,
        data: {
          decision: priorityToDecision(priority),
          priority,
          reason: p3.reasons.join('\n'),
          reasonEn: p3.reasonsEn.join(' '),
          overridesApplied,
          recommendedActions: generateActions(priority, p3.reasons),
        },
        warnings,
      };
    }

    // ----- P4 判定 -----
    const p4 = checkP4GASExhaustion(input, context, config, flags);
    if (p4.triggered) {
      const priority: InferencePriority = 'P4_GAS_EXHAUSTION';
      return {
        nodeId: 'node4_decision',
        success: true,
        executionTimeMs: performance.now() - startMs,
        data: {
          decision: priorityToDecision(priority),
          priority,
          reason: p4.reasons.join('\n'),
          reasonEn: p4.reasonsEn.join(' '),
          overridesApplied,
          recommendedActions: generateActions(priority, p4.reasons),
        },
        warnings,
      };
    }

    // ----- P5 判定: 正常適応 -----
    const p5 = checkP5Normal(input);
    const priority: InferencePriority = 'P5_NORMAL';

    return {
      nodeId: 'node4_decision',
      success: true,
      executionTimeMs: performance.now() - startMs,
      data: {
        decision: priorityToDecision(priority),
        priority,
        reason: p5.reasons.join('\n'),
        reasonEn: p5.reasonsEn.join(' '),
        overridesApplied,
        recommendedActions: generateActions(priority, p5.reasons),
      },
      warnings,
    };
  },
};

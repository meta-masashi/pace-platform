/**
 * PACE v6.2 — 競技別 SportProfile 定義
 *
 * 5競技(soccer/baseball/basketball/rugby/other)のパラメータプロファイル。
 * Go 側 sport_profiles.go と値が完全一致すること（CI スナップショットテストで検証）。
 *
 * Evidence references:
 *   - Soccer: Qin 2025, Thorpe 2017 (ACWR 1.5, Level 2a)
 *   - Baseball: Fleisig 2022, Wilk 2009, Olsen 2006
 *   - Basketball: Svilar 2018, Drakos 2010, Hewett 2005
 *   - Rugby: Gabbett 2016 (original ACWR study)
 */

import type { PipelineConfig, InferenceDecision, TissueCategory } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** サポート対象の競技ID */
export type SportID = 'soccer' | 'baseball' | 'basketball' | 'rugby' | 'other';

/** 競技別推論パラメータプロファイル */
export interface SportProfile {
  sportId: SportID;
  isContactSport: boolean;
  acwrRedLine: number;
  acwrYouthFactor: number;
  monotonyRedLine: number;
  painThresholdAdjust: number;
  ewma: {
    acuteLambda: number;
    chronicLambda: number;
  };
  featureWeights: {
    acwrExcess: number;
    wellnessDecline: number;
    injuryHistory: number;
    monotonyInfo: number;
  };
  tissueDefaults: Record<TissueCategory, {
    halfLifeDays: number;
    alpha: number;
    beta: number;
    tau: number;
    m: number;
  }>;
  recommendedActions: Record<InferenceDecision, string[]>;
}

// ---------------------------------------------------------------------------
// Helper: span → lambda conversion
// ---------------------------------------------------------------------------

/** EWMA span (days) → lambda. λ = 2 / (span + 1) */
function spanToLambda(span: number): number {
  return 2.0 / (span + 1.0);
}

// ---------------------------------------------------------------------------
// Soccer (baseline)
// ---------------------------------------------------------------------------

const soccerProfile: SportProfile = {
  sportId: 'soccer',
  isContactSport: true,
  acwrRedLine: 1.5,
  acwrYouthFactor: 0.867,
  monotonyRedLine: 2.0,
  painThresholdAdjust: 1.2,
  ewma: {
    acuteLambda: spanToLambda(7),   // 0.25
    chronicLambda: spanToLambda(28), // ~0.069
  },
  featureWeights: {
    acwrExcess: 2.5,
    wellnessDecline: 2.0,
    injuryHistory: 1.5,
    monotonyInfo: 0.3,
  },
  tissueDefaults: {
    metabolic: { halfLifeDays: 2, alpha: 0.5, beta: 0.3, tau: 0.5, m: 1.5 },
    structural_soft: { halfLifeDays: 7, alpha: 0.3, beta: 0.1, tau: 0.8, m: 2.0 },
    structural_hard: { halfLifeDays: 21, alpha: 0.1, beta: 0.05, tau: 1.2, m: 2.5 },
    neuromotor: { halfLifeDays: 3, alpha: 0.4, beta: 0.2, tau: 0.6, m: 1.8 },
  },
  recommendedActions: {
    RED: [
      'トレーニング中止、医療スタッフによる評価を実施してください',
      'FIFA 11+ 傷害予防プログラムの段階的再開を検討',
    ],
    ORANGE: [
      '高強度トレーニングを30-50%削減してください',
      '接触練習からの一時的除外を検討',
    ],
    YELLOW: [
      'リカバリーセッションを推奨します',
      'FIFA 11+ ウォームアッププロトコルを実施',
    ],
    GREEN: [
      '通常通りトレーニング継続可能です',
      'FIFA 11+ 傷害予防プログラムを日常的に実施',
    ],
  },
};

// ---------------------------------------------------------------------------
// Baseball
// ---------------------------------------------------------------------------

const baseballProfile: SportProfile = {
  sportId: 'baseball',
  isContactSport: false,
  acwrRedLine: 1.3,
  acwrYouthFactor: 0.867,
  monotonyRedLine: 2.0,
  painThresholdAdjust: 1.0,
  ewma: {
    acuteLambda: spanToLambda(7),   // 0.25
    chronicLambda: spanToLambda(21), // ~0.091 — shorter chronic window for pitcher recovery
  },
  featureWeights: {
    acwrExcess: 2.0,
    wellnessDecline: 2.5,  // shoulder/elbow subjective decline is critical (Wilk 2009)
    injuryHistory: 2.0,    // high recurrence rate (Fleisig 2011)
    monotonyInfo: 0.5,     // daily games → structurally high monotony
  },
  tissueDefaults: {
    metabolic: { halfLifeDays: 2, alpha: 0.5, beta: 0.3, tau: 0.5, m: 1.5 },
    structural_soft: { halfLifeDays: 10, alpha: 0.3, beta: 0.1, tau: 0.8, m: 2.0 },
    structural_hard: { halfLifeDays: 28, alpha: 0.1, beta: 0.05, tau: 1.2, m: 2.5 },
    neuromotor: { halfLifeDays: 3, alpha: 0.4, beta: 0.2, tau: 0.6, m: 1.8 },
  },
  recommendedActions: {
    RED: [
      '投球禁止、医療スタッフによる肩・肘の評価を実施してください',
      'Pitch Smart ガイドラインに基づく段階的復帰プロトコルを検討',
    ],
    ORANGE: [
      '投球数を50%削減、またはブルペン投球のみに制限してください',
      'Thrower\'s Ten プログラム（レベル1: 軽負荷）を実施',
    ],
    YELLOW: [
      '投球数をモニタリングしながら練習継続可能です',
      'Thrower\'s Ten プログラム + 肩甲骨安定化エクササイズを推奨',
    ],
    GREEN: [
      '通常通り練習・試合参加可能です',
      '投球前のダイナミックウォームアップ + Thrower\'s Ten を推奨',
    ],
  },
};

// ---------------------------------------------------------------------------
// Basketball
// ---------------------------------------------------------------------------

const basketballProfile: SportProfile = {
  sportId: 'basketball',
  isContactSport: true,
  acwrRedLine: 1.4,
  acwrYouthFactor: 0.867,
  monotonyRedLine: 2.5,
  painThresholdAdjust: 1.1,
  ewma: {
    acuteLambda: spanToLambda(7),
    chronicLambda: spanToLambda(28),
  },
  featureWeights: {
    acwrExcess: 2.3,  // jump/landing load emphasis (Svilar 2018)
    wellnessDecline: 2.0,
    injuryHistory: 1.5,
    monotonyInfo: 0.3,
  },
  tissueDefaults: {
    metabolic: { halfLifeDays: 2, alpha: 0.5, beta: 0.3, tau: 0.5, m: 1.5 },
    structural_soft: { halfLifeDays: 7, alpha: 0.3, beta: 0.1, tau: 0.8, m: 2.0 },
    structural_hard: { halfLifeDays: 21, alpha: 0.1, beta: 0.05, tau: 1.2, m: 2.5 },
    neuromotor: { halfLifeDays: 3, alpha: 0.4, beta: 0.2, tau: 0.6, m: 1.8 },
  },
  recommendedActions: {
    RED: [
      'トレーニング中止、医療スタッフによる評価を実施してください',
      '足関節・膝の状態を確認し、段階的復帰プロトコルを検討',
    ],
    ORANGE: [
      'ジャンプ系ドリル・カッティング動作を制限してください',
      '足関節安定性エクササイズ + バランスボードトレーニングを重点実施',
    ],
    YELLOW: [
      'リカバリーセッションを推奨します',
      'ACL予防プログラム（Nordic Hamstring + Single-leg Balance）を実施',
    ],
    GREEN: [
      '通常通りトレーニング継続可能です',
      '足関節安定性プログラム + ACL予防エクササイズを日常的に実施',
    ],
  },
};

// ---------------------------------------------------------------------------
// Rugby
// ---------------------------------------------------------------------------

const rugbyProfile: SportProfile = {
  sportId: 'rugby',
  isContactSport: true,
  acwrRedLine: 1.5,
  acwrYouthFactor: 0.867,
  monotonyRedLine: 2.0,
  painThresholdAdjust: 1.4,
  ewma: {
    acuteLambda: spanToLambda(7),
    chronicLambda: spanToLambda(28),
  },
  featureWeights: {
    acwrExcess: 2.5,
    wellnessDecline: 2.0,
    injuryHistory: 1.5,
    monotonyInfo: 0.3,
  },
  tissueDefaults: {
    metabolic: { halfLifeDays: 2, alpha: 0.5, beta: 0.3, tau: 0.5, m: 1.5 },
    structural_soft: { halfLifeDays: 5, alpha: 0.3, beta: 0.1, tau: 0.8, m: 2.0 },
    structural_hard: { halfLifeDays: 14, alpha: 0.1, beta: 0.05, tau: 1.2, m: 2.5 },
    neuromotor: { halfLifeDays: 3, alpha: 0.4, beta: 0.2, tau: 0.6, m: 1.8 },
  },
  recommendedActions: {
    RED: [
      'トレーニング中止、医療スタッフによる評価を実施してください',
      'コンタクト練習からの即時除外、HIA（頭部傷害評価）を検討',
    ],
    ORANGE: [
      'コンタクト練習からの一時的除外を検討してください',
      '高強度トレーニングを30-50%削減',
    ],
    YELLOW: [
      'リカバリーセッションを推奨します',
      '非コンタクトの有酸素トレーニングに限定',
    ],
    GREEN: [
      '通常通りトレーニング継続可能です',
      '傷害予防プログラム（肩・頸部の安定化）を日常的に実施',
    ],
  },
};

// ---------------------------------------------------------------------------
// Other (generic fallback)
// ---------------------------------------------------------------------------

const otherProfile: SportProfile = {
  ...soccerProfile,
  sportId: 'other',
  isContactSport: false,
  painThresholdAdjust: 1.0,
  recommendedActions: {
    RED: [
      'トレーニング中止、医療スタッフによる評価を実施してください',
      '段階的復帰プロトコルを検討',
    ],
    ORANGE: [
      '高強度トレーニングを30-50%削減してください',
      '負荷軽減メニューに変更',
    ],
    YELLOW: [
      'リカバリーセッションを推奨します',
      'ウォームアッププロトコルを実施',
    ],
    GREEN: [
      '通常通りトレーニング継続可能です',
      '傷害予防プログラムを日常的に実施',
    ],
  },
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/** 全競技プロファイルのマップ */
export const SPORT_PROFILES: Record<SportID, SportProfile> = {
  soccer: soccerProfile,
  baseball: baseballProfile,
  basketball: basketballProfile,
  rugby: rugbyProfile,
  other: otherProfile,
};

/**
 * 競技IDから SportProfile を取得する。未知の競技は "other" にフォールバック。
 */
export function getSportProfile(sport: string): SportProfile {
  if (sport in SPORT_PROFILES) {
    return SPORT_PROFILES[sport as SportID];
  }
  return SPORT_PROFILES.other;
}

/**
 * 競技に応じた PipelineConfig のオーバーライドを生成する。
 * mergePipelineConfig() と組み合わせて使用。
 */
export function sportConfigOverrides(sport: string): Partial<PipelineConfig> {
  const profile = getSportProfile(sport);
  return {
    version: 'v6.2',
    thresholds: {
      painRedFlag: 8,
      restingHRSpikePercent: 30,
      acwrRedLine: profile.acwrRedLine,
      monotonyRedLine: profile.monotonyRedLine,
      decouplingThreshold: 1.5,
      zScoreExhaustion: -1.5,
      zScoreMultipleCount: 2,
    },
    ewma: profile.ewma,
    tissueDefaults: profile.tissueDefaults,
  };
}

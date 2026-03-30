/**
 * PACE v6.0 推論パイプライン型定義
 * 6層ノード・パイプライン（Node 0〜5）のコア型
 */

// ---------------------------------------------------------------------------
// 基本列挙型
// ---------------------------------------------------------------------------

/** 推論パイプラインの判定結果 */
export type InferenceDecision = 'RED' | 'ORANGE' | 'YELLOW' | 'GREEN';

/** 判定の優先度階層 P1-P5 */
export type InferencePriority =
  | 'P1_SAFETY'
  | 'P2_MECHANICAL_RISK'
  | 'P3_DECOUPLING'
  | 'P4_GAS_EXHAUSTION'
  | 'P5_NORMAL';

/** 組織カテゴリ（4層） */
export type TissueCategory =
  | 'metabolic'
  | 'structural_soft'
  | 'structural_hard'
  | 'neuromotor';

/** パイプラインのノードID */
export type NodeId =
  | 'node0_ingestion'
  | 'node1_cleaning'
  | 'node2_feature'
  | 'node3_inference'
  | 'node4_decision'
  | 'node5_presentation';

// ---------------------------------------------------------------------------
// コンテキスト・フラグ
// ---------------------------------------------------------------------------

/** 環境フラグ（コンテキスト・オーバーライド用） */
export interface ContextFlags {
  /** 試合当日 */
  isGameDay: boolean;
  /** 試合前日 */
  isGameDayMinus1: boolean;
  /** 高地/猛暑順化 */
  isAcclimatization: boolean;
  /** 順化日数 */
  acclimatizationDayCount?: number;
  /** 急速減量期 */
  isWeightMaking: boolean;
  /** ワクチン接種後7日以内 */
  isPostVaccination: boolean;
  /** 発熱後7日以内 */
  isPostFever: boolean;
  /** 過去24時間以内に鎮痛剤（NSAID）を服用した（Pain NRS の P1 チェックをマスク） */
  isMedicationNsaid24h?: boolean;
}

// ---------------------------------------------------------------------------
// Node 0: 選手コンテキスト
// ---------------------------------------------------------------------------

/** 既往歴エントリ */
export interface MedicalHistoryEntry {
  /** 身体部位 */
  bodyPart: string;
  /** 傷病名 */
  condition: string;
  /** 発生日（ISO date） */
  date: string;
  /** 重症度 */
  severity: 'mild' | 'moderate' | 'severe';
  /** この既往歴による事前確率の倍率 */
  riskMultiplier: number;
}

/** 直前の有効日次記録（LOCF/減衰インピュテーション用） */
export interface LastKnownRecord {
  /** 記録日（ISO date） */
  date: string;
  /** 睡眠の質 */
  sleepQuality: number;
  /** 疲労度 */
  fatigue: number;
  /** 気分 */
  mood: number;
  /** 筋肉痛 */
  muscleSoreness: number;
  /** ストレス */
  stressLevel: number;
  /** 痛み NRS */
  painNRS: number;
  /** sRPE */
  sRPE: number;
  /** トレーニング時間（分） */
  trainingDurationMin: number;
}

/** Node 0: 選手コンテキスト（EHR + メタデータ） */
export interface AthleteContext {
  /** 選手ID */
  athleteId: string;
  /** 組織ID */
  orgId: string;
  /** チームID */
  teamId: string;
  /** 年齢 */
  age: number;
  /** 競技種目 */
  sport: string;
  /** コンタクトスポーツかどうか */
  isContactSport: boolean;
  /** N_days（データ蓄積日数） */
  validDataDays: number;
  /** Node 0 で生成された初期確率 */
  bayesianPriors: Record<string, number>;
  /** 部位別 RiskMultiplier */
  riskMultipliers: Record<string, number>;
  /** 既往歴 */
  medicalHistory: MedicalHistoryEntry[];
  /** 組織別半減期（日） */
  tissueHalfLifes: Record<TissueCategory, number>;
  /** 直前の有効記録（LOCF/指数減衰インピュテーション用）*/
  lastKnownRecord?: LastKnownRecord;
}

// ---------------------------------------------------------------------------
// 日次入力データ
// ---------------------------------------------------------------------------

/** 日次入力データ */
export interface DailyInput {
  /** 日付（ISO date） */
  date: string;
  /** sRPE（0-10） */
  sRPE: number;
  /** トレーニング時間（分） */
  trainingDurationMin: number;
  /** セッション負荷（sRPE x duration） */
  sessionLoad: number;
  /** 主観的指標 */
  subjectiveScores: {
    /** 睡眠の質（0-10） */
    sleepQuality: number;
    /** 疲労度（0-10） */
    fatigue: number;
    /** 気分（0-10） */
    mood: number;
    /** 筋肉痛（0-10） */
    muscleSoreness: number;
    /** ストレス（0-10） */
    stressLevel: number;
    /** 痛みNRS（0-10） */
    painNRS: number;
    /** 安静時心拍数（bpm、任意） */
    restingHeartRate?: number;
  };
  /** 客観的負荷データ（任意） */
  objectiveLoad?: {
    /** 走行距離（km） */
    distanceKm?: number;
    /** プレーヤーロード */
    playerLoad?: number;
    /** 衝撃G */
    impactG?: number;
    /** スプリント回数 */
    sprintCount?: number;
    /** 高速走行距離（m） */
    hsr_m?: number;
    /** デバイス信頼性 κ（0.0-1.0） */
    deviceKappa: number;
  };
  /** 環境フラグ */
  contextFlags: ContextFlags;
  /** タイムゾーン（例: 'Asia/Tokyo'） */
  localTimezone: string;
  /** 入力レイテンシ（虚偽検知用、ms） */
  responseLatencyMs?: number;
}

// ---------------------------------------------------------------------------
// ノード実行結果
// ---------------------------------------------------------------------------

/** 各ノードの実行結果 */
export interface NodeResult<T = unknown> {
  /** ノードID */
  nodeId: NodeId;
  /** 成功フラグ */
  success: boolean;
  /** 実行時間（ms） */
  executionTimeMs: number;
  /** 出力データ */
  data: T;
  /** 警告メッセージ */
  warnings: string[];
  /** エラーメッセージ */
  error?: string;
}

// ---------------------------------------------------------------------------
// データ品質
// ---------------------------------------------------------------------------

/** データ品質スコア */
export interface DataQualityReport {
  /** 品質スコア（0.0-1.0） */
  qualityScore: number;
  /** 総フィールド数 */
  totalFields: number;
  /** 有効フィールド数 */
  validFields: number;
  /** 補完されたフィールド名 */
  imputedFields: string[];
  /** 外れ値として弾かれたフィールド名 */
  outlierFields: string[];
  /** 成熟モード: Day 0-13 / 14-27 / 28+ */
  maturationMode: 'safety' | 'learning' | 'full';
  /** 欠損補完方式（補完が発生した場合のみセット） */
  imputationMethod?: 'locf' | 'decay' | 'neutral';
  /** 直前記録からのギャップ日数（補完が発生した場合のみセット） */
  gapDays?: number;
}

// ---------------------------------------------------------------------------
// Node 2: 特徴量ベクトル
// ---------------------------------------------------------------------------

/** Node 2: 特徴量ベクトル */
export interface FeatureVector {
  /** Acute:Chronic Workload Ratio */
  acwr: number;
  /** 単調性指標 */
  monotonyIndex: number;
  /** プレパレッドネス */
  preparedness: number;
  /** 組織別ダメージ D(t) */
  tissueDamage: Record<TissueCategory, number>;
  /** 各主観指標のZ-Score */
  zScores: Record<string, number>;
  /** EKF デカップリング指標 */
  decouplingScore?: number;
  /** 構造的脆弱性 Φ_structural */
  structuralVulnerability?: number;
}

// ---------------------------------------------------------------------------
// Node 3: 推論結果
// ---------------------------------------------------------------------------

/** Node 3: 推論結果 */
export interface InferenceOutput {
  /** 部位別リスクスコア */
  riskScores: Record<string, number>;
  /** ベイズ事後確率 */
  posteriorProbabilities: Record<string, number>;
  /** 信頼区間 */
  confidenceIntervals: Record<string, [number, number]>;
}

// ---------------------------------------------------------------------------
// Node 4: 判定結果
// ---------------------------------------------------------------------------

/** 推奨アクション */
export interface RecommendedAction {
  /** アクション種別 */
  actionType:
    | 'rest'
    | 'reduce_intensity'
    | 'modify_menu'
    | 'medical_review'
    | 'monitor'
    | 'continue';
  /** 説明（日本語） */
  description: string;
  /** 優先度 */
  priority: 'critical' | 'high' | 'medium' | 'low';
  /** P1/P2 は承認必要 */
  requiresApproval: boolean;
}

/** Node 4: 判定結果 */
export interface DecisionOutput {
  /** 判定カラー */
  decision: InferenceDecision;
  /** 判定の優先度階層 */
  priority: InferencePriority;
  /** 判定理由（日本語） */
  reason: string;
  /** 判定理由（英語） */
  reasonEn: string;
  /** 適用されたオーバーライド */
  overridesApplied: string[];
  /** 推奨アクション */
  recommendedActions: RecommendedAction[];
}

// ---------------------------------------------------------------------------
// Node 5: パイプライン最終出力
// ---------------------------------------------------------------------------

/** Node 5: 最終出力（UI表示 + トレースログ保存） */
export interface PipelineOutput {
  /** トレースID（UUID） */
  traceId: string;
  /** 選手ID */
  athleteId: string;
  /** タイムスタンプ（ISO 8601） */
  timestamp: string;
  /** 判定結果 */
  decision: DecisionOutput;
  /** 特徴量ベクトル */
  featureVector: FeatureVector;
  /** 推論結果 */
  inference: InferenceOutput;
  /** データ品質レポート */
  dataQuality: DataQualityReport;
  /** パイプラインバージョン */
  pipelineVersion: string;
}

// ---------------------------------------------------------------------------
// 推論トレースログ
// ---------------------------------------------------------------------------

/** 推論トレースログ（DB保存用） */
export interface InferenceTraceLog {
  /** トレースID */
  traceId: string;
  /** 選手ID */
  athleteId: string;
  /** 組織ID */
  orgId: string;
  /** UTC タイムスタンプ */
  timestampUtc: string;
  /** パイプラインバージョン */
  pipelineVersion: string;
  /** 推論スナップショット */
  inferenceSnapshot: {
    /** 入力データ */
    inputs: DailyInput;
    /** 適用された定数 */
    appliedConstants: Record<string, unknown>;
    /** 算出された特徴量 */
    calculatedMetrics: FeatureVector;
    /** ベイズ計算結果 */
    bayesianComputation: InferenceOutput;
    /** トリガーされた優先度ルール */
    triggeredRule: InferencePriority;
    /** 判定結果 */
    decision: InferenceDecision;
    /** 判定理由 */
    decisionReason: string;
    /** 適用されたオーバーライド */
    overridesApplied: string[];
    /** 各ノードの実行結果サマリー */
    nodeResults: Record<
      NodeId,
      { success: boolean; executionTimeMs: number; warnings: string[] }
    >;
  };
}

// ---------------------------------------------------------------------------
// パイプライン設定
// ---------------------------------------------------------------------------

/** 組織別デフォルトパラメータ */
export interface TissueDefaultParams {
  /** 半減期（日） */
  halfLifeDays: number;
  /** α パラメータ */
  alpha: number;
  /** β パラメータ */
  beta: number;
  /** τ パラメータ */
  tau: number;
  /** m パラメータ */
  m: number;
}

/** パイプライン設定 */
export interface PipelineConfig {
  /** バージョン */
  version: string;
  /** 各閾値 */
  thresholds: {
    /** P1: 痛み ≥ 8 */
    painRedFlag: number;
    /** P1: 安静時心拍スパイク % */
    restingHRSpikePercent: number;
    /** P2: ACWR > 1.5 */
    acwrRedLine: number;
    /** P2: Monotony > 2.0 */
    monotonyRedLine: number;
    /** P3: デカップリング基本閾値 1.5 */
    decouplingThreshold: number;
    /** P4: Z ≤ -1.5 */
    zScoreExhaustion: number;
    /** P4: 複数項目数 */
    zScoreMultipleCount: number;
  };
  /** EWMA パラメータ */
  ewma: {
    /** 急性負荷 λ（7日相当） */
    acuteLambda: number;
    /** 慢性負荷 λ（28日相当） */
    chronicLambda: number;
  };
  /** プレパレッドネス重み */
  preparedness: {
    /** フィットネス重み */
    w1: number;
    /** 疲労重み */
    w2: number;
  };
  /** 組織別デフォルトパラメータ */
  tissueDefaults: Record<TissueCategory, TissueDefaultParams>;
}

// ---------------------------------------------------------------------------
// ノード実行インターフェース
// ---------------------------------------------------------------------------

/** ノード実行関数のインターフェース */
export interface NodeExecutor<TInput = unknown, TOutput = unknown> {
  /** ノードID */
  nodeId: NodeId;
  /** ノード実行 */
  execute(
    input: TInput,
    context: AthleteContext,
    config: PipelineConfig,
  ): Promise<NodeResult<TOutput>>;
}

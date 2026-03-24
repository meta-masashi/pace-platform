/**
 * PACE Platform — アセスメントエンジン 型定義
 *
 * Computerized Adaptive Testing (CAT) によるインジュリーアセスメント。
 * F1 Acute 評価で使用する型定義。
 *
 * assessment_nodes テーブルと連動し、リアルタイムのベイズ事後確率更新、
 * 情報利得による適応的質問選択、レッドフラグ検出を行う。
 */

// ---------------------------------------------------------------------------
// 基本列挙型
// ---------------------------------------------------------------------------

/** アセスメントの種類 */
export type AssessmentType = "f1_acute" | "chronic" | "performance";

/** アセスメントのステータス */
export type AssessmentStatus =
  | "in_progress"
  | "completed"
  | "terminated_red_flag"
  | "abandoned";

/** 回答値 */
export type AnswerValue = "yes" | "no" | "unknown";

/** リスクレベル */
export type RiskLevel = "critical" | "high" | "medium" | "low";

// ---------------------------------------------------------------------------
// アセスメントノード（assessment_nodes テーブル対応）
// ---------------------------------------------------------------------------

/**
 * アセスメントの各質問ノード。
 * assessment_nodes テーブルの全フィールドに対応する。
 */
export interface AssessmentNode {
  /** ノード一意識別子 */
  node_id: string;
  /** ファイルタイプ（F1, F2, etc.） */
  file_type: string;
  /** 評価フェーズ */
  phase: string;
  /** カテゴリ（例: "cervical", "shoulder"） */
  category: string;
  /** 質問テキスト */
  question_text: string;
  /** 評価対象の診断軸（例: "ACL_tear", "meniscus_injury"） */
  target_axis: string;
  /** 陽性時の尤度比 */
  lr_yes: number;
  /** 陰性時の尤度比 */
  lr_no: number;
  /** 信頼度係数（κ: 検査者間一致率） */
  kappa: number;
  /** ルーティングルール（レッドフラグ条件等）のJSON */
  routing_rules_json: RoutingRules | null;
  /** 処方タグ（このノードが陽性の場合に推奨される運動タイプ） */
  prescription_tags_json: string[] | null;
  /** 禁忌タグ（このノードが陽性の場合に禁止される運動タイプ） */
  contraindication_tags_json: string[] | null;
  /** 時間減衰パラメータ（λ） */
  time_decay_lambda: number | null;
  /** ベース有病率 */
  base_prevalence: number;
  /** 排他グループ（同グループ内の診断は零和正規化） */
  mutual_exclusive_group: string | null;
}

/**
 * ルーティングルールの構造。
 * routing_rules_json カラムに格納される。
 */
export interface RoutingRules {
  /** レッドフラグ条件リスト */
  red_flags?: RedFlagCondition[];
  /** スキップ条件リスト */
  skip_conditions?: SkipCondition[];
}

/** レッドフラグ条件 */
export interface RedFlagCondition {
  /** トリガーとなる回答値 */
  trigger_answer: AnswerValue;
  /** レッドフラグの重症度 */
  severity: "critical" | "high";
  /** レッドフラグの説明 */
  description: string;
  /** ハードロックを適用するか */
  hard_lock: boolean;
}

/** スキップ条件 */
export interface SkipCondition {
  /** 前提ノードID */
  prerequisite_node_id: string;
  /** 前提ノードの回答が一致する場合にスキップ */
  prerequisite_answer: AnswerValue;
}

// ---------------------------------------------------------------------------
// アセスメントセッション
// ---------------------------------------------------------------------------

/**
 * アセスメントセッションの状態を表す。
 * assessment_sessions テーブルに対応。
 */
export interface AssessmentSession {
  /** セッション一意識別子 */
  id: string;
  /** 対象アスリートID */
  athleteId: string;
  /** 評価実施スタッフID */
  staffId: string;
  /** アセスメント種別 */
  assessmentType: AssessmentType;
  /** ステータス */
  status: AssessmentStatus;
  /** 開始日時（ISO 8601） */
  startedAt: string;
  /** 完了日時（ISO 8601） */
  completedAt: string | null;
  /** 現在表示中のノードID */
  currentNodeId: string | null;
  /** 全回答履歴 */
  responses: AssessmentResponse[];
  /** 現在の事後確率マップ（diagnosisCode → probability） */
  posteriors: Record<string, number>;
  /** 組織ID（RLS フィルタリング用） */
  orgId: string;
}

// ---------------------------------------------------------------------------
// 回答
// ---------------------------------------------------------------------------

/**
 * 個々のアセスメント回答。
 * assessment_responses テーブルに対応。
 */
export interface AssessmentResponse {
  /** 回答対象ノードID */
  nodeId: string;
  /** 回答値 */
  answer: AnswerValue;
  /** 回答日時（ISO 8601） */
  timestamp: string;
}

// ---------------------------------------------------------------------------
// 推論結果
// ---------------------------------------------------------------------------

/**
 * 個々の診断仮説の事後確率。
 */
export interface PosteriorResult {
  /** 診断コード（target_axis に対応） */
  diagnosisCode: string;
  /** 事後確率（0-1） */
  probability: number;
  /** 95% 信頼区間 [lower, upper] */
  confidence: [number, number];
  /** レッドフラグが発火しているか */
  isRedFlag: boolean;
}

/**
 * 次に表示すべき質問の情報。
 */
export interface NextQuestionResult {
  /** ノードID */
  nodeId: string;
  /** 質問テキスト */
  questionText: string;
  /** 情報利得スコア */
  informationGain: number;
  /** 進捗率（0-100、信頼度収束に基づく） */
  progress: number;
}

/**
 * レッドフラグ検出結果。
 */
export interface RedFlagResult {
  /** ノードID */
  nodeId: string;
  /** 重症度 */
  severity: "critical" | "high";
  /** 説明 */
  description: string;
  /** ハードロック適用フラグ */
  hardLock: boolean;
}

/**
 * アセスメント最終結果。
 * assessment_results テーブルに対応。
 */
export interface AssessmentResult {
  /** 主診断コード */
  primaryDiagnosis: string;
  /** 主診断の信頼度（0-1） */
  confidence: number;
  /** 鑑別診断リスト（上位5件） */
  differentials: PosteriorResult[];
  /** 発火したレッドフラグ一覧 */
  redFlags: RedFlagResult[];
  /** 統合された禁忌タグ */
  contraindicationTags: string[];
  /** 統合された処方タグ */
  prescriptionTags: string[];
  /** 回答数 */
  responseCount: number;
  /** 完了理由 */
  terminationReason: "high_confidence" | "diminishing_returns" | "max_questions" | "red_flag";
}

// ---------------------------------------------------------------------------
// API レスポンス型
// ---------------------------------------------------------------------------

/** アセスメント開始レスポンス */
export interface StartAssessmentResponse {
  success: true;
  data: {
    assessmentId: string;
    firstQuestion: NextQuestionResult;
    totalNodes: number;
  };
}

/** 回答送信レスポンス */
export interface AnswerAssessmentResponse {
  success: true;
  data: {
    nextQuestion: NextQuestionResult | null;
    posteriors: PosteriorResult[];
    progress: number;
    isComplete: boolean;
    result: AssessmentResult | null;
    redFlag: RedFlagResult | null;
  };
}

/** アセスメントステータスレスポンス */
export interface AssessmentStatusResponse {
  success: true;
  data: {
    session: AssessmentSession;
    result: AssessmentResult | null;
  };
}

/** 事後確率レスポンス */
export interface PosteriorsResponse {
  success: true;
  data: {
    posteriors: PosteriorResult[];
    updatedAt: string;
  };
}

/** 共通エラーレスポンス */
export interface AssessmentErrorResponse {
  success: false;
  error: string;
}

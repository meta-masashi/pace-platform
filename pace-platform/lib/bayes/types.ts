/**
 * PACE Platform — ベイズ推論エンジン 型定義
 *
 * Python FastAPI マイクロサービスとの通信型定義。
 * v3.0 グランドインテグレーション仕様（131ノード CAT + 動的ベイズネットワーク）
 */

// ---------------------------------------------------------------------------
// アセスメントノード
// ---------------------------------------------------------------------------

export type AnswerValue = "yes" | "no" | "unknown";

export type AssessmentType = "acute" | "chronic" | "performance";

export type RiskLevel = "critical" | "high" | "medium" | "low";

export type EvidenceLevel = "A" | "B" | "C";

/**
 * アセスメントの各質問ノード
 */
export interface AssessmentNode {
  node_id: string;
  source: string;
  category: string;
  /** 評価軸（例: "structural", "functional", "load", "neuro"）*/
  axis_type: string;
  unit: string;
  /** 陽性時の尤度比 */
  lr_yes: number;
  /** 陰性時の尤度比 */
  lr_no: number;
  base_lr: number;
  evidence_level: EvidenceLevel;
  description: string;
  /** PACE 専用注釈 */
  pace_annotation: string | null;
  /** 処方タグ（このノードが陽性の場合に推奨される運動タイプ）*/
  prescription_tags: string[];
  /** 禁忌タグ（このノードが陽性の場合に禁止される運動タイプ）*/
  contraindication_tags: string[];
  is_active: boolean;
  /** DAG 因果グラフ: このノードの親ノード定義（因果割引に使用）*/
  parents?: CausalEdge[];
}

// ---------------------------------------------------------------------------
// 推論ロジック（v3 グランドインテグレーション）
// ---------------------------------------------------------------------------

export interface InferenceLogic {
  logic_id: string;
  target_node_id: string;
  /** "|" 区切りのトリガーノード ID リスト */
  trigger_nodes: string;
  /** 条件式（例: "HQ_Ratio<0.60 AND Fatigue7"）*/
  conditions: string;
  factor: number;
  factor_type: "Injury_OR" | "Perf_Ratio";
  interaction_type: "Override" | "Multiply";
  evidence: string | null;
  soap_template: string | null;
  is_active: boolean;
}

// ---------------------------------------------------------------------------
// 推論結果
// ---------------------------------------------------------------------------

export interface DiagnosisCandidate {
  label: string;
  /** ポステリア確率（0-1）*/
  posterior: number;
  risk_level: RiskLevel;
  /** SOAP テンプレート文字列 */
  soap_templates: string[];
  /** 使用された推論ロジック ID */
  fired_logic_ids: string[];
}

export interface DiagnosisResult {
  session_id: string;
  athlete_id: string;
  assessment_type: AssessmentType;
  completed_at: string;
  /** 推論に使用したアルゴリズム */
  engine_version: "v2_naive_bayes" | "v3_dynamic_bayesian_network";
  /** 上位候補（最大 5 件）*/
  top_diagnoses: DiagnosisCandidate[];
  overall_risk_level: RiskLevel;
  hard_lock_active: boolean;
  soft_lock_active: boolean;
  /** 統合された禁忌タグ（全回答から集計）*/
  contraindication_tags: string[];
  /** 統合された処方タグ */
  prescription_tags: string[];
  /** アセスメント完了率（0-1）*/
  completion_rate: number;
  /** v3 特有: コンテキスト修飾子（生体力学 + 疲労要因）*/
  context_modifier?: number;
}

// ---------------------------------------------------------------------------
// セッション状態
// ---------------------------------------------------------------------------

export interface InferenceSession {
  session_id: string;
  athlete_id: string;
  staff_id: string;
  assessment_type: AssessmentType;
  responses: NodeResponse[];
  answered_node_ids: string[];
  is_emergency: boolean;
  started_at: string;
  completed_at: string | null;
}

export interface NodeResponse {
  node_id: string;
  answer: AnswerValue;
  answered_at: string;
  lr_yes: number;
  lr_no: number;
  target_axis: string;
  prescription_tags: string[];
  contraindication_tags: string[];
}

// ---------------------------------------------------------------------------
// v3.1 因果グラフ（DAG）型定義 — Causal Discounting Model
// ---------------------------------------------------------------------------

/**
 * ノード間の因果関係（有向辺）を定義する。
 *
 * 例: 「足関節背屈ROM不足（F2_001）」→「ディープスクワット不良（F1_001）」
 * の因果関係では、F1_001 の parents に以下が入る:
 *   { parentId: "F2_001", discountFactor: 0.85 }
 *
 * discountFactor (gamma): 親ノードが発火した際に子ノードの LR を割り引く率。
 *   0.0 = 割引なし（独立情報）
 *   1.0 = 完全割引（親が全て説明、子の追加情報ゼロ）
 */
export interface CausalEdge {
  parentId: string;
  discountFactor: number; // γ (0.0 to 1.0)
}

/**
 * 推論時の入力データ（発火しているノードのリスト）
 */
export interface ActiveObservation {
  node_id: string;
  is_active: boolean; // Yes と回答されたか
}

// ---------------------------------------------------------------------------
// v3 動的ベイズネットワーク 追加型
// ---------------------------------------------------------------------------

export interface AthleteContext {
  age?: number;
  sex?: "male" | "female";
  cmj_asymmetry_ratio?: number;
  rsi_norm?: number;
  srpe?: number;
  acwr?: number;
  acwr_anomaly?: boolean;
  sleep_hours?: number;
  nutrition_deficit?: boolean;
  hrv_baseline_ratio?: number;
}

export interface FiredLogic extends InferenceLogic {
  /** グレースフルデグレード時に設定される調整済みファクター */
  adjusted_factor?: number;
  /** 1.0 = 完全発火, <1.0 = 部分的発火 */
  completion_rate?: number;
  missing_nodes?: string[];
}

export interface V3InferenceResult {
  target_id: string;
  posterior: number;
  fired_logics: FiredLogic[];
  soap_templates: string[];
  interaction_type: "Override" | "Multiply" | "Mixed";
  context_modifier: number;
}

// ---------------------------------------------------------------------------
// FastAPI レスポンス型
// ---------------------------------------------------------------------------

export interface BayesApiHealthResponse {
  status: "ok" | "degraded" | "error";
  engine_version: string;
  node_count: number;
  logic_count: number;
  uptime_seconds: number;
}

export interface BayesApiPredictRequest {
  session: InferenceSession;
  athlete_context?: AthleteContext;
  use_v3_engine: boolean;
}

export interface BayesApiPredictResponse {
  diagnosis: DiagnosisResult;
  next_node?: AssessmentNode;
  is_complete: boolean;
  processing_time_ms: number;
}

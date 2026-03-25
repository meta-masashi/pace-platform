/**
 * PACE Platform — 反事実推論（Counterfactual）エンジン 型定義
 *
 * do-calculus に基づく介入シミュレーション:
 *   P(Y|do(X)) ≠ P(Y|X)
 *
 * 介入（do(X)）時は対象ノードへの全ての入力辺をカットし、
 * 変数を強制的に設定した上で DAG を順伝播する。
 *
 * PRD Phase 3 — Counterfactual Engine
 */

import type { TimeSlice } from "@/lib/dbn/types";

// ---------------------------------------------------------------------------
// 介入タイプ
// ---------------------------------------------------------------------------

/**
 * 介入の種類。
 *
 * - set_intensity: トレーニング強度を指定値に設定
 * - toggle_exercise: 特定エクササイズの ON/OFF
 * - set_rest_day: 完全休養日に設定
 * - modify_load: 負荷をスケーリング（乗算）
 */
export type InterventionType =
  | "set_intensity"
  | "toggle_exercise"
  | "set_rest_day"
  | "modify_load";

// ---------------------------------------------------------------------------
// 介入定義
// ---------------------------------------------------------------------------

/**
 * 単一の介入操作。
 *
 * do-calculus における do(X = x) に相当する。
 * 介入実行時は対象変数への全ての入力辺をカットし、
 * 変数の値を強制的に設定する。
 */
export interface Intervention {
  /** 介入タイプ */
  type: InterventionType;
  /** 介入対象パラメータ名（例: "trainingIntensity", "sprintEnabled"） */
  parameter: string;
  /** 強制設定値 */
  value: number | boolean;
  /** 介入の説明（日本語） */
  description: string;
}

// ---------------------------------------------------------------------------
// 反事実クエリ
// ---------------------------------------------------------------------------

/**
 * 反事実クエリ: 「もし〇〇したら、リスクはどう変わるか？」
 *
 * 例: 「もし本日のスプリントを中止した場合、
 *      土曜日のハムストリングス肉離れリスクはどうなるか？」
 */
export interface CounterfactualQuery {
  /** 対象アスリートID */
  athleteId: string;
  /** 測定対象のリスクノードID（例: "F3_001" = ハムストリングス） */
  targetNodeId: string;
  /** 測定時点の日付（例: 次の試合日）（YYYY-MM-DD） */
  targetDate: string;
  /** 適用する介入リスト */
  interventions: Intervention[];
  /** ベースラインシナリオ（省略時: 'current_plan'） */
  baselineScenario?: "current_plan" | "rest_day" | "full_intensity";
}

// ---------------------------------------------------------------------------
// 反事実結果
// ---------------------------------------------------------------------------

/**
 * 反事実推論の結果。
 *
 * ベースライン（介入なし）と介入シナリオを比較し、
 * リスク変化量・信頼度・日本語説明を提供する。
 */
export interface CounterfactualResult {
  /** 元のクエリ */
  query: CounterfactualQuery;
  /** ベースラインリスク: P(Y) — 介入なしでのリスク */
  baselineRisk: number;
  /** 介入後リスク: P(Y|do(X)) — 介入ありでのリスク */
  interventionRisk: number;
  /** リスク低減量（baselineRisk - interventionRisk） */
  riskReduction: number;
  /** リスク低減率（パーセンテージ） */
  riskReductionPct: number;
  /** 信頼度（データ可用性に基づく 0.0〜1.0） */
  confidenceLevel: number;
  /** 日本語での NLG 説明文 */
  explanation: string;
  /** タイムライン比較（ベースライン vs 介入） */
  comparisonSlices: {
    baseline: TimeSlice[];
    intervention: TimeSlice[];
  };
}

// ---------------------------------------------------------------------------
// プリセット介入シナリオ
// ---------------------------------------------------------------------------

/**
 * プリセット介入シナリオ。
 *
 * UI でワンクリックで選択できる定型介入。
 */
export interface PresetIntervention {
  /** プリセットID */
  id: string;
  /** 表示名（日本語） */
  label: string;
  /** 説明（日本語） */
  description: string;
  /** 介入リスト */
  interventions: Intervention[];
}

// ---------------------------------------------------------------------------
// API レスポンス型
// ---------------------------------------------------------------------------

/**
 * 反事実評価 API のレスポンス型。
 */
export interface CounterfactualEvaluateResponse {
  success: true;
  data: CounterfactualResultSerialized;
}

/**
 * JSON シリアライズ可能な CounterfactualResult。
 */
export interface CounterfactualResultSerialized {
  query: CounterfactualQuery;
  baselineRisk: number;
  interventionRisk: number;
  riskReduction: number;
  riskReductionPct: number;
  confidenceLevel: number;
  explanation: string;
  comparisonSlices: {
    baseline: Array<{ date: string; nodeStates: Record<string, import("@/lib/dbn/types").NodeState>; externalInputs: import("@/lib/dbn/types").ExternalInputs }>;
    intervention: Array<{ date: string; nodeStates: Record<string, import("@/lib/dbn/types").NodeState>; externalInputs: import("@/lib/dbn/types").ExternalInputs }>;
  };
}

/**
 * プリセット介入 API のレスポンス型。
 */
export interface CounterfactualPresetsResponse {
  success: true;
  data: {
    athleteId: string;
    targetDate: string;
    presets: PresetIntervention[];
  };
}

/** 共通エラーレスポンス */
export interface CounterfactualErrorResponse {
  success: false;
  error: string;
}

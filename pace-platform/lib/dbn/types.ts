/**
 * PACE Platform — 動的ベイズネットワーク（DBN）型定義
 *
 * 時間軸推論モジュール: 日単位のリスク遷移をモデル化する。
 * 静的（単一時点）ベイズ推論を時間方向に拡張し、
 * トレーニング負荷・回復・半減期ダイナミクスを考慮した
 * リスク進化モデルを提供する。
 *
 * PRD Phase 3 — Dynamic Bayesian Network
 */

// ---------------------------------------------------------------------------
// タイムスライス
// ---------------------------------------------------------------------------

/**
 * タイムスライス: ある日のノード状態と外部入力を保持する。
 *
 * DBN は日単位でスライスを構成し、前日のスライスから
 * 遷移モデルを用いて翌日のスライスを導出する。
 */
export interface TimeSlice {
  /** 日付（YYYY-MM-DD 形式） */
  date: string;
  /** 各ノードの状態（nodeId → NodeState） */
  nodeStates: Map<string, NodeState>;
  /** 外部入力（トレーニング負荷・生体指標） */
  externalInputs: ExternalInputs;
}

/**
 * 個別ノードの状態。
 *
 * 各ノードは特定のリスク（例: ハムストリングス肉離れ）を表し、
 * そのリスク値は時間経過とともに減衰し、負荷によって増加する。
 */
export interface NodeState {
  /** アセスメントノードID（例: "F3_001"） */
  nodeId: string;
  /** 現在のリスク値（0.0〜1.0） */
  risk: number;
  /** フラグ付き（陽性判定済み）かどうか */
  isActive: boolean;
  /** 時間減衰適用後のリスク値 */
  decayedRisk: number;
  /** 累積トレーニング負荷 */
  cumulativeLoad: number;
}

// ---------------------------------------------------------------------------
// 外部入力
// ---------------------------------------------------------------------------

/**
 * DBN への外部入力。
 *
 * daily_metrics テーブルや手動入力から取得する
 * トレーニング負荷・生体指標データ。
 */
export interface ExternalInputs {
  /** PlayerLoad（GPS デバイス由来の総負荷） */
  playerLoad?: number | undefined;
  /** sRPE（セッション RPE × トレーニング時間） */
  srpe?: number | undefined;
  /** 睡眠スコア（0〜10） */
  sleepScore?: number | undefined;
  /** 心拍変動（HRV） */
  hrv?: number | undefined;
  /** 痛みスケール（NRS: 0〜10） */
  nrs?: number | undefined;
  /** トレーニング強度（0〜100%） */
  trainingIntensity?: number | undefined;
}

// ---------------------------------------------------------------------------
// 遷移モデル
// ---------------------------------------------------------------------------

/**
 * DBN 遷移モデル: t → t+1 の確率伝播パラメータ。
 *
 * 各ノードに対して定義され、翌日のリスク値を
 * 前日のリスク値・負荷・回復から導出する。
 *
 * 数理モデル:
 *   risk(t) = risk(t-1) × e^(-λ × 1) × chronicMod + loadImpactFactor × sRPE / 1000
 */
export interface TransitionModel {
  /** 対象ノードID */
  nodeId: string;
  /**
   * 負荷蓄積係数:
   * 新しい負荷（sRPE）が翌日のリスクをどれだけ増加させるか。
   * 典型値: 0.01〜0.05
   */
  loadImpactFactor: number;
  /**
   * 回復関数の減衰定数 λ（CSV 由来）。
   * λ = ln(2) / halfLifeDays
   */
  recoveryLambda: number;
  /** 半減期（日数）— 便宜上保持 */
  halfLifeDays: number;
  /** 慢性修飾子（chronicModifier: 1.0〜2.0） */
  chronicModifier: number;
}

// ---------------------------------------------------------------------------
// DBN 推論結果
// ---------------------------------------------------------------------------

/**
 * DBN 順伝播の推論結果。
 *
 * 過去の実測データに基づくタイムスライスと、
 * 将来の予測タイムスライスを含む。
 */
export interface DBNResult {
  /** 過去の実測タイムスライス列 */
  timeSlices: TimeSlice[];
  /** 将来予測タイムスライス列 */
  projections: TimeSlice[];
  /** サマリー（全体リスク・試合日リスク・回復見込み等） */
  summary: DBNSummary;
}

/**
 * DBN 推論結果のサマリー。
 */
export interface DBNSummary {
  /** 現在の総合リスク値（最もリスクの高いノードの値） */
  currentOverallRisk: number;
  /** 予測期間最終日のリスク値 */
  projectedRiskAtMatch: number;
  /** リスクが安全レベル（閾値以下）に達するまでの推定日数 */
  daysToSafeLevel: number;
  /** 高リスクのノードIDリスト */
  criticalNodes: string[];
}

// ---------------------------------------------------------------------------
// API レスポンス型
// ---------------------------------------------------------------------------

/**
 * DBN シミュレーション API のレスポンス型。
 */
export interface DBNSimulateResponse {
  success: true;
  data: DBNResultSerialized;
}

/**
 * JSON シリアライズ可能な DBNResult。
 * Map → Record に変換した形式。
 */
export interface DBNResultSerialized {
  timeSlices: TimeSliceSerialized[];
  projections: TimeSliceSerialized[];
  summary: DBNSummary;
}

/**
 * JSON シリアライズ可能な TimeSlice。
 */
export interface TimeSliceSerialized {
  date: string;
  nodeStates: Record<string, NodeState>;
  externalInputs: ExternalInputs;
}

/** 共通エラーレスポンス */
export interface DBNErrorResponse {
  success: false;
  error: string;
}

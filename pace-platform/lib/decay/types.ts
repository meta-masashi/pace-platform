/**
 * PACE Platform — 時間減衰（Time Decay）型定義
 *
 * リスク値の時間減衰モデルで使用する型を定義する。
 * PRD Phase 3 の半減期モデルに基づく:
 *   Risk(t) = Risk(0) × e^(-λt)
 */

// ---------------------------------------------------------------------------
// 減衰可能リスク
// ---------------------------------------------------------------------------

/**
 * 減衰対象のリスクエントリ。
 *
 * assessment_results / assessment_nodes から取得した、
 * 時間減衰の対象となるリスク情報を表す。
 */
export interface DecayableRisk {
  /** アセスメントノードID */
  nodeId: string;
  /** アスリートID */
  athleteId: string;
  /** 検出時のリスク値 Risk(0) */
  initialRisk: number;
  /** リスクが最初に検出された日時 */
  detectedAt: Date;
  /** 時間減衰定数 λ（CSV由来） */
  timeDecayLambda: number;
  /** 半減期（日数）— 便宜上保持: ln(2)/λ */
  halfLifeDays: number;
  /** 繰り返し受傷の修正係数（デフォルト 1.0、> 1.0 で減衰が遅くなる） */
  chronicAlphaModifier: number;
  /** 現在の減衰後リスク値（計算結果） */
  currentRisk?: number;
}

// ---------------------------------------------------------------------------
// バッチ処理結果
// ---------------------------------------------------------------------------

/**
 * 日次バッチ減衰処理の結果サマリー。
 */
export interface DecayBatchResult {
  /** 処理対象の総レコード数 */
  processed: number;
  /** 更新に成功したレコード数 */
  updated: number;
  /** エラーが発生したレコード数 */
  errors: number;
  /** 個別の減衰計算結果詳細 */
  details: DecayedRiskEntry[];
}

/**
 * 個別リスクの減衰計算結果。
 */
export interface DecayedRiskEntry {
  /** アスリートID */
  athleteId: string;
  /** アセスメントノードID */
  nodeId: string;
  /** アセスメントID */
  assessmentId: string;
  /** 減衰前のリスク値 */
  previousRisk: number;
  /** 減衰後の現在リスク値 */
  currentRisk: number;
  /** 検出からの経過日数 */
  daysSinceDetection: number;
  /** 半減期（日数） */
  halfLifeDays: number;
}

// ---------------------------------------------------------------------------
// API レスポンス型
// ---------------------------------------------------------------------------

/**
 * 減衰ステータス API のレスポンス型。
 */
export interface DecayStatusResponse {
  success: true;
  data: {
    athleteId: string;
    activeRisks: DecayStatusEntry[];
    computedAt: string;
  };
}

/**
 * 個別リスクの減衰ステータス。
 */
export interface DecayStatusEntry {
  /** アセスメントノードID */
  nodeId: string;
  /** アセスメントID */
  assessmentId: string;
  /** 検出時のリスク値 */
  initialRisk: number;
  /** 現在の減衰後リスク値 */
  currentRisk: number;
  /** 検出からの経過日数 */
  daysSinceDetection: number;
  /** 半減期（日数） */
  halfLifeDays: number;
  /** 減衰定数 λ */
  lambda: number;
  /** 完全回復（閾値以下）までの推定残日数 */
  estimatedDaysToRecovery: number;
}

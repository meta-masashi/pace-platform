/**
 * PACE Platform — 動的リハビリリルート 型定義
 *
 * 回復偏差検出とリハビリプラン自動調整に使用する型を定義する。
 * 4週間プランの動的再調整（Dynamic Rehab Rerouting）を実現する。
 */

// ---------------------------------------------------------------------------
// リルート検出
// ---------------------------------------------------------------------------

/**
 * 回復偏差の検出結果。
 *
 * 実際の回復ペースが予測から逸脱した場合に生成される。
 */
export interface RerouteDetection {
  /** リハビリプログラムID */
  programId: string;
  /** アスリートID */
  athleteId: string;
  /** 検出日時 */
  detectedAt: Date;
  /** 偏差の理由 */
  reason: RerouteReason;
  /** 深刻度 */
  severity: 'minor' | 'moderate' | 'major';
  /** 推奨調整リスト */
  suggestedAdjustments: RerouteAdjustment[];
}

/**
 * リルート理由の種別。
 */
export type RerouteReason =
  | 'recovery_slower_than_expected'
  | 'recovery_faster_than_expected'
  | 'pain_increase'
  | 'rom_regression'
  | 'subjective_decline';

// ---------------------------------------------------------------------------
// 調整
// ---------------------------------------------------------------------------

/**
 * リハビリプランの個別調整項目。
 */
export interface RerouteAdjustment {
  /** 調整の種類 */
  type:
    | 'intensity_decrease'
    | 'intensity_increase'
    | 'rts_delay'
    | 'rts_advance'
    | 'exercise_swap';
  /** 調整の説明（日本語） */
  description: string;
  /** 調整対象のパラメータ名 */
  parameter?: string;
  /** 調整前の値 */
  oldValue?: number;
  /** 調整後の値 */
  newValue?: number;
  /** RTS への影響日数（正: 遅延、負: 前倒し） */
  daysImpact: number;
}

// ---------------------------------------------------------------------------
// リルート提案
// ---------------------------------------------------------------------------

/**
 * リルート提案。
 *
 * 検出された偏差に基づく調整案をスタッフに提示し、
 * 承認/却下のワークフローを管理する。
 */
export interface RerouteProposal {
  /** 提案ID */
  id: string;
  /** 偏差検出結果 */
  detection: RerouteDetection;
  /** 調整リスト */
  adjustments: RerouteAdjustment[];
  /** 調整後の新しい RTS 予定日 */
  newEstimatedRTS: Date;
  /** NLG テキスト（日本語） */
  nlgText: string;
  /** 提案のステータス */
  status: 'pending' | 'approved' | 'rejected';
}

// ---------------------------------------------------------------------------
// リハビリプログラム型（リルート用簡易型）
// ---------------------------------------------------------------------------

/**
 * リルート処理で参照するリハビリプログラム情報。
 */
export interface RehabProgramForReroute {
  /** プログラムID */
  id: string;
  /** アスリートID */
  athleteId: string;
  /** 現在のフェーズ */
  currentPhase: number;
  /** 開始日 */
  startDate: string;
  /** 現在の RTS 予定日 */
  estimatedRtpDate: string | null;
}

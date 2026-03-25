/**
 * PACE Platform — RTS（Return to Sport）予測マッピング 型定義
 *
 * 時間軸での復帰予測モデルに使用する型を定義する。
 * シグモイド回復モデルに基づく予測カーブとマイルストーンを表現する。
 */

// ---------------------------------------------------------------------------
// RTS 予測
// ---------------------------------------------------------------------------

/**
 * RTS 予測結果。
 *
 * シグモイド回復モデルに基づく復帰予測と、
 * フェーズごとのマイルストーン・リスク要因を含む。
 */
export interface RTSPrediction {
  /** アスリートID */
  athleteId: string;
  /** リハビリプログラムID */
  programId: string;
  /** 現在のフェーズ（1〜4） */
  currentPhase: number;
  /** 予測される RTS 日 */
  estimatedRTSDate: Date;
  /** 予測の信頼度（0〜100%） */
  confidence: number;
  /** フェーズ別マイルストーン */
  milestones: RTSMilestone[];
  /** リスク要因一覧 */
  riskFactors: RTSRiskFactor[];
  /** 日次回復率（%/日） */
  dailyRecoveryRate: number;
}

// ---------------------------------------------------------------------------
// マイルストーン
// ---------------------------------------------------------------------------

/**
 * フェーズ移行マイルストーン。
 *
 * 各フェーズのゲート通過予定とその進捗状態を示す。
 */
export interface RTSMilestone {
  /** フェーズ番号 */
  phase: number;
  /** ゲート名称 */
  gateName: string;
  /** ゲート到達予定日 */
  targetDate: Date;
  /** 現在の進捗（0〜100%） */
  currentProgress: number;
  /** 予定通りか */
  isOnTrack: boolean;
  /** 到達までの残り日数 */
  daysRemaining: number;
}

// ---------------------------------------------------------------------------
// リスク要因
// ---------------------------------------------------------------------------

/**
 * 復帰予測に影響するリスク要因。
 *
 * 時間減衰ステータスや慢性修正係数に基づく影響を表す。
 */
export interface RTSRiskFactor {
  /** アセスメントノードID */
  nodeId: string;
  /** リスクの説明 */
  description: string;
  /** 影響の方向 */
  impact: 'delays' | 'accelerates' | 'neutral';
  /** 推定される影響日数 */
  estimatedDaysImpact: number;
}

// ---------------------------------------------------------------------------
// 回復カーブデータポイント
// ---------------------------------------------------------------------------

/**
 * 回復カーブの1日分のデータポイント。
 *
 * チャート描画用に予測値と実績値を保持する。
 */
export interface RecoveryDataPoint {
  /** 日付文字列（YYYY-MM-DD） */
  date: string;
  /** 予測進捗（0〜100%） */
  predictedProgress: number;
  /** 実績進捗（0〜100%、存在する場合のみ） */
  actualProgress?: number;
  /** 該当フェーズ */
  phase: number;
}

// ---------------------------------------------------------------------------
// 予測入力パラメータ
// ---------------------------------------------------------------------------

/**
 * 日次メトリクスの簡易型（RTS 予測エンジン入力用）。
 */
export interface DailyMetric {
  /** 日付（YYYY-MM-DD） */
  date: string;
  /** NRS 痛みスケール（0〜10） */
  nrs: number;
  /** RPE 自覚的運動強度（0〜10） */
  rpe: number;
  /** 主観的コンディション（0〜10） */
  subjective_condition: number;
  /** 睡眠スコア（0〜10） */
  sleep_score: number;
}

/**
 * ゲート進捗情報。
 */
export interface GateProgress {
  /** フェーズ番号 */
  phase: number;
  /** ゲート基準 JSON */
  criteria: Record<string, unknown>;
  /** ゲート通過日時（null = 未通過） */
  gate_met_at: string | null;
}

/**
 * 減衰ステータス（RTS 予測用の簡易型）。
 */
export interface DecayStatus {
  /** アセスメントノードID */
  nodeId: string;
  /** 現在のリスク値 */
  currentRisk: number;
  /** 回復までの推定残日数 */
  estimatedDaysToRecovery: number;
  /** 繰り返し受傷修正係数 */
  chronicModifier: number;
}

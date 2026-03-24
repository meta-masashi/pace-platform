/**
 * PACE Platform — コンディショニングスコアエンジン 型定義
 *
 * Hybrid Peaking モデルに基づくコンディショニングスコア算出の
 * 入出力型定義。EWMA（指数加重移動平均）ベースのフィットネス/疲労モデル。
 */

// ---------------------------------------------------------------------------
// EWMA 設定
// ---------------------------------------------------------------------------

/**
 * EWMA（指数加重移動平均）の設定パラメータ
 */
export interface EWMAConfig {
  /** EWMA のスパン（日数）。大きいほど平滑化される */
  span: number;
  /** 平滑化係数 α = 2 / (span + 1) */
  smoothingFactor: number;
}

// ---------------------------------------------------------------------------
// コンディショニングスコア入力
// ---------------------------------------------------------------------------

/**
 * 当日のコンディショニングスコア算出に必要な入力データ
 */
export interface ConditioningInput {
  /** セッション RPE（RPE × トレーニング時間）*/
  srpe: number;
  /** 睡眠スコア（0-10）*/
  sleepScore: number;
  /** 主観的疲労度（0-10）*/
  fatigueSubjective: number;
  /** HRV 値（Pro Mode 有効時のみ）*/
  hrv?: number;
  /** HRV ベースライン（Pro Mode 有効時のみ）*/
  hrvBaseline?: number;
}

// ---------------------------------------------------------------------------
// ペナルティ詳細
// ---------------------------------------------------------------------------

/**
 * コンディショニングスコアに適用されたペナルティの内訳
 */
export interface ConditioningPenalties {
  /** 睡眠スコア低下によるペナルティ（加算値）*/
  sleepPenalty: number;
  /** 主観的疲労によるペナルティ（加算値）*/
  fatiguePenalty: number;
  /** HRV 低下によるペナルティ係数（乗算値、Pro Mode 時のみ）*/
  hrvPenaltyCoefficient: number | null;
}

// ---------------------------------------------------------------------------
// コンディショニングスコア結果
// ---------------------------------------------------------------------------

/**
 * コンディショニングスコア算出結果
 */
export interface ConditioningResult {
  /** コンディショニングスコア（0-100）*/
  conditioningScore: number;
  /** フィットネス EWMA（42日間）*/
  fitnessEwma: number;
  /** 疲労 EWMA（7日間）*/
  fatigueEwma: number;
  /** Acute:Chronic Workload Ratio（7日 / 28日）*/
  acwr: number;
  /** Pro Mode（HRV ベース補正）が有効かどうか */
  isProMode: boolean;
  /** 適用されたペナルティの内訳 */
  penalties: ConditioningPenalties;
}

// ---------------------------------------------------------------------------
// daily_metrics 行型（エンジン入力用）
// ---------------------------------------------------------------------------

/**
 * daily_metrics テーブルの行型（コンディショニングスコアエンジンが必要とするカラムのみ）
 */
export interface DailyMetricRow {
  date: string;
  srpe: number | null;
  sleepScore: number | null;
  fatigueSubjective: number | null;
  hrv: number | null;
  hrvBaseline: number | null;
}

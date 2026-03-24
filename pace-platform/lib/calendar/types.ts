/**
 * PACE Platform — Google Calendar 連携 型定義
 *
 * カレンダーイベントの分類・負荷予測・接続状態に関する
 * 共通型を定義する。
 */

// ---------------------------------------------------------------------------
// イベント種別
// ---------------------------------------------------------------------------

/** カレンダーイベントの種別分類 */
export type EventType = 'match' | 'high_intensity' | 'recovery' | 'other';

// ---------------------------------------------------------------------------
// カレンダーイベント
// ---------------------------------------------------------------------------

/** Google Calendar API から取得した生イベント */
export interface CalendarEvent {
  /** Google Calendar イベント ID */
  id: string;
  /** イベント名（summary） */
  summary: string;
  /** イベントの説明 */
  description: string | null;
  /** イベント開始日時（ISO 8601） */
  startDateTime: string;
  /** イベント終了日時（ISO 8601） */
  endDateTime: string;
  /** イベントの場所 */
  location: string | null;
}

/** 種別分類済みカレンダーイベント */
export interface ClassifiedEvent extends CalendarEvent {
  /** 分類されたイベント種別 */
  eventType: EventType;
}

// ---------------------------------------------------------------------------
// 負荷予測
// ---------------------------------------------------------------------------

/** 日別の負荷予測結果 */
export interface LoadPrediction {
  /** 予測対象日（YYYY-MM-DD） */
  date: string;
  /** イベント種別 */
  eventType: EventType;
  /** イベント名 */
  eventName: string;
  /** 予測されるプレー可能率（0-100） */
  predictedAvailability: number;
  /** 予測されるチームコンディションスコア（0-100） */
  predictedTeamScore: number;
}

// ---------------------------------------------------------------------------
// チームメトリクス（予測入力用）
// ---------------------------------------------------------------------------

/** 現在のチームメトリクス（負荷予測の入力として使用） */
export interface TeamMetrics {
  /** 現在のプレー可能率（0-100） */
  currentAvailability: number;
  /** 現在のチームコンディションスコア（0-100） */
  currentTeamScore: number;
  /** チーム平均 ACWR */
  averageAcwr: number;
}

// ---------------------------------------------------------------------------
// カレンダー接続状態
// ---------------------------------------------------------------------------

/** カレンダー接続のステータス */
export type CalendarSyncStatus = 'connected' | 'disconnected' | 'expired' | 'error';

/** カレンダー接続情報（クライアント向け、トークンを含まない） */
export interface CalendarConnectionInfo {
  /** 接続ステータス */
  status: CalendarSyncStatus;
  /** プロバイダー名 */
  provider: 'google';
  /** 接続先カレンダー ID */
  calendarId: string;
  /** 最終同期日時（ISO 8601） */
  lastSyncedAt: string | null;
}

// ---------------------------------------------------------------------------
// API レスポンス
// ---------------------------------------------------------------------------

/** カレンダーイベント取得 API のレスポンス */
export interface CalendarEventsResponse {
  success: true;
  data: {
    events: ClassifiedEvent[];
    predictions: LoadPrediction[];
    syncStatus: CalendarSyncStatus;
  };
}

/** カレンダー API のエラーレスポンス */
export interface CalendarErrorResponse {
  success: false;
  error: string;
}

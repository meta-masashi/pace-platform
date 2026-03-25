/**
 * PACE Platform — 通知システム型定義
 *
 * 朝の通知システム（6:30 AM JST）で使用する型定義。
 * Email、Slack、Web Push の各チャネルに対応する。
 */

// ---------------------------------------------------------------------------
// 通知チャネル
// ---------------------------------------------------------------------------

/** サポートされる通知チャネル */
export type NotificationChannel = "email" | "slack" | "web_push";

// ---------------------------------------------------------------------------
// 朝のアジェンダ通知
// ---------------------------------------------------------------------------

/** 朝の通知ペイロード */
export interface MorningNotification {
  /** チーム ID */
  teamId: string;
  /** チーム名 */
  teamName: string;
  /** 対象日（YYYY-MM-DD） */
  date: string;
  /** アラート件数 */
  alertCount: number;
  /** クリティカルアラート件数 */
  criticalCount: number;
  /** アジェンダ URL（ダッシュボード） */
  agendaUrl: string;
  /** メール受信者アドレス（email チャネル用） */
  recipientEmail?: string;
  /** Slack Webhook URL（slack チャネル用） */
  slackWebhookUrl?: string;
}

// ---------------------------------------------------------------------------
// 通知結果
// ---------------------------------------------------------------------------

/** 各チャネルの送信結果 */
export interface NotificationResult {
  /** 使用したチャネル */
  channel: NotificationChannel;
  /** 送信成功フラグ */
  success: boolean;
  /** エラーメッセージ（失敗時） */
  error?: string;
  /** 送信日時（ISO 8601） */
  sentAt: string;
}

// ---------------------------------------------------------------------------
// 通知プリファレンス（DB レコード対応）
// ---------------------------------------------------------------------------

/** notification_preferences テーブルの行型 */
export interface NotificationPreference {
  id: string;
  staff_id: string;
  org_id: string;
  channel: NotificationChannel;
  enabled: boolean;
  config: NotificationChannelConfig;
  created_at: string;
  updated_at: string;
}

/** チャネル別設定（config JSONB） */
export type NotificationChannelConfig =
  | EmailChannelConfig
  | SlackChannelConfig
  | WebPushChannelConfig;

export interface EmailChannelConfig {
  /** 送信先メールアドレス（デフォルトはスタッフのメール） */
  email?: string;
}

export interface SlackChannelConfig {
  /** Incoming Webhook URL */
  webhookUrl?: string;
}

export interface WebPushChannelConfig {
  /** Web Push サブスクリプション（JSON シリアライズ） */
  subscription?: PushSubscriptionJSON;
}

/** Web Push サブスクリプション（ブラウザ API 互換） */
export interface PushSubscriptionJSON {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

// ---------------------------------------------------------------------------
// メール送信パラメータ
// ---------------------------------------------------------------------------

export interface MorningEmailParams {
  to: string;
  teamName: string;
  date: string;
  alertCount: number;
  criticalCount: number;
  agendaUrl: string;
}

// ---------------------------------------------------------------------------
// Slack 送信パラメータ
// ---------------------------------------------------------------------------

export interface SlackNotificationParams {
  webhookUrl: string;
  teamName: string;
  date: string;
  alertCount: number;
  criticalCount: number;
  agendaUrl: string;
}

// ---------------------------------------------------------------------------
// Web Push 送信パラメータ
// ---------------------------------------------------------------------------

export interface WebPushParams {
  subscription: PushSubscriptionJSON;
  title: string;
  body: string;
  url: string;
}

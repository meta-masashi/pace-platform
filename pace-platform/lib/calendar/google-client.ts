/**
 * PACE Platform — Google Calendar API クライアント
 *
 * googleapis パッケージを使用して Google Calendar と連携する。
 * OAuth2 認証フロー、イベント取得、イベント分類を提供する。
 */

import { google } from 'googleapis';
import type { calendar_v3 } from 'googleapis';
import type { CalendarEvent, ClassifiedEvent, EventType } from './types';

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** イベント分類に使用するキーワードマッピング */
const EVENT_TYPE_KEYWORDS: ReadonlyArray<{ type: EventType; keywords: readonly string[] }> = [
  {
    type: 'match',
    keywords: ['試合', 'マッチ', '紅白戦', 'match', 'game', '公式戦', '練習試合', 'カップ戦'],
  },
  {
    type: 'high_intensity',
    keywords: [
      '高強度',
      'フィジカル',
      'high intensity',
      'HIIT',
      'インターバル',
      'スプリント',
      'パワー',
      'ストレングス',
    ],
  },
  {
    type: 'recovery',
    keywords: [
      '回復',
      'リカバリー',
      'recovery',
      'オフ',
      '休養',
      'アクティブレスト',
      'ストレッチ',
      'クールダウン',
    ],
  },
] as const;

// ---------------------------------------------------------------------------
// OAuth2 クライアント生成
// ---------------------------------------------------------------------------

/**
 * Google OAuth2 クライアントを生成する。
 *
 * 環境変数から認証情報を読み取り、OAuth2Client インスタンスを返す。
 *
 * @throws 必須環境変数が未設定の場合
 */
export function createOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'Google OAuth2 の環境変数が不足しています。GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI を設定してください。',
    );
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

// ---------------------------------------------------------------------------
// OAuth2 認証 URL 生成
// ---------------------------------------------------------------------------

/**
 * Google OAuth 同意画面の URL を生成する。
 *
 * @param state CSRF 防止用のステートパラメータ
 * @returns Google OAuth 同意画面 URL
 */
export function getAuthUrl(state: string): string {
  const oauth2Client = createOAuth2Client();
  const scopes = process.env.GOOGLE_CALENDAR_SCOPES ?? 'https://www.googleapis.com/auth/calendar.readonly';

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes.split(',').map((s) => s.trim()),
    state,
    prompt: 'consent',
  });
}

// ---------------------------------------------------------------------------
// 認可コード → トークン交換
// ---------------------------------------------------------------------------

/**
 * OAuth 認可コードをアクセストークン・リフレッシュトークンに交換する。
 *
 * @param code Google が返した認可コード
 * @returns アクセストークン、リフレッシュトークン、有効期限
 */
export async function getTokensFromCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiryDate: number | null;
}> {
  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.access_token) {
    throw new Error('Google OAuth トークンの取得に失敗しました。アクセストークンが空です。');
  }

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    expiryDate: tokens.expiry_date ?? null,
  };
}

// ---------------------------------------------------------------------------
// トークンリフレッシュ
// ---------------------------------------------------------------------------

/**
 * リフレッシュトークンを使用してアクセストークンを更新する。
 *
 * @param refreshToken リフレッシュトークン
 * @returns 新しいアクセストークンと有効期限
 */
export async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  expiryDate: number | null;
}> {
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const { credentials } = await oauth2Client.refreshAccessToken();

  if (!credentials.access_token) {
    throw new Error('アクセストークンの更新に失敗しました。再認証が必要です。');
  }

  return {
    accessToken: credentials.access_token,
    expiryDate: credentials.expiry_date ?? null,
  };
}

// ---------------------------------------------------------------------------
// カレンダーイベント取得
// ---------------------------------------------------------------------------

/**
 * Google Calendar からイベントを取得する。
 *
 * @param accessToken 有効なアクセストークン
 * @param calendarId カレンダー ID（デフォルト: 'primary'）
 * @param timeMin 取得範囲の開始日時
 * @param timeMax 取得範囲の終了日時
 * @returns カレンダーイベントの配列
 */
export async function listEvents(
  accessToken: string,
  calendarId: string,
  timeMin: Date,
  timeMax: Date,
): Promise<CalendarEvent[]> {
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  const response = await calendar.events.list({
    calendarId,
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 250,
  });

  const items = response.data.items ?? [];
  return items.map(mapGoogleEventToCalendarEvent).filter((e): e is CalendarEvent => e !== null);
}

/**
 * Google Calendar API のイベントオブジェクトを内部型に変換する。
 */
function mapGoogleEventToCalendarEvent(
  event: calendar_v3.Schema$Event,
): CalendarEvent | null {
  const startDateTime = event.start?.dateTime ?? event.start?.date;
  const endDateTime = event.end?.dateTime ?? event.end?.date;

  if (!event.id || !event.summary || !startDateTime || !endDateTime) {
    return null;
  }

  return {
    id: event.id,
    summary: event.summary,
    description: event.description ?? null,
    startDateTime,
    endDateTime,
    location: event.location ?? null,
  };
}

// ---------------------------------------------------------------------------
// イベント分類
// ---------------------------------------------------------------------------

/**
 * カレンダーイベントをキーワードベースで種別分類する。
 *
 * イベントの summary と description を検査し、マッチしたキーワードに基づいて
 * 'match' | 'high_intensity' | 'recovery' | 'other' のいずれかを割り当てる。
 *
 * 優先順位: match > high_intensity > recovery > other
 *
 * @param event 分類対象のカレンダーイベント
 * @returns 分類済みイベント
 */
export function classifyEvent(event: CalendarEvent): ClassifiedEvent {
  const searchText = `${event.summary} ${event.description ?? ''}`.toLowerCase();

  let eventType: EventType = 'other';

  for (const { type, keywords } of EVENT_TYPE_KEYWORDS) {
    const matched = keywords.some((keyword) => searchText.includes(keyword.toLowerCase()));
    if (matched) {
      eventType = type;
      break;
    }
  }

  return {
    ...event,
    eventType,
  };
}

/**
 * 複数のカレンダーイベントを一括で分類する。
 *
 * @param events 分類対象のカレンダーイベント配列
 * @returns 分類済みイベントの配列
 */
export function classifyEvents(events: CalendarEvent[]): ClassifiedEvent[] {
  return events.map(classifyEvent);
}

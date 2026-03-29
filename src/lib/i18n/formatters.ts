/**
 * PACE Platform — 日時・通貨・数値・日本特有フォーマッター
 *
 * タイムゾーン安全プロトコル（絶対ルール）:
 *   - DB への時刻保存は全て UTC（TIMESTAMPTZ）
 *   - 表示時のみ userTimezone（デフォルト Asia/Tokyo）へ変換
 *   - date.toLocaleString() はブラウザ設定に依存するため使用禁止
 *
 * 使用例:
 *   formatCurrency(1980)
 *   // → '¥1,980'
 *
 *   formatDateTime('2024-03-20T10:00:00Z')
 *   // → '2024年3月20日 19:00'（UTC→JST 変換済み）
 *
 *   formatPostalCode('1234567')
 *   // → '123-4567'
 */

import type { Locale } from '@/i18n/config'

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export type DateFormatMode = 'date' | 'datetime' | 'time'
export type Currency = 'JPY' | 'USD' | 'EUR'

// ---------------------------------------------------------------------------
// 通貨フォーマッター
// ---------------------------------------------------------------------------

/**
 * 金額を通貨フォーマットで表示する。
 *
 * 価格は最小単位（円・セント）の整数で保存し、表示時のみ本関数でフォーマットする。
 * 複数通貨対応: JPY は小数点なし、USD/EUR は小数点2桁。
 *
 * @param amount    金額（整数推奨）
 * @param currency  通貨コード（デフォルト: 'JPY'）
 * @param locale    ロケール（デフォルト: 'ja-JP'）
 *
 * @example
 *   formatCurrency(1980)           // → '¥1,980'
 *   formatCurrency(29.99, 'USD')   // → '$29.99'
 */
export function formatCurrency(
  amount: number,
  currency: Currency = 'JPY',
  locale = 'ja-JP'
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: currency === 'JPY' ? 0 : 2,
    maximumFractionDigits: currency === 'JPY' ? 0 : 2,
  }).format(amount)
}

// ---------------------------------------------------------------------------
// 日時フォーマッター（UTC → userTimezone 変換）
// ---------------------------------------------------------------------------

/**
 * UTC の日時文字列をユーザーのタイムゾーンへ変換して表示する。
 *
 * 【重要】DB に保存された TIMESTAMPTZ（UTC）を受け取り、表示時のみ変換する。
 * toLocaleString() はブラウザ設定に依存するため使用禁止。
 *
 * @param utcDateString  UTC の ISO 8601 文字列（例: '2024-03-20T10:00:00Z'）
 * @param mode           表示モード: 'date' | 'datetime' | 'time'（デフォルト: 'datetime'）
 * @param userTimezone   ユーザーのタイムゾーン（デフォルト: 'Asia/Tokyo'）
 * @param locale         ロケール（デフォルト: 'ja-JP'）
 *
 * @example
 *   formatDateTime('2024-03-20T10:00:00Z')
 *   // → '2024年3月20日 19:00'（UTC→JST 変換）
 *
 *   formatDateTime('2024-03-20T10:00:00Z', 'date')
 *   // → '2024年3月20日'
 *
 *   formatDateTime('2024-03-20T10:00:00Z', 'time')
 *   // → '19:00'
 */
export function formatDateTime(
  utcDateString: string,
  mode: DateFormatMode = 'datetime',
  userTimezone = 'Asia/Tokyo',
  locale = 'ja-JP'
): string {
  const date = new Date(utcDateString)

  if (isNaN(date.getTime())) {
    console.warn(`[i18n:formatters] 不正な日時文字列: ${utcDateString}`)
    return '---'
  }

  const options: Intl.DateTimeFormatOptions = {
    timeZone: userTimezone,
    ...(mode !== 'time'
      ? { year: 'numeric', month: 'long', day: 'numeric' }
      : {}),
    ...(mode !== 'date'
      ? { hour: '2-digit', minute: '2-digit' }
      : {}),
  }

  return new Intl.DateTimeFormat(locale, options).format(date)
}

/**
 * UTC の日時文字列を短い日付表示（月/日）で返す。
 *
 * src/lib/utils.ts の formatDate() の タイムゾーン安全版。
 *
 * @param utcDateString  UTC の ISO 8601 文字列
 * @param userTimezone   ユーザーのタイムゾーン（デフォルト: 'Asia/Tokyo'）
 * @param locale         ロケール（デフォルト: 'ja-JP'）
 *
 * @example
 *   formatDateShort('2024-03-20T10:00:00Z')  // → '3月20日'
 */
export function formatDateShort(
  utcDateString: string,
  userTimezone = 'Asia/Tokyo',
  locale = 'ja-JP'
): string {
  const date = new Date(utcDateString)

  if (isNaN(date.getTime())) {
    console.warn(`[i18n:formatters] 不正な日時文字列: ${utcDateString}`)
    return '---'
  }

  return new Intl.DateTimeFormat(locale, {
    timeZone: userTimezone,
    month: 'short',
    day: 'numeric',
  }).format(date)
}

/**
 * 相対時間を表示する（例: 「3分前」「2時間前」「昨日」）。
 *
 * @param utcDateString  UTC の ISO 8601 文字列
 * @param locale         ロケール（デフォルト: 'ja-JP'）
 *
 * @example
 *   formatRelativeTime('2024-03-20T18:55:00Z')  // → '5分前'
 */
export function formatRelativeTime(
  utcDateString: string,
  locale = 'ja-JP'
): string {
  const date = new Date(utcDateString)
  const now = new Date()

  if (isNaN(date.getTime())) {
    console.warn(`[i18n:formatters] 不正な日時文字列: ${utcDateString}`)
    return '---'
  }

  const diffMs = now.getTime() - date.getTime()
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)
  const diffWeeks = Math.floor(diffDays / 7)
  const diffMonths = Math.floor(diffDays / 30)
  const diffYears = Math.floor(diffDays / 365)

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })

  if (Math.abs(diffSeconds) < 60) return rtf.format(-diffSeconds, 'second')
  if (Math.abs(diffMinutes) < 60) return rtf.format(-diffMinutes, 'minute')
  if (Math.abs(diffHours) < 24) return rtf.format(-diffHours, 'hour')
  if (Math.abs(diffDays) < 7) return rtf.format(-diffDays, 'day')
  if (Math.abs(diffWeeks) < 5) return rtf.format(-diffWeeks, 'week')
  if (Math.abs(diffMonths) < 12) return rtf.format(-diffMonths, 'month')
  return rtf.format(-diffYears, 'year')
}

// ---------------------------------------------------------------------------
// 数値フォーマッター
// ---------------------------------------------------------------------------

/**
 * 数値を整数フォーマットで表示する（3桁カンマ区切り）。
 *
 * @param value   数値
 * @param locale  ロケール（デフォルト: 'ja-JP'）
 *
 * @example
 *   formatNumber(1234567)  // → '1,234,567'
 */
export function formatNumber(value: number, locale = 'ja-JP'): string {
  return new Intl.NumberFormat(locale).format(value)
}

/**
 * パーセント値を表示する。
 *
 * @param value   0〜1 の小数値（例: 0.75 → 75%）
 * @param digits  小数点以下の桁数（デフォルト: 0）
 * @param locale  ロケール（デフォルト: 'ja-JP'）
 */
export function formatPercent(
  value: number,
  digits = 0,
  locale = 'ja-JP'
): string {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

// ---------------------------------------------------------------------------
// 日本特有フォーマット
// ---------------------------------------------------------------------------

/**
 * 郵便番号を「NNN-NNNN」形式に正規化する。
 *
 * 入力は数字のみ・ハイフンあり両方を受け付ける。
 * 7桁未満の場合はそのまま返す。
 *
 * @example
 *   formatPostalCode('1234567')    // → '123-4567'
 *   formatPostalCode('123-4567')   // → '123-4567'
 *   formatPostalCode('123')        // → '123'（桁数不足）
 */
export function formatPostalCode(value: string): string {
  const digits = value.replace(/[^0-9]/g, '').slice(0, 7)
  if (digits.length >= 4) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`
  }
  return digits
}

/**
 * 電話番号をハイフン区切りに正規化する。
 *
 * - 携帯（11桁・0XX-XXXX-XXXX）
 * - 一般加入（10桁・0X-XXXX-XXXX）
 * - フリーダイヤル（0120/0800）
 *
 * 判別できない場合は入力をそのまま返す。
 *
 * @example
 *   formatPhoneNumber('09012345678')  // → '090-1234-5678'
 *   formatPhoneNumber('0312345678')   // → '03-1234-5678'
 *   formatPhoneNumber('0120123456')   // → '0120-123-456'
 */
export function formatPhoneNumber(value: string): string {
  const digits = value.replace(/[^0-9]/g, '')

  // 携帯電話・IP電話（11桁、先頭3桁が 070/080/090/050）
  if (digits.length === 11 && /^(070|080|090|050)/.test(digits)) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
  }

  // フリーダイヤル（0120 または 0800）
  if (digits.length === 10 && /^(0120|0800)/.test(digits)) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`
  }

  // 一般加入電話（10桁、先頭 0X-XXXX-XXXX）
  if (digits.length === 10 && digits.startsWith('0')) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`
  }

  return value
}

/**
 * 身体計測値を単位付きでフォーマットする。
 *
 * @param value   数値
 * @param unit    単位（例: 'cm', 'kg'）
 * @param locale  ロケール
 *
 * @example
 *   formatMeasurement(175.5, 'cm')  // → '175.5 cm'
 *   formatMeasurement(68, 'kg')     // → '68 kg'
 */
export function formatMeasurement(
  value: number,
  unit: string,
  locale = 'ja-JP'
): string {
  const formatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
  }).format(value)
  return `${formatted} ${unit}`
}

// ---------------------------------------------------------------------------
// 翻訳ヘルパー（軽量なキー補間）
// ---------------------------------------------------------------------------

type Messages = Record<string, unknown>

/**
 * 翻訳メッセージを読み込む（サーバーサイド・Node.js 環境用）。
 *
 * Next.js App Router では next-intl の useTranslations() を優先すること。
 * このヘルパーはライブラリ層やテスト環境での使用を想定している。
 *
 * @param locale  ロケール（'ja' | 'en'）
 */
export async function loadMessages(locale: Locale): Promise<Messages> {
  const mod = await import(`../../messages/${locale}.json`) as { default: Messages }
  return mod.default
}

/**
 * ネストされた翻訳キー（ドット区切り）で文字列を取得する。
 *
 * @param messages  翻訳メッセージオブジェクト
 * @param key       ドット区切りキー（例: 'common.loading'）
 * @param params    プレースホルダー置換用パラメータ（例: { plan: 'Pro' }）
 *
 * @example
 *   t(messages, 'subscription.currentPlan', { plan: 'Pro' })
 *   // → '現在のプラン: Pro'
 */
export function t(
  messages: Messages,
  key: string,
  params?: Record<string, string | number>
): string {
  const parts = key.split('.')
  let current: unknown = messages

  for (const part of parts) {
    if (current === null || typeof current !== 'object') {
      console.warn(`[i18n:formatters] 翻訳キーが見つかりません: ${key}`)
      return key
    }
    current = (current as Record<string, unknown>)[part]
  }

  if (typeof current !== 'string') {
    console.warn(`[i18n:formatters] 翻訳キーが文字列ではありません: ${key}`)
    return key
  }

  if (!params) return current

  // {placeholder} 形式のプレースホルダーを置換
  return current.replace(
    /\{(\w+)\}/g,
    (match, placeholder: string) => {
      const val = params[placeholder]
      return val !== undefined ? String(val) : match
    }
  )
}

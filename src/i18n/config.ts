/**
 * PACE Platform — i18n 設定
 *
 * サポートロケール: ja（日本語・デフォルト）/ en（英語）
 * タイムゾーン: DB は常に UTC 保存、表示時のみ userTimezone（デフォルト Asia/Tokyo）へ変換
 */

export const locales = ['ja', 'en'] as const
export type Locale = typeof locales[number]
export const defaultLocale: Locale = 'ja'
export const defaultTimezone = 'Asia/Tokyo'

/** ロケールが有効かどうかを型安全にチェックする */
export function isValidLocale(value: unknown): value is Locale {
  return locales.includes(value as Locale)
}

/** ロケール表示名マッピング */
export const localeLabels: Record<Locale, string> = {
  ja: '日本語',
  en: 'English',
}

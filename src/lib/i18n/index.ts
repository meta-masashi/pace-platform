/**
 * PACE Platform — i18n モジュール エントリポイント
 *
 * 利用パターン:
 *
 * 1. 翻訳テキストの取得（サーバーサイド・Node.js 環境）
 *    ```typescript
 *    import { loadMessages, t } from '@/lib/i18n'
 *    const messages = await loadMessages('ja')
 *    t(messages, 'common.loading')  // → '読み込み中...'
 *    t(messages, 'subscription.currentPlan', { plan: 'Pro' })
 *    // → '現在のプラン: Pro'
 *    ```
 *
 * 2. 日時フォーマット（UTC→JST 変換）
 *    ```typescript
 *    import { formatDateTime } from '@/lib/i18n'
 *    formatDateTime('2024-03-20T10:00:00Z')
 *    // → '2024年3月20日 19:00'
 *    ```
 *
 * 3. 通貨フォーマット
 *    ```typescript
 *    import { formatCurrency } from '@/lib/i18n'
 *    formatCurrency(1980)  // → '¥1,980'
 *    ```
 *
 * 4. ロケール判定（Next.js Middleware 等）
 *    ```typescript
 *    import { detectLocale } from '@/lib/i18n'
 *    const locale = detectLocale({
 *      pathname: request.nextUrl.pathname,
 *      cookieHeader: request.headers.get('cookie') ?? undefined,
 *      acceptLanguageHeader: request.headers.get('accept-language') ?? undefined,
 *    })
 *    ```
 *
 * 5. 日本特有フォーマット
 *    ```typescript
 *    import { formatPostalCode, formatPhoneNumber } from '@/lib/i18n'
 *    formatPostalCode('1234567')     // → '123-4567'
 *    formatPhoneNumber('09012345678') // → '090-1234-5678'
 *    ```
 */

export { locales, defaultLocale, defaultTimezone, isValidLocale, localeLabels } from '@/i18n/config'
export type { Locale } from '@/i18n/config'

export {
  formatCurrency,
  formatDateTime,
  formatDateShort,
  formatRelativeTime,
  formatNumber,
  formatPercent,
  formatPostalCode,
  formatPhoneNumber,
  formatMeasurement,
  loadMessages,
  t,
} from './formatters'
export type { DateFormatMode, Currency } from './formatters'

export {
  detectLocale,
  matchLocale,
  parseAcceptLanguage,
  buildLocalizedPath,
  stripLocalePrefix,
} from './locale-detector'

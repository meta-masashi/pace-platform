/**
 * PACE Platform — ロケール判定ロジック
 *
 * ロケール優先度（高→低）:
 *   1. URL パスのロケールプレフィックス（/ja/... または /en/...）
 *   2. Cookie（PACE_LOCALE）
 *   3. Accept-Language ヘッダー
 *   4. デフォルトロケール（ja）
 *
 * Next.js Middleware での使用例:
 *   import { detectLocaleFromRequest } from '@/lib/i18n/locale-detector'
 *
 *   export function middleware(request: NextRequest) {
 *     const locale = detectLocaleFromRequest(request)
 *     ...
 *   }
 */

import { locales, defaultLocale, isValidLocale } from './config'
import type { Locale } from './config'

// ---------------------------------------------------------------------------
// Accept-Language パーサー（軽量実装）
// ---------------------------------------------------------------------------

interface LanguageQuality {
  language: string
  quality: number
}

/**
 * Accept-Language ヘッダーをパースして優先度順の言語リストを返す。
 *
 * @example
 *   parseAcceptLanguage('ja,en-US;q=0.9,en;q=0.8')
 *   // → [{ language: 'ja', quality: 1.0 }, { language: 'en-US', quality: 0.9 }, ...]
 */
export function parseAcceptLanguage(header: string): LanguageQuality[] {
  return header
    .split(',')
    .map((entry) => {
      const [lang, qPart] = entry.trim().split(';q=')
      const language = (lang ?? '').trim()
      const quality = qPart !== undefined ? parseFloat(qPart) : 1.0
      return { language, quality: isNaN(quality) ? 1.0 : quality }
    })
    .sort((a, b) => b.quality - a.quality)
}

/**
 * Accept-Language ヘッダーからサポート済みロケールへのマッチングを行う。
 *
 * 完全一致（'ja' → 'ja'）→ 言語コード前方一致（'ja-JP' → 'ja'）の順で試みる。
 *
 * @param acceptLanguageHeader  Accept-Language ヘッダー値
 * @returns マッチしたロケール、またはデフォルトロケール
 */
export function matchLocale(acceptLanguageHeader: string): Locale {
  const parsed = parseAcceptLanguage(acceptLanguageHeader)

  for (const { language } of parsed) {
    // 完全一致
    if (isValidLocale(language)) return language

    // 言語コードの前方一致（例: 'ja-JP' → 'ja'）
    const baseLang = language.split('-')[0] ?? ''
    if (isValidLocale(baseLang)) return baseLang
  }

  return defaultLocale
}

// ---------------------------------------------------------------------------
// ロケール判定（HTTPリクエスト情報ベース）
// ---------------------------------------------------------------------------

/**
 * HTTP リクエスト情報からロケールを判定する。
 *
 * Next.js / Edge Runtime の `Request` オブジェクトと互換。
 * Node.js 環境では `IncomingMessage` からヘッダーを抽出して渡すこと。
 *
 * @param options  判定に使用するリクエスト情報
 * @returns 判定されたロケール
 */
export function detectLocale(options: {
  /** URL パス（例: '/ja/dashboard'）*/
  pathname?: string
  /** Cookie 文字列（例: 'PACE_LOCALE=en; other=value'）*/
  cookieHeader?: string
  /** Accept-Language ヘッダー値 */
  acceptLanguageHeader?: string
}): Locale {
  const { pathname, cookieHeader, acceptLanguageHeader } = options

  // 優先度1: URL パスのロケールプレフィックス
  if (pathname) {
    const pathLocale = locales.find(
      (locale) =>
        pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
    )
    if (pathLocale) return pathLocale
  }

  // 優先度2: Cookie（PACE_LOCALE）
  if (cookieHeader) {
    const cookieLocale = parseCookieLocale(cookieHeader)
    if (cookieLocale) return cookieLocale
  }

  // 優先度3: Accept-Language ヘッダー
  if (acceptLanguageHeader) {
    return matchLocale(acceptLanguageHeader)
  }

  return defaultLocale
}

/**
 * Cookie 文字列から PACE_LOCALE の値を取得する。
 */
function parseCookieLocale(cookieHeader: string): Locale | null {
  const entries = cookieHeader.split(';').map((e) => e.trim())
  for (const entry of entries) {
    const [name, value] = entry.split('=')
    if (name?.trim() === 'PACE_LOCALE' && value) {
      const locale = decodeURIComponent(value.trim())
      if (isValidLocale(locale)) return locale
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// ロケール付き URL ビルダー
// ---------------------------------------------------------------------------

/**
 * パスにロケールプレフィックスを付与する。
 *
 * @example
 *   buildLocalizedPath('/dashboard', 'en')  // → '/en/dashboard'
 *   buildLocalizedPath('/ja/dashboard', 'en')  // → '/en/dashboard'（既存プレフィックスを置換）
 */
export function buildLocalizedPath(pathname: string, locale: Locale): string {
  // 既存のロケールプレフィックスを除去
  const stripped = stripLocalePrefix(pathname)
  return `/${locale}${stripped.startsWith('/') ? stripped : `/${stripped}`}`
}

/**
 * パスからロケールプレフィックスを除去する。
 *
 * @example
 *   stripLocalePrefix('/ja/dashboard')  // → '/dashboard'
 *   stripLocalePrefix('/dashboard')     // → '/dashboard'
 */
export function stripLocalePrefix(pathname: string): string {
  for (const locale of locales) {
    if (pathname.startsWith(`/${locale}/`)) {
      return pathname.slice(locale.length + 1)
    }
    if (pathname === `/${locale}`) {
      return '/'
    }
  }
  return pathname
}

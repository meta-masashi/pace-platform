/**
 * tests/unit/i18n-locale-detector.test.ts
 * ============================================================
 * ロケール判定ロジック単体テスト
 *
 * 対象: lib/i18n/locale-detector.ts
 *   - parseAcceptLanguage()
 *   - matchLocale()
 *   - detectLocale()
 *   - buildLocalizedPath()
 *   - stripLocalePrefix()
 * ============================================================
 */

import { describe, it, expect } from 'vitest'
import {
  parseAcceptLanguage,
  matchLocale,
  detectLocale,
  buildLocalizedPath,
  stripLocalePrefix,
} from '../../lib/i18n/locale-detector'

// ---------------------------------------------------------------------------
// parseAcceptLanguage
// ---------------------------------------------------------------------------

describe('parseAcceptLanguage', () => {
  it('シンプルな日本語', () => {
    const result = parseAcceptLanguage('ja')
    expect(result[0]?.language).toBe('ja')
    expect(result[0]?.quality).toBe(1.0)
  })

  it('複数言語の品質値付き', () => {
    const result = parseAcceptLanguage('ja,en-US;q=0.9,en;q=0.8')
    expect(result[0]?.language).toBe('ja')
    expect(result[0]?.quality).toBe(1.0)
    expect(result[1]?.language).toBe('en-US')
    expect(result[1]?.quality).toBe(0.9)
    expect(result[2]?.language).toBe('en')
    expect(result[2]?.quality).toBe(0.8)
  })

  it('品質値で降順ソート', () => {
    const result = parseAcceptLanguage('en;q=0.5,ja;q=0.9')
    expect(result[0]?.language).toBe('ja')
    expect(result[1]?.language).toBe('en')
  })
})

// ---------------------------------------------------------------------------
// matchLocale
// ---------------------------------------------------------------------------

describe('matchLocale', () => {
  it('日本語 → ja', () => {
    expect(matchLocale('ja')).toBe('ja')
  })

  it('英語 → en', () => {
    expect(matchLocale('en')).toBe('en')
  })

  it('ja-JP → ja（言語コード前方一致）', () => {
    expect(matchLocale('ja-JP')).toBe('ja')
  })

  it('en-US → en（言語コード前方一致）', () => {
    expect(matchLocale('en-US,en;q=0.9')).toBe('en')
  })

  it('サポート外の言語 → デフォルト ja', () => {
    expect(matchLocale('zh-CN')).toBe('ja')
  })

  it('空文字列 → デフォルト ja', () => {
    expect(matchLocale('')).toBe('ja')
  })

  it('複数言語: 最も優先度の高いサポート済みロケールを返す', () => {
    expect(matchLocale('zh-CN,ja;q=0.9,en;q=0.8')).toBe('ja')
  })
})

// ---------------------------------------------------------------------------
// detectLocale（優先度テスト）
// ---------------------------------------------------------------------------

describe('detectLocale', () => {
  it('優先度1: URL パスのロケールプレフィックス（/ja/）', () => {
    const result = detectLocale({
      pathname: '/ja/dashboard',
      cookieHeader: 'PACE_LOCALE=en',
      acceptLanguageHeader: 'en-US',
    })
    expect(result).toBe('ja')
  })

  it('優先度1: URL パスが /en のみ', () => {
    const result = detectLocale({
      pathname: '/en',
    })
    expect(result).toBe('en')
  })

  it('優先度2: Cookie（URL パスにロケールなし）', () => {
    const result = detectLocale({
      pathname: '/dashboard',
      cookieHeader: 'PACE_LOCALE=en; other=value',
      acceptLanguageHeader: 'ja',
    })
    expect(result).toBe('en')
  })

  it('優先度3: Accept-Language（URLもCookieもなし）', () => {
    const result = detectLocale({
      pathname: '/dashboard',
      acceptLanguageHeader: 'en-US,en;q=0.9',
    })
    expect(result).toBe('en')
  })

  it('全て未設定 → デフォルト ja', () => {
    const result = detectLocale({})
    expect(result).toBe('ja')
  })

  it('無効な Cookie ロケール → Accept-Language にフォールバック', () => {
    const result = detectLocale({
      pathname: '/dashboard',
      cookieHeader: 'PACE_LOCALE=fr',
      acceptLanguageHeader: 'en',
    })
    expect(result).toBe('en')
  })
})

// ---------------------------------------------------------------------------
// buildLocalizedPath / stripLocalePrefix
// ---------------------------------------------------------------------------

describe('buildLocalizedPath', () => {
  it('/dashboard に ja プレフィックスを付与', () => {
    expect(buildLocalizedPath('/dashboard', 'ja')).toBe('/ja/dashboard')
  })

  it('/dashboard に en プレフィックスを付与', () => {
    expect(buildLocalizedPath('/dashboard', 'en')).toBe('/en/dashboard')
  })

  it('既存の ja プレフィックスを en に置換', () => {
    expect(buildLocalizedPath('/ja/dashboard', 'en')).toBe('/en/dashboard')
  })

  it('ルートパス /', () => {
    expect(buildLocalizedPath('/', 'en')).toBe('/en/')
  })
})

describe('stripLocalePrefix', () => {
  it('/ja/dashboard → /dashboard', () => {
    expect(stripLocalePrefix('/ja/dashboard')).toBe('/dashboard')
  })

  it('/en/settings → /settings', () => {
    expect(stripLocalePrefix('/en/settings')).toBe('/settings')
  })

  it('/ja のみ → /', () => {
    expect(stripLocalePrefix('/ja')).toBe('/')
  })

  it('プレフィックスなし → そのまま', () => {
    expect(stripLocalePrefix('/dashboard')).toBe('/dashboard')
  })
})

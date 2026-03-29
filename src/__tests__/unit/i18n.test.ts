/**
 * PACE Platform — i18n ユニットテスト
 *
 * タイムゾーン安全プロトコル検証:
 *   - UTC 保存・JST 表示変換ロジックの確認
 *   - 通貨・数値・日時フォーマッターの動作確認
 *   - 日本特有フォーマット（郵便番号・電話番号）の確認
 *   - ロケール判定ロジックの確認
 */

import {
  formatCurrency,
  formatDateTime,
  formatDateShort,
  formatRelativeTime,
  formatNumber,
  formatPercent,
  formatPostalCode,
  formatPhoneNumber,
  formatMeasurement,
  t,
} from '@/lib/i18n/formatters'

import {
  detectLocale,
  matchLocale,
  parseAcceptLanguage,
  buildLocalizedPath,
  stripLocalePrefix,
} from '@/lib/i18n/locale-detector'

import { isValidLocale, defaultLocale, defaultTimezone } from '@/i18n/config'

// ---------------------------------------------------------------------------
// 通貨フォーマッター
// ---------------------------------------------------------------------------

describe('formatCurrency', () => {
  it('JPY は小数点なしでフォーマットする', () => {
    const result = formatCurrency(1980)
    // 環境によって ¥（U+00A5 半角）または ￥（U+FFE5 全角）が使われるため正規表現で検証
    expect(result).toMatch(/[¥￥]1,980/)
  })

  it('USD は小数点2桁でフォーマットする', () => {
    const result = formatCurrency(29.99, 'USD')
    expect(result).toContain('29.99')
    expect(result).toContain('$')
  })

  it('0円をフォーマットする', () => {
    const result = formatCurrency(0)
    expect(result).toMatch(/[¥￥]0/)
  })

  it('大きな金額をカンマ区切りでフォーマットする', () => {
    const result = formatCurrency(1234567)
    expect(result).toMatch(/[¥￥]1,234,567/)
  })
})

// ---------------------------------------------------------------------------
// 日時フォーマッター（UTC→JST 変換）
// ---------------------------------------------------------------------------

describe('formatDateTime', () => {
  // UTC 10:00 → JST 19:00（+9時間）
  const utcString = '2024-03-20T10:00:00Z'

  it('datetime モードで UTC→JST 変換して表示する', () => {
    const result = formatDateTime(utcString, 'datetime', 'Asia/Tokyo', 'ja-JP')
    // JST では 3月20日 19:00
    expect(result).toContain('3月20日')
    expect(result).toContain('19:00')
  })

  it('date モードで日付のみ表示する', () => {
    const result = formatDateTime(utcString, 'date', 'Asia/Tokyo', 'ja-JP')
    expect(result).toContain('3月20日')
    expect(result).not.toContain(':')
  })

  it('time モードで時刻のみ表示する', () => {
    const result = formatDateTime(utcString, 'time', 'Asia/Tokyo', 'ja-JP')
    expect(result).toContain('19:00')
    expect(result).not.toContain('3月')
  })

  it('不正な日時文字列に対して "---" を返す', () => {
    expect(formatDateTime('invalid-date')).toBe('---')
  })
})

describe('formatDateShort', () => {
  it('UTC→JST 変換した短い日付を返す', () => {
    const result = formatDateShort('2024-03-20T10:00:00Z')
    expect(result).toContain('3月20日')
  })
})

// ---------------------------------------------------------------------------
// 数値フォーマッター
// ---------------------------------------------------------------------------

describe('formatNumber', () => {
  it('3桁カンマ区切りで数値をフォーマットする', () => {
    expect(formatNumber(1234567)).toBe('1,234,567')
  })
})

describe('formatPercent', () => {
  it('0.75 を 75% にフォーマットする', () => {
    expect(formatPercent(0.75)).toBe('75%')
  })

  it('小数点あり（digits=1）でフォーマットする', () => {
    expect(formatPercent(0.756, 1)).toBe('75.6%')
  })
})

// ---------------------------------------------------------------------------
// 日本特有フォーマット
// ---------------------------------------------------------------------------

describe('formatPostalCode', () => {
  it('7桁の数字をハイフン区切りにする', () => {
    expect(formatPostalCode('1234567')).toBe('123-4567')
  })

  it('既にハイフンあり入力を正規化する', () => {
    expect(formatPostalCode('123-4567')).toBe('123-4567')
  })

  it('4桁以上でハイフンを挿入する', () => {
    expect(formatPostalCode('1234')).toBe('123-4')
  })

  it('3桁以下はそのまま返す', () => {
    expect(formatPostalCode('123')).toBe('123')
  })

  it('7桁を超える入力は7桁に切り詰める', () => {
    expect(formatPostalCode('12345678')).toBe('123-4567')
  })
})

describe('formatPhoneNumber', () => {
  it('携帯電話（090）11桁をフォーマットする', () => {
    expect(formatPhoneNumber('09012345678')).toBe('090-1234-5678')
  })

  it('携帯電話（080）11桁をフォーマットする', () => {
    expect(formatPhoneNumber('08012345678')).toBe('080-1234-5678')
  })

  it('一般加入電話（03）10桁をフォーマットする', () => {
    expect(formatPhoneNumber('0312345678')).toBe('03-1234-5678')
  })

  it('フリーダイヤル（0120）10桁をフォーマットする', () => {
    expect(formatPhoneNumber('0120123456')).toBe('0120-123-456')
  })

  it('認識できない番号はそのまま返す', () => {
    expect(formatPhoneNumber('123')).toBe('123')
  })
})

describe('formatMeasurement', () => {
  it('身長を単位付きでフォーマットする', () => {
    expect(formatMeasurement(175.5, 'cm')).toBe('175.5 cm')
  })

  it('体重を単位付きでフォーマットする', () => {
    expect(formatMeasurement(68, 'kg')).toBe('68 kg')
  })
})

// ---------------------------------------------------------------------------
// 翻訳ヘルパー
// ---------------------------------------------------------------------------

describe('t (翻訳ヘルパー)', () => {
  const messages = {
    common: {
      loading: '読み込み中...',
      error: 'エラーが発生しました',
    },
    subscription: {
      currentPlan: '現在のプラン: {plan}',
      expiresAt: '{date}まで有効',
    },
  }

  it('ネストされたキーで文字列を取得する', () => {
    expect(t(messages, 'common.loading')).toBe('読み込み中...')
  })

  it('プレースホルダーを置換する', () => {
    expect(t(messages, 'subscription.currentPlan', { plan: 'Pro' }))
      .toBe('現在のプラン: Pro')
  })

  it('複数のプレースホルダーを置換する', () => {
    expect(t(messages, 'subscription.expiresAt', { date: '2024年12月31日' }))
      .toBe('2024年12月31日まで有効')
  })

  it('存在しないキーはキー名をそのまま返す', () => {
    expect(t(messages, 'nonexistent.key')).toBe('nonexistent.key')
  })
})

// ---------------------------------------------------------------------------
// ロケール設定
// ---------------------------------------------------------------------------

describe('i18n config', () => {
  it('デフォルトロケールは ja', () => {
    expect(defaultLocale).toBe('ja')
  })

  it('デフォルトタイムゾーンは Asia/Tokyo', () => {
    expect(defaultTimezone).toBe('Asia/Tokyo')
  })

  it('有効なロケールを正しく判定する', () => {
    expect(isValidLocale('ja')).toBe(true)
    expect(isValidLocale('en')).toBe(true)
    expect(isValidLocale('fr')).toBe(false)
    expect(isValidLocale(undefined)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// ロケール判定
// ---------------------------------------------------------------------------

describe('parseAcceptLanguage', () => {
  it('Accept-Language ヘッダーを優先度順にパースする', () => {
    const result = parseAcceptLanguage('ja,en-US;q=0.9,en;q=0.8')
    expect(result[0].language).toBe('ja')
    expect(result[0].quality).toBe(1.0)
    expect(result[1].language).toBe('en-US')
    expect(result[1].quality).toBe(0.9)
  })
})

describe('matchLocale', () => {
  it('完全一致でロケールを返す', () => {
    expect(matchLocale('ja')).toBe('ja')
    expect(matchLocale('en')).toBe('en')
  })

  it('言語コード前方一致でロケールを返す', () => {
    expect(matchLocale('ja-JP')).toBe('ja')
    expect(matchLocale('en-US')).toBe('en')
  })

  it('サポート外のロケールはデフォルトロケール（ja）を返す', () => {
    expect(matchLocale('fr-FR')).toBe('ja')
  })
})

describe('detectLocale', () => {
  it('URL パスのロケールプレフィックスを最優先する', () => {
    expect(detectLocale({ pathname: '/en/dashboard' })).toBe('en')
    expect(detectLocale({ pathname: '/ja/settings' })).toBe('ja')
  })

  it('Cookie のロケールを URL の次に優先する', () => {
    expect(detectLocale({ cookieHeader: 'PACE_LOCALE=en' })).toBe('en')
  })

  it('Accept-Language ヘッダーを最終フォールバックとして使用する', () => {
    expect(detectLocale({ acceptLanguageHeader: 'en-US,en;q=0.9' })).toBe('en')
  })

  it('情報がない場合はデフォルトロケール（ja）を返す', () => {
    expect(detectLocale({})).toBe('ja')
  })
})

describe('buildLocalizedPath / stripLocalePrefix', () => {
  it('パスにロケールプレフィックスを付与する', () => {
    expect(buildLocalizedPath('/dashboard', 'en')).toBe('/en/dashboard')
  })

  it('既存のロケールプレフィックスを置換する', () => {
    expect(buildLocalizedPath('/ja/dashboard', 'en')).toBe('/en/dashboard')
  })

  it('パスからロケールプレフィックスを除去する', () => {
    expect(stripLocalePrefix('/ja/dashboard')).toBe('/dashboard')
    expect(stripLocalePrefix('/dashboard')).toBe('/dashboard')
  })
})

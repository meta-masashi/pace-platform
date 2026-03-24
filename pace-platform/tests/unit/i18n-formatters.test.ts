/**
 * tests/unit/i18n-formatters.test.ts
 * ============================================================
 * i18n フォーマッター単体テスト
 *
 * 対象: lib/i18n/formatters.ts
 *   - formatCurrency()
 *   - formatDateTime()（UTC→JST 変換）
 *   - formatRelativeTime()
 *   - formatNumber()
 *   - formatPercent()
 *   - formatPostalCode()
 *   - formatPhoneNumber()
 *   - formatMeasurement()
 *   - t()（翻訳キー補間）
 *
 * タイムゾーン安全プロトコル検証:
 *   - DB から返る UTC 文字列が JST に正しく変換されるか
 *   - 不正な日時文字列が '---' を返すか
 * ============================================================
 */

import { describe, it, expect } from 'vitest'
import {
  formatCurrency,
  formatDateTime,
  formatRelativeTime,
  formatNumber,
  formatPercent,
  formatPostalCode,
  formatPhoneNumber,
  formatMeasurement,
  t,
} from '../../lib/i18n/formatters'

// ---------------------------------------------------------------------------
// formatCurrency
// ---------------------------------------------------------------------------

describe('formatCurrency', () => {
  it('JPY: 円マーク付きカンマ区切り（小数点なし）', () => {
    const result = formatCurrency(1980)
    // Node.js の Intl 実装では ￥（U+FFE5）または ¥（U+00A5）が返る環境依存のため
    // 数値部分とカンマ区切りを検証する
    expect(result).toMatch(/1,980/)
    expect(result).not.toMatch(/\./)  // 小数点なし
  })

  it('JPY: 大きな金額', () => {
    const result = formatCurrency(1_000_000)
    expect(result).toMatch(/1,000,000/)
  })

  it('JPY: 0円', () => {
    const result = formatCurrency(0)
    expect(result).toMatch(/0/)
    expect(result).not.toMatch(/\./)
  })

  it('USD: 小数点2桁', () => {
    const result = formatCurrency(29.99, 'USD', 'en-US')
    expect(result).toBe('$29.99')
  })

  it('USD: 整数もセント表記', () => {
    const result = formatCurrency(100, 'USD', 'en-US')
    expect(result).toBe('$100.00')
  })
})

// ---------------------------------------------------------------------------
// formatDateTime（タイムゾーン安全プロトコル）
// ---------------------------------------------------------------------------

describe('formatDateTime', () => {
  // UTC 10:00 → JST 19:00
  const utcString = '2024-03-20T10:00:00Z'

  it('datetime モード: 日付と時刻を表示（UTC→JST変換）', () => {
    const result = formatDateTime(utcString, 'datetime', 'Asia/Tokyo', 'ja-JP')
    // JST = UTC+9 → 19:00 になるはず
    expect(result).toContain('2024')
    expect(result).toContain('3')
    expect(result).toContain('20')
    expect(result).toContain('19:00')
  })

  it('date モード: 日付のみ表示', () => {
    const result = formatDateTime(utcString, 'date', 'Asia/Tokyo', 'ja-JP')
    expect(result).toContain('2024')
    expect(result).not.toContain('19:00')
  })

  it('time モード: 時刻のみ表示（UTC→JST変換）', () => {
    const result = formatDateTime(utcString, 'time', 'Asia/Tokyo', 'ja-JP')
    expect(result).toContain('19:00')
    expect(result).not.toContain('2024')
  })

  it('不正な日時文字列は --- を返す', () => {
    const result = formatDateTime('invalid-date')
    expect(result).toBe('---')
  })

  it('空文字列は --- を返す', () => {
    const result = formatDateTime('')
    expect(result).toBe('---')
  })

  it('タイムゾーンを変更できる（UTC→UTC+0）', () => {
    // UTC のまま表示すると 10:00
    const result = formatDateTime(utcString, 'time', 'UTC', 'en-US')
    expect(result).toContain('10:00')
  })
})

// ---------------------------------------------------------------------------
// formatNumber
// ---------------------------------------------------------------------------

describe('formatNumber', () => {
  it('3桁カンマ区切り', () => {
    expect(formatNumber(1234567)).toBe('1,234,567')
  })

  it('3桁未満はそのまま', () => {
    expect(formatNumber(42)).toBe('42')
  })

  it('0', () => {
    expect(formatNumber(0)).toBe('0')
  })
})

// ---------------------------------------------------------------------------
// formatPercent
// ---------------------------------------------------------------------------

describe('formatPercent', () => {
  it('0.75 → 75%', () => {
    expect(formatPercent(0.75)).toBe('75%')
  })

  it('1.0 → 100%', () => {
    expect(formatPercent(1.0)).toBe('100%')
  })

  it('0.0 → 0%', () => {
    expect(formatPercent(0)).toBe('0%')
  })

  it('小数点1桁', () => {
    const result = formatPercent(0.755, 1)
    // 四捨五入されて 75.5% または 75.6% になる
    expect(result).toMatch(/75\.[5-6]%/)
  })
})

// ---------------------------------------------------------------------------
// formatPostalCode（日本特有）
// ---------------------------------------------------------------------------

describe('formatPostalCode', () => {
  it('7桁の数字をハイフン区切りに', () => {
    expect(formatPostalCode('1234567')).toBe('123-4567')
  })

  it('ハイフン付き入力はそのまま正規化', () => {
    expect(formatPostalCode('123-4567')).toBe('123-4567')
  })

  it('3桁以下はそのまま', () => {
    expect(formatPostalCode('123')).toBe('123')
  })

  it('スペースや記号を除去', () => {
    expect(formatPostalCode(' 123 4567 ')).toBe('123-4567')
  })

  it('8桁以上は7桁に切り捨て', () => {
    expect(formatPostalCode('12345678')).toBe('123-4567')
  })
})

// ---------------------------------------------------------------------------
// formatPhoneNumber（日本特有）
// ---------------------------------------------------------------------------

describe('formatPhoneNumber', () => {
  it('携帯（090）: 11桁をハイフン区切りに', () => {
    expect(formatPhoneNumber('09012345678')).toBe('090-1234-5678')
  })

  it('携帯（080）: 11桁', () => {
    expect(formatPhoneNumber('08012345678')).toBe('080-1234-5678')
  })

  it('携帯（070）: 11桁', () => {
    expect(formatPhoneNumber('07012345678')).toBe('070-1234-5678')
  })

  it('IP電話（050）: 11桁', () => {
    expect(formatPhoneNumber('05012345678')).toBe('050-1234-5678')
  })

  it('一般加入（03）: 10桁', () => {
    expect(formatPhoneNumber('0312345678')).toBe('03-1234-5678')
  })

  it('フリーダイヤル（0120）: 10桁', () => {
    expect(formatPhoneNumber('0120123456')).toBe('0120-123-456')
  })

  it('ハイフン付き入力: 数字だけで再解析', () => {
    expect(formatPhoneNumber('090-1234-5678')).toBe('090-1234-5678')
  })
})

// ---------------------------------------------------------------------------
// formatMeasurement
// ---------------------------------------------------------------------------

describe('formatMeasurement', () => {
  it('身長: 整数 cm', () => {
    expect(formatMeasurement(175, 'cm')).toBe('175 cm')
  })

  it('体重: 小数点1桁', () => {
    expect(formatMeasurement(68.5, 'kg')).toBe('68.5 kg')
  })
})

// ---------------------------------------------------------------------------
// t()（翻訳キー補間）
// ---------------------------------------------------------------------------

describe('t()', () => {
  const messages = {
    common: {
      loading: '読み込み中...',
      error: 'エラーが発生しました',
    },
    subscription: {
      currentPlan: '現在のプラン: {plan}',
      expiresAt: '{date}まで有効',
    },
    validation: {
      required: '{field}は必須項目です',
      minLength: '{field}は{min}文字以上で入力してください',
    },
  }

  it('ネストキーで文字列取得', () => {
    expect(t(messages, 'common.loading')).toBe('読み込み中...')
  })

  it('単一プレースホルダーの補間', () => {
    expect(t(messages, 'subscription.currentPlan', { plan: 'Pro' }))
      .toBe('現在のプラン: Pro')
  })

  it('日付プレースホルダーの補間', () => {
    expect(t(messages, 'subscription.expiresAt', { date: '2025年3月31日' }))
      .toBe('2025年3月31日まで有効')
  })

  it('複数プレースホルダーの補間', () => {
    expect(t(messages, 'validation.minLength', { field: 'パスワード', min: '8' }))
      .toBe('パスワードは8文字以上で入力してください')
  })

  it('存在しないキーはキー文字列をそのまま返す', () => {
    expect(t(messages, 'nonexistent.key')).toBe('nonexistent.key')
  })

  it('パラメータなしで呼べる', () => {
    expect(t(messages, 'common.error')).toBe('エラーが発生しました')
  })

  it('未定義プレースホルダーはそのまま残す', () => {
    expect(t(messages, 'subscription.currentPlan'))
      .toBe('現在のプラン: {plan}')
  })
})

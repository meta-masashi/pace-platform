/**
 * tests/unit/trend-detection.test.ts
 * ============================================================
 * トレンド検出モジュールの単体テスト
 *
 * Go エンジン pipeline/trend.go との一致を検証:
 *   - linearSlope(): 線形回帰の傾き計算
 *   - detectTrends(): 閾値接近検出
 *   - 情報提供のみ（判定色は変更しない）
 * ============================================================
 */

import { describe, it, expect } from 'vitest'
import {
  linearSlope,
  detectTrends,
  extractMetricFromHistory,
  MONITORED_TRENDS,
  type TrendConfig,
} from '../../lib/engine/v6/trend-detection'
import type { FeatureVector, TissueCategory } from '../../lib/engine/v6/types'

// ---------------------------------------------------------------------------
// テストヘルパー: FeatureVector ファクトリ
// ---------------------------------------------------------------------------

function createFeatureVector(overrides: Partial<{
  acwr: number
  monotonyIndex: number
  zScores: Record<string, number>
}>): FeatureVector {
  return {
    acwr: overrides.acwr ?? 1.0,
    monotonyIndex: overrides.monotonyIndex ?? 1.0,
    preparedness: 50,
    tissueDamage: { metabolic: 0, structural_soft: 0, structural_hard: 0, neuromotor: 0 },
    zScores: overrides.zScores ?? {},
  }
}

// ---------------------------------------------------------------------------
// linearSlope
// ---------------------------------------------------------------------------

describe('linearSlope', () => {
  it('上昇系列: [1, 2, 3] → slope ≈ 1.0', () => {
    expect(linearSlope([1, 2, 3])).toBeCloseTo(1.0, 5)
  })

  it('下降系列: [3, 2, 1] → slope ≈ -1.0', () => {
    expect(linearSlope([3, 2, 1])).toBeCloseTo(-1.0, 5)
  })

  it('フラット: [5, 5, 5] → slope = 0', () => {
    expect(linearSlope([5, 5, 5])).toBeCloseTo(0, 5)
  })

  it('2点: [0, 2] → slope = 2.0', () => {
    expect(linearSlope([0, 2])).toBeCloseTo(2.0, 5)
  })

  it('1点以下: [5] → slope = 0', () => {
    expect(linearSlope([5])).toBe(0)
  })

  it('空配列 → slope = 0', () => {
    expect(linearSlope([])).toBe(0)
  })

  it('非線形系列: [1, 3, 2] → slope = 0.5', () => {
    expect(linearSlope([1, 3, 2])).toBeCloseTo(0.5, 5)
  })
})

// ---------------------------------------------------------------------------
// extractMetricFromHistory
// ---------------------------------------------------------------------------

describe('extractMetricFromHistory', () => {
  const history: FeatureVector[] = [
    createFeatureVector({ acwr: 1.0, monotonyIndex: 1.2, zScores: { sleepQuality: -0.5, fatigue: -0.3 } }),
    createFeatureVector({ acwr: 1.2, monotonyIndex: 1.5, zScores: { sleepQuality: -0.8, fatigue: -0.6 } }),
    createFeatureVector({ acwr: 1.4, monotonyIndex: 1.8, zScores: { sleepQuality: -1.1, fatigue: -0.9 } }),
  ]

  it('acwr を正しく抽出', () => {
    expect(extractMetricFromHistory(history, 'acwr')).toEqual([1.0, 1.2, 1.4])
  })

  it('monotony を正しく抽出', () => {
    expect(extractMetricFromHistory(history, 'monotony')).toEqual([1.2, 1.5, 1.8])
  })

  it('z_sleep_quality を正しく抽出', () => {
    expect(extractMetricFromHistory(history, 'z_sleep_quality')).toEqual([-0.5, -0.8, -1.1])
  })

  it('z_fatigue を正しく抽出', () => {
    expect(extractMetricFromHistory(history, 'z_fatigue')).toEqual([-0.3, -0.6, -0.9])
  })

  it('存在しない Z-Score キーは 0 にフォールバック', () => {
    expect(extractMetricFromHistory(history, 'z_nonexistent')).toEqual([0, 0, 0])
  })
})

// ---------------------------------------------------------------------------
// detectTrends
// ---------------------------------------------------------------------------

describe('detectTrends', () => {
  it('ACWR が閾値に向かって上昇中 → 通知を発行', () => {
    const history = [
      createFeatureVector({ acwr: 1.2 }),
      createFeatureVector({ acwr: 1.3 }),
      createFeatureVector({ acwr: 1.4 }),
    ]
    // slope = 0.1/day, current = 1.4, projected = 1.4 + 0.1*3 = 1.7 >= 1.5
    const notices = detectTrends(history)
    const acwrNotice = notices.find((n) => n.metric === 'acwr')
    expect(acwrNotice).toBeDefined()
    expect(acwrNotice!.direction).toBe('rising')
    expect(acwrNotice!.message).toContain('ACWR')
    expect(acwrNotice!.message).toContain('閾値に接近中')
  })

  it('ACWR がすでに閾値を超えている場合 → 通知なし', () => {
    const history = [
      createFeatureVector({ acwr: 1.6 }),
      createFeatureVector({ acwr: 1.7 }),
      createFeatureVector({ acwr: 1.8 }),
    ]
    const notices = detectTrends(history)
    const acwrNotice = notices.find((n) => n.metric === 'acwr')
    expect(acwrNotice).toBeUndefined()
  })

  it('睡眠 Z-Score が低下して閾値に接近中 → 通知を発行', () => {
    const history = [
      createFeatureVector({ zScores: { sleepQuality: -0.5 } }),
      createFeatureVector({ zScores: { sleepQuality: -0.8 } }),
      createFeatureVector({ zScores: { sleepQuality: -1.1 } }),
    ]
    // slope = -0.3/day, current = -1.1, projected = -1.1 + (-0.3)*3 = -2.0 <= -1.5
    const notices = detectTrends(history)
    const sleepNotice = notices.find((n) => n.metric === 'z_sleep_quality')
    expect(sleepNotice).toBeDefined()
    expect(sleepNotice!.direction).toBe('falling')
  })

  it('データ不足（2件）→ 通知なし', () => {
    const history = [
      createFeatureVector({ acwr: 1.3 }),
      createFeatureVector({ acwr: 1.4 }),
    ]
    expect(detectTrends(history)).toHaveLength(0)
  })

  it('安定した値 → 通知なし', () => {
    const history = [
      createFeatureVector({ acwr: 1.0, monotonyIndex: 1.0 }),
      createFeatureVector({ acwr: 1.0, monotonyIndex: 1.0 }),
      createFeatureVector({ acwr: 1.0, monotonyIndex: 1.0 }),
    ]
    expect(detectTrends(history)).toHaveLength(0)
  })

  it('ACWR が下降中 → rising トレンドは発行しない', () => {
    const history = [
      createFeatureVector({ acwr: 1.4 }),
      createFeatureVector({ acwr: 1.3 }),
      createFeatureVector({ acwr: 1.2 }),
    ]
    const notices = detectTrends(history)
    const acwrNotice = notices.find((n) => n.metric === 'acwr')
    expect(acwrNotice).toBeUndefined()
  })

  it('英語メッセージも含まれる', () => {
    const history = [
      createFeatureVector({ acwr: 1.2 }),
      createFeatureVector({ acwr: 1.3 }),
      createFeatureVector({ acwr: 1.4 }),
    ]
    const notices = detectTrends(history)
    const acwrNotice = notices.find((n) => n.metric === 'acwr')
    expect(acwrNotice!.messageEn).toContain('Trend notice')
    expect(acwrNotice!.messageEn).toContain('ACWR')
  })
})

// ---------------------------------------------------------------------------
// MONITORED_TRENDS 設定の整合性チェック
// ---------------------------------------------------------------------------

describe('MONITORED_TRENDS config', () => {
  it('4 つのメトリクスが監視対象', () => {
    expect(MONITORED_TRENDS).toHaveLength(4)
  })

  it('全エントリに必須フィールドがある', () => {
    for (const tc of MONITORED_TRENDS) {
      expect(tc.metric).toBeTruthy()
      expect(tc.label).toBeTruthy()
      expect(tc.labelEn).toBeTruthy()
      expect(typeof tc.threshold).toBe('number')
      expect(['rising', 'falling']).toContain(tc.direction)
    }
  })

  it('Go monitoredTrends と同じメトリクスセット', () => {
    const metrics = MONITORED_TRENDS.map((t) => t.metric).sort()
    expect(metrics).toEqual(['acwr', 'monotony', 'z_fatigue', 'z_sleep_quality'])
  })
})

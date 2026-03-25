/**
 * tests/unit/calendar-load-predictor.test.ts
 * ============================================================
 * カレンダーベース負荷予測エンジン単体テスト
 *
 * 対象: lib/calendar/load-predictor.ts
 *   - predictAvailability() — 日別プレー可能率予測
 *   - イベント種別ごとの影響
 *   - ACWR 補正係数
 *   - 日間減衰
 * ============================================================
 */

import { describe, it, expect } from 'vitest'
import { predictAvailability } from '../../lib/calendar/load-predictor'
import type { ClassifiedEvent, TeamMetrics } from '../../lib/calendar/types'

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<ClassifiedEvent> & { eventType: ClassifiedEvent['eventType'] }): ClassifiedEvent {
  return {
    id: 'evt-1',
    summary: 'テストイベント',
    description: null,
    startDateTime: '2025-02-01T10:00:00+09:00',
    endDateTime: '2025-02-01T12:00:00+09:00',
    location: null,
    ...overrides,
  }
}

const baseMetrics: TeamMetrics = {
  currentAvailability: 85,
  currentTeamScore: 75,
  averageAcwr: 1.0,
}

// ===========================================================================
// 空イベントリスト
// ===========================================================================

describe('predictAvailability: 空イベントリスト', () => {
  it('空のイベント配列で空の予測結果を返す', () => {
    const result = predictAvailability([], baseMetrics)
    expect(result).toEqual([])
  })
})

// ===========================================================================
// 試合 (match) の影響
// ===========================================================================

describe('predictAvailability: 試合イベント', () => {
  it('試合イベントでプレー可能率が約 15% 低下する', () => {
    const events = [makeEvent({ eventType: 'match' })]
    const predictions = predictAvailability(events, baseMetrics)

    expect(predictions).toHaveLength(1)
    // baseMetrics.currentAvailability (85) - 15 = 70
    expect(predictions[0]!.predictedAvailability).toBeCloseTo(70, 0)
  })

  it('試合イベントでチームスコアが低下する', () => {
    const events = [makeEvent({ eventType: 'match' })]
    const predictions = predictAvailability(events, baseMetrics)

    // baseMetrics.currentTeamScore (75) - 12 = 63
    expect(predictions[0]!.predictedTeamScore).toBeCloseTo(63, 0)
  })
})

// ===========================================================================
// 高強度トレーニング (high_intensity) の影響
// ===========================================================================

describe('predictAvailability: 高強度トレーニング', () => {
  it('高強度トレーニングでプレー可能率が約 8% 低下する', () => {
    const events = [makeEvent({ eventType: 'high_intensity' })]
    const predictions = predictAvailability(events, baseMetrics)

    // 85 - 8 = 77
    expect(predictions[0]!.predictedAvailability).toBeCloseTo(77, 0)
  })
})

// ===========================================================================
// 回復日 (recovery) の影響
// ===========================================================================

describe('predictAvailability: 回復日', () => {
  it('回復日でプレー可能率が約 5% 改善する', () => {
    const events = [makeEvent({ eventType: 'recovery' })]
    const predictions = predictAvailability(events, baseMetrics)

    // 85 + 5 = 90
    expect(predictions[0]!.predictedAvailability).toBeCloseTo(90, 0)
  })

  it('回復日でチームスコアが改善する', () => {
    const events = [makeEvent({ eventType: 'recovery' })]
    const predictions = predictAvailability(events, baseMetrics)

    // 75 + 4 = 79
    expect(predictions[0]!.predictedTeamScore).toBeCloseTo(79, 0)
  })
})

// ===========================================================================
// ACWR 補正係数
// ===========================================================================

describe('predictAvailability: ACWR 補正', () => {
  it('ACWR < 1.3 では補正なし（modifier = 1.0）', () => {
    const events = [makeEvent({ eventType: 'match' })]
    const metrics: TeamMetrics = { ...baseMetrics, averageAcwr: 1.0 }
    const predictions = predictAvailability(events, metrics)

    // match impact = -15 * 1.0 = -15
    expect(predictions[0]!.predictedAvailability).toBeCloseTo(85 - 15, 0)
  })

  it('1.3 <= ACWR < 1.5 で悪影響が 20% 増加（modifier = 1.2）', () => {
    const events = [makeEvent({ eventType: 'match' })]
    const metrics: TeamMetrics = { ...baseMetrics, averageAcwr: 1.4 }
    const predictions = predictAvailability(events, metrics)

    // match impact = -15 * 1.2 = -18
    expect(predictions[0]!.predictedAvailability).toBeCloseTo(85 - 18, 0)
  })

  it('ACWR >= 1.5 で悪影響が 50% 増加（modifier = 1.5）', () => {
    const events = [makeEvent({ eventType: 'match' })]
    const metrics: TeamMetrics = { ...baseMetrics, averageAcwr: 1.6 }
    const predictions = predictAvailability(events, metrics)

    // match impact = -15 * 1.5 = -22.5
    expect(predictions[0]!.predictedAvailability).toBeCloseTo(85 - 22.5, 0)
  })

  it('ACWR 補正は回復日の効果も増幅する', () => {
    const events = [makeEvent({ eventType: 'recovery' })]
    const highAcwrMetrics: TeamMetrics = { ...baseMetrics, averageAcwr: 1.6 }
    const predictions = predictAvailability(events, highAcwrMetrics)

    // recovery impact = 5 * 1.5 = 7.5
    expect(predictions[0]!.predictedAvailability).toBeCloseTo(85 + 7.5, 0)
  })
})

// ===========================================================================
// 複数イベント・日間減衰
// ===========================================================================

describe('predictAvailability: 複数イベント', () => {
  it('同日の複数イベントは効果が蓄積する', () => {
    const events = [
      makeEvent({ eventType: 'high_intensity', startDateTime: '2025-02-01T09:00:00+09:00' }),
      makeEvent({ eventType: 'high_intensity', startDateTime: '2025-02-01T14:00:00+09:00' }),
    ]
    const predictions = predictAvailability(events, baseMetrics)

    expect(predictions).toHaveLength(2)
    // 2回の high_intensity: -8 + -8 = -16
    expect(predictions[1]!.predictedAvailability).toBeCloseTo(85 - 16, 0)
  })

  it('異なる日のイベントでは前日の効果が減衰する', () => {
    const events = [
      makeEvent({ eventType: 'match', startDateTime: '2025-02-01T10:00:00+09:00' }),
      makeEvent({ eventType: 'match', startDateTime: '2025-02-02T10:00:00+09:00' }),
    ]
    const predictions = predictAvailability(events, baseMetrics)

    expect(predictions).toHaveLength(2)
    // 1日目: -15
    // 2日目: 前日効果(-15) * 0.5 = -7.5 + 新規(-15) = -22.5
    expect(predictions[1]!.predictedAvailability).toBeCloseTo(85 - 22.5, 0)
  })

  it('日付順にソートされて処理される', () => {
    const events = [
      makeEvent({ eventType: 'recovery', startDateTime: '2025-02-03T10:00:00+09:00', summary: '回復日' }),
      makeEvent({ eventType: 'match', startDateTime: '2025-02-01T10:00:00+09:00', summary: '試合' }),
    ]
    const predictions = predictAvailability(events, baseMetrics)

    expect(predictions[0]!.eventName).toBe('試合')
    expect(predictions[1]!.eventName).toBe('回復日')
  })
})

// ===========================================================================
// クランプ（0-100 範囲）
// ===========================================================================

describe('predictAvailability: クランプ', () => {
  it('予測値が 100 を超えない', () => {
    const metrics: TeamMetrics = {
      currentAvailability: 98,
      currentTeamScore: 98,
      averageAcwr: 0.8,
    }
    const events = [
      makeEvent({ eventType: 'recovery' }),
      makeEvent({ eventType: 'recovery', startDateTime: '2025-02-01T14:00:00+09:00' }),
      makeEvent({ eventType: 'recovery', startDateTime: '2025-02-01T16:00:00+09:00' }),
    ]
    const predictions = predictAvailability(events, metrics)

    for (const p of predictions) {
      expect(p.predictedAvailability).toBeLessThanOrEqual(100)
      expect(p.predictedTeamScore).toBeLessThanOrEqual(100)
    }
  })

  it('予測値が 0 を下回らない', () => {
    const metrics: TeamMetrics = {
      currentAvailability: 10,
      currentTeamScore: 10,
      averageAcwr: 1.6, // 1.5x amplification
    }
    const events = [
      makeEvent({ eventType: 'match', startDateTime: '2025-02-01T10:00:00+09:00' }),
      makeEvent({ eventType: 'match', startDateTime: '2025-02-01T14:00:00+09:00' }),
    ]
    const predictions = predictAvailability(events, metrics)

    for (const p of predictions) {
      expect(p.predictedAvailability).toBeGreaterThanOrEqual(0)
      expect(p.predictedTeamScore).toBeGreaterThanOrEqual(0)
    }
  })
})

// ===========================================================================
// 出力構造
// ===========================================================================

describe('predictAvailability: 出力構造', () => {
  it('各予測に必要なフィールドが含まれる', () => {
    const events = [makeEvent({ eventType: 'match', summary: '公式戦 vs A' })]
    const predictions = predictAvailability(events, baseMetrics)

    const prediction = predictions[0]!
    expect(prediction).toHaveProperty('date')
    expect(prediction).toHaveProperty('eventType')
    expect(prediction).toHaveProperty('eventName')
    expect(prediction).toHaveProperty('predictedAvailability')
    expect(prediction).toHaveProperty('predictedTeamScore')
    expect(prediction.eventType).toBe('match')
    expect(prediction.eventName).toBe('公式戦 vs A')
  })

  it('日付は YYYY-MM-DD 形式で返される', () => {
    const events = [makeEvent({ eventType: 'match', startDateTime: '2025-03-15T10:00:00+09:00' })]
    const predictions = predictAvailability(events, baseMetrics)
    expect(predictions[0]!.date).toBe('2025-03-15')
  })

  it('予測値は小数第1位に丸められている', () => {
    const events = [makeEvent({ eventType: 'match' })]
    const predictions = predictAvailability(events, baseMetrics)
    const avail = predictions[0]!.predictedAvailability
    expect(avail).toBe(Math.round(avail * 10) / 10)
  })
})

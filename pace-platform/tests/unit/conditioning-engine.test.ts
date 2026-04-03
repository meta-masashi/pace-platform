/**
 * tests/unit/conditioning-engine.test.ts
 * ============================================================
 * コンディショニングエンジン単体テスト
 *
 * 対象:
 *   - lib/conditioning/ewma.ts  — EWMA 計算
 *   - lib/conditioning/engine.ts — コンディショニングスコア算出
 *
 * テスト項目:
 *   - EWMA 計算の数学的正確性
 *   - エッジケース（空配列、単一値、NaN）
 *   - スコア正規化（0-100 範囲）
 *   - Pro Mode: HRV ペナルティ係数
 *   - ACWR 計算（7日 / 28日比率）
 *   - 主観ペナルティ（睡眠不良、高疲労）
 * ============================================================
 */

import { describe, it, expect } from 'vitest'
import {
  calculateEWMA,
  createEWMAConfig,
  calculateEWMAWithConfig,
  FITNESS_EWMA_SPAN,
  FATIGUE_EWMA_SPAN,
} from '../../lib/conditioning/ewma'
import { calculateConditioningScore } from '../../lib/conditioning/engine'
import type { DailyMetricRow, ConditioningInput } from '../../lib/conditioning/types'

// ---------------------------------------------------------------------------
// ヘルパー: テスト用 DailyMetricRow を生成
// ---------------------------------------------------------------------------

function makeDailyRow(overrides: Partial<DailyMetricRow> & { date: string }): DailyMetricRow {
  return {
    srpe: 300,
    sleepScore: 7,
    fatigueSubjective: 3,
    hrv: null,
    hrvBaseline: null,
    ...overrides,
  }
}

function makeHistory(days: number, srpe = 300): DailyMetricRow[] {
  return Array.from({ length: days }, (_, i) =>
    makeDailyRow({ date: `2025-01-${String(i + 1).padStart(2, '0')}`, srpe })
  )
}

// ===========================================================================
// EWMA 計算テスト
// ===========================================================================

describe('calculateEWMA', () => {
  it('空配列に対して 0 を返す', () => {
    expect(calculateEWMA([], 7)).toBe(0)
  })

  it('単一値の場合はその値を返す', () => {
    expect(calculateEWMA([42], 7)).toBe(42)
  })

  it('NaN / Infinity を含む場合はスキップして計算する', () => {
    const values = [100, NaN, 200, Infinity, 300]
    const result = calculateEWMA(values, 3)
    // NaN, Infinity をフィルタして [100, 200, 300] で計算
    // α = 2/(3+1) = 0.5
    // S0 = 100
    // S1 = 0.5 * 200 + 0.5 * 100 = 150
    // S2 = 0.5 * 300 + 0.5 * 150 = 225
    expect(result).toBe(225)
  })

  it('全て NaN の場合は 0 を返す', () => {
    expect(calculateEWMA([NaN, NaN, NaN], 7)).toBe(0)
  })

  it('スパン 7 の既知値で数学的に正しい結果を返す', () => {
    // α = 2 / (7 + 1) = 0.25
    const alpha = 0.25
    const values = [100, 200, 150, 300]
    // S0 = 100
    // S1 = 0.25 * 200 + 0.75 * 100 = 50 + 75 = 125
    // S2 = 0.25 * 150 + 0.75 * 125 = 37.5 + 93.75 = 131.25
    // S3 = 0.25 * 300 + 0.75 * 131.25 = 75 + 98.4375 = 173.4375
    const expected = alpha * 300 + (1 - alpha) * (alpha * 150 + (1 - alpha) * (alpha * 200 + (1 - alpha) * 100))
    const result = calculateEWMA(values, 7)
    expect(result).toBeCloseTo(expected, 10)
  })

  it('スパン 42 (フィットネス) の計算で平滑化が強く効く', () => {
    const values = Array.from({ length: 42 }, () => 300)
    // 全て同じ値なら EWMA も同じ値
    expect(calculateEWMA(values, 42)).toBeCloseTo(300, 5)
  })

  it('急激な変化に対してスパンが短いほど敏感に追従する', () => {
    // 前半低値、後半高値
    const values = [...Array(10).fill(100), ...Array(10).fill(500)]
    const shortSpan = calculateEWMA(values, 3)  // 短スパン → 500 に近い
    const longSpan = calculateEWMA(values, 20)   // 長スパン → 100 に近い
    expect(shortSpan).toBeGreaterThan(longSpan)
  })
})

// ---------------------------------------------------------------------------
// createEWMAConfig
// ---------------------------------------------------------------------------

describe('createEWMAConfig', () => {
  it('スパンから正しい平滑化係数を計算する', () => {
    const config = createEWMAConfig(7)
    expect(config.span).toBe(7)
    expect(config.smoothingFactor).toBeCloseTo(2 / 8, 10)
  })

  it('スパン 1 未満で RangeError をスローする', () => {
    expect(() => createEWMAConfig(0)).toThrow(RangeError)
    expect(() => createEWMAConfig(-1)).toThrow(RangeError)
  })
})

// ---------------------------------------------------------------------------
// calculateEWMAWithConfig
// ---------------------------------------------------------------------------

describe('calculateEWMAWithConfig', () => {
  it('calculateEWMA と同じ結果を返す', () => {
    const values = [100, 200, 300, 400]
    const config = createEWMAConfig(7)
    expect(calculateEWMAWithConfig(values, config)).toBe(calculateEWMA(values, 7))
  })
})

// ---------------------------------------------------------------------------
// 定数エクスポートの検証
// ---------------------------------------------------------------------------

describe('EWMA 定数', () => {
  it('フィットネス EWMA スパンは 42 日', () => {
    expect(FITNESS_EWMA_SPAN).toBe(42)
  })

  it('疲労 EWMA スパンは 7 日', () => {
    expect(FATIGUE_EWMA_SPAN).toBe(7)
  })
})

// ===========================================================================
// コンディショニングスコアエンジンテスト
// ===========================================================================

describe('calculateConditioningScore', () => {
  // -----------------------------------------------------------------------
  // スコア正規化（0-100 範囲）
  // -----------------------------------------------------------------------

  describe('スコア正規化', () => {
    it('スコアが 0-100 の範囲に収まる', () => {
      const history = makeHistory(42, 300)
      const today: ConditioningInput = {
        srpe: 300,
        sleepScore: 7,
        fatigueSubjective: 3,
      }
      const result = calculateConditioningScore(history, today)
      expect(result.conditioningScore).toBeGreaterThanOrEqual(0)
      expect(result.conditioningScore).toBeLessThanOrEqual(100)
    })

    it('空の履歴でもスコアを返す（中立値 50 に近い）', () => {
      const today: ConditioningInput = {
        srpe: 0,
        sleepScore: 7,
        fatigueSubjective: 3,
      }
      const result = calculateConditioningScore([], today)
      expect(result.conditioningScore).toBeGreaterThanOrEqual(0)
      expect(result.conditioningScore).toBeLessThanOrEqual(100)
    })

    it('単日の履歴でもエラーなく計算する', () => {
      const history = [makeDailyRow({ date: '2025-01-01', srpe: 500 })]
      const today: ConditioningInput = {
        srpe: 300,
        sleepScore: 8,
        fatigueSubjective: 2,
      }
      const result = calculateConditioningScore(history, today)
      expect(result.conditioningScore).toBeGreaterThanOrEqual(0)
      expect(result.conditioningScore).toBeLessThanOrEqual(100)
    })

    it('フィットネスと疲労が両方 0 の場合は 50（中立値）を返す', () => {
      const result = calculateConditioningScore([], {
        srpe: 0,
        sleepScore: 7,
        fatigueSubjective: 3,
      })
      expect(result.conditioningScore).toBe(50)
    })

    it('極端に高い sRPE でもスコアが 0-100 に収まる', () => {
      const history = makeHistory(42, 50)
      const today: ConditioningInput = {
        srpe: 5000,
        sleepScore: 1,
        fatigueSubjective: 10,
      }
      const result = calculateConditioningScore(history, today)
      expect(result.conditioningScore).toBeGreaterThanOrEqual(0)
      expect(result.conditioningScore).toBeLessThanOrEqual(100)
    })
  })

  // -----------------------------------------------------------------------
  // 主観ペナルティ
  // -----------------------------------------------------------------------

  describe('主観ペナルティ', () => {
    it('睡眠スコアが低い（<5）場合にペナルティが発生する', () => {
      const history = makeHistory(14, 300)
      const goodSleep: ConditioningInput = { srpe: 300, sleepScore: 8, fatigueSubjective: 3 }
      const poorSleep: ConditioningInput = { srpe: 300, sleepScore: 2, fatigueSubjective: 3 }

      const resultGood = calculateConditioningScore(history, goodSleep)
      const resultPoor = calculateConditioningScore(history, poorSleep)

      // 睡眠不良 → 疲労増加 → スコア低下
      expect(resultPoor.conditioningScore).toBeLessThan(resultGood.conditioningScore)
      expect(resultPoor.penalties.sleepPenalty).toBeGreaterThan(0)
      expect(resultGood.penalties.sleepPenalty).toBe(0)
    })

    it('睡眠スコアが閾値以上（>=5）ではペナルティなし', () => {
      const history = makeHistory(14, 300)
      const today: ConditioningInput = { srpe: 300, sleepScore: 5, fatigueSubjective: 3 }
      const result = calculateConditioningScore(history, today)
      expect(result.penalties.sleepPenalty).toBe(0)
    })

    it('主観的疲労が高い（>6）場合にペナルティが発生する', () => {
      const history = makeHistory(14, 300)
      const lowFatigue: ConditioningInput = { srpe: 300, sleepScore: 7, fatigueSubjective: 3 }
      const highFatigue: ConditioningInput = { srpe: 300, sleepScore: 7, fatigueSubjective: 9 }

      const resultLow = calculateConditioningScore(history, lowFatigue)
      const resultHigh = calculateConditioningScore(history, highFatigue)

      expect(resultHigh.conditioningScore).toBeLessThan(resultLow.conditioningScore)
      expect(resultHigh.penalties.fatiguePenalty).toBeGreaterThan(0)
      expect(resultLow.penalties.fatiguePenalty).toBe(0)
    })

    it('疲労スコアが閾値以下（<=6）ではペナルティなし', () => {
      const history = makeHistory(14, 300)
      const today: ConditioningInput = { srpe: 300, sleepScore: 7, fatigueSubjective: 6 }
      const result = calculateConditioningScore(history, today)
      expect(result.penalties.fatiguePenalty).toBe(0)
    })

    it('睡眠不良と高疲労が同時発生するとペナルティが蓄積する', () => {
      const history = makeHistory(14, 300)
      const worst: ConditioningInput = { srpe: 300, sleepScore: 1, fatigueSubjective: 10 }
      const result = calculateConditioningScore(history, worst)
      expect(result.penalties.sleepPenalty).toBeGreaterThan(0)
      expect(result.penalties.fatiguePenalty).toBeGreaterThan(0)
    })
  })

  // -----------------------------------------------------------------------
  // Pro Mode: HRV ペナルティ
  // -----------------------------------------------------------------------

  describe('Pro Mode (HRV)', () => {
    it('HRV と hrvBaseline が両方指定された場合に Pro Mode が有効になる', () => {
      const history = makeHistory(14, 300)
      const today: ConditioningInput = {
        srpe: 300,
        sleepScore: 7,
        fatigueSubjective: 3,
        hrv: 50,
        hrvBaseline: 60,
      }
      const result = calculateConditioningScore(history, today)
      expect(result.isProMode).toBe(true)
    })

    it('HRV が未指定の場合は Pro Mode が無効', () => {
      const history = makeHistory(14, 300)
      const today: ConditioningInput = { srpe: 300, sleepScore: 7, fatigueSubjective: 3 }
      const result = calculateConditioningScore(history, today)
      expect(result.isProMode).toBe(false)
      expect(result.penalties.hrvPenaltyCoefficient).toBeNull()
    })

    it('HRV がベースラインを下回ると疲労にペナルティ係数が適用される', () => {
      const history = makeHistory(14, 300)
      const base: ConditioningInput = {
        srpe: 300, sleepScore: 7, fatigueSubjective: 3,
        hrv: 60, hrvBaseline: 60,
      }
      const low: ConditioningInput = {
        srpe: 300, sleepScore: 7, fatigueSubjective: 3,
        hrv: 40, hrvBaseline: 60,
      }

      const resultBase = calculateConditioningScore(history, base)
      const resultLow = calculateConditioningScore(history, low)

      // HRV 低下 → ペナルティ係数適用 → スコア低下
      expect(resultLow.conditioningScore).toBeLessThan(resultBase.conditioningScore)
      expect(resultLow.penalties.hrvPenaltyCoefficient).toBeCloseTo(1 / 0.85, 5)
    })

    it('HRV がベースライン以上の場合はペナルティ係数が null', () => {
      const history = makeHistory(14, 300)
      const today: ConditioningInput = {
        srpe: 300, sleepScore: 7, fatigueSubjective: 3,
        hrv: 70, hrvBaseline: 60,
      }
      const result = calculateConditioningScore(history, today)
      expect(result.isProMode).toBe(true)
      expect(result.penalties.hrvPenaltyCoefficient).toBeNull()
    })

    it('HRV が 0 の場合は Pro Mode 無効', () => {
      const history = makeHistory(14, 300)
      const today: ConditioningInput = {
        srpe: 300, sleepScore: 7, fatigueSubjective: 3,
        hrv: 0, hrvBaseline: 60,
      }
      const result = calculateConditioningScore(history, today)
      expect(result.isProMode).toBe(false)
    })
  })

  // -----------------------------------------------------------------------
  // ACWR 計算
  // -----------------------------------------------------------------------

  describe('ACWR 計算', () => {
    it('均一な負荷で ACWR が 1.0 に近い', () => {
      // 28日以上の均一負荷
      const history = makeHistory(28, 300)
      const today: ConditioningInput = { srpe: 300, sleepScore: 7, fatigueSubjective: 3 }
      const result = calculateConditioningScore(history, today)
      expect(result.acwr).toBeCloseTo(1.0, 1)
    })

    it('直近の負荷急増で ACWR > 1.0', () => {
      // 慢性: 低負荷 21日 + 急性: 高負荷 7日
      const chronic = makeHistory(21, 100)
      const acute = Array.from({ length: 7 }, (_, i) =>
        makeDailyRow({ date: `2025-01-${String(22 + i).padStart(2, '0')}`, srpe: 600 })
      )
      const history = [...chronic, ...acute]
      const today: ConditioningInput = { srpe: 600, sleepScore: 7, fatigueSubjective: 3 }
      const result = calculateConditioningScore(history, today)
      expect(result.acwr).toBeGreaterThan(1.0)
    })

    it('履歴なし（全て 0）の場合に ACWR が 0', () => {
      const result = calculateConditioningScore([], {
        srpe: 0, sleepScore: 7, fatigueSubjective: 3,
      })
      expect(result.acwr).toBe(0)
    })
  })

  // -----------------------------------------------------------------------
  // 出力構造の検証
  // -----------------------------------------------------------------------

  describe('出力構造', () => {
    it('全ての必須フィールドが返される', () => {
      const history = makeHistory(14, 300)
      const today: ConditioningInput = { srpe: 300, sleepScore: 7, fatigueSubjective: 3 }
      const result = calculateConditioningScore(history, today)

      expect(result).toHaveProperty('conditioningScore')
      expect(result).toHaveProperty('fitnessEwma')
      expect(result).toHaveProperty('fatigueEwma')
      expect(result).toHaveProperty('acwr')
      expect(result).toHaveProperty('isProMode')
      expect(result).toHaveProperty('penalties')
      expect(result.penalties).toHaveProperty('sleepPenalty')
      expect(result.penalties).toHaveProperty('fatiguePenalty')
      expect(result.penalties).toHaveProperty('hrvPenaltyCoefficient')
    })

    it('数値は適切な精度で丸められている', () => {
      const history = makeHistory(14, 333)
      const today: ConditioningInput = { srpe: 333, sleepScore: 7, fatigueSubjective: 3 }
      const result = calculateConditioningScore(history, today)

      // conditioningScore: 小数第1位
      expect(result.conditioningScore).toBe(Math.round(result.conditioningScore * 10) / 10)
      // fitnessEwma / fatigueEwma: 小数第2位
      expect(result.fitnessEwma).toBe(Math.round(result.fitnessEwma * 100) / 100)
      // acwr: 小数第3位
      expect(result.acwr).toBe(Math.round(result.acwr * 1000) / 1000)
    })
  })

  // -----------------------------------------------------------------------
  // Sprint 7 回帰テスト
  // -----------------------------------------------------------------------

  describe('Sprint 7 回帰テスト', () => {
    it('42日定常負荷 → スコアが 40-60 の範囲（中立付近）', () => {
      const history = makeHistory(42, 300)
      const today: ConditioningInput = { srpe: 300, sleepScore: 7, fatigueSubjective: 3 }
      const result = calculateConditioningScore(history, today)
      // 定常状態ではフィットネスと疲労が均衡 → 50 付近
      expect(result.conditioningScore).toBeGreaterThanOrEqual(40)
      expect(result.conditioningScore).toBeLessThanOrEqual(60)
    })

    it('テーパーシナリオ: 高負荷→低負荷 → スコア > 60', () => {
      // 前半28日: 高負荷 → 後半14日: 低負荷（テーパリング）
      const highLoad = Array.from({ length: 28 }, (_, i) =>
        makeDailyRow({ date: `2025-01-${String(i + 1).padStart(2, '0')}`, srpe: 600 })
      )
      const lowLoad = Array.from({ length: 14 }, (_, i) =>
        makeDailyRow({ date: `2025-02-${String(i + 1).padStart(2, '0')}`, srpe: 100 })
      )
      const history = [...highLoad, ...lowLoad]
      const today: ConditioningInput = { srpe: 100, sleepScore: 8, fatigueSubjective: 2 }
      const result = calculateConditioningScore(history, today)
      // テーパリング → フィットネス維持 + 疲労回復 → 高スコア
      expect(result.conditioningScore).toBeGreaterThan(60)
    })

    it('オーバーリーチ: 低負荷→高負荷 → スコア < 50', () => {
      // 前半28日: 低負荷 → 後半14日: 急激な高負荷
      const lowLoad = Array.from({ length: 28 }, (_, i) =>
        makeDailyRow({ date: `2025-01-${String(i + 1).padStart(2, '0')}`, srpe: 100 })
      )
      const highLoad = Array.from({ length: 14 }, (_, i) =>
        makeDailyRow({ date: `2025-02-${String(i + 1).padStart(2, '0')}`, srpe: 800 })
      )
      const history = [...lowLoad, ...highLoad]
      const today: ConditioningInput = { srpe: 800, sleepScore: 4, fatigueSubjective: 8 }
      const result = calculateConditioningScore(history, today)
      // オーバーリーチ → 疲労 > フィットネス → 低スコア
      expect(result.conditioningScore).toBeLessThan(50)
    })

    it('最悪ケース: 睡眠1 + 疲労10 + HRV低下 → 最低スコア領域', () => {
      const history = makeHistory(14, 200)
      const today: ConditioningInput = {
        srpe: 800,
        sleepScore: 1,
        fatigueSubjective: 10,
        hrv: 30,
        hrvBaseline: 60,
      }
      const result = calculateConditioningScore(history, today)
      // 全ペナルティ最大 → 極めて低いスコア
      expect(result.conditioningScore).toBeLessThan(30)
      expect(result.penalties.sleepPenalty).toBeGreaterThan(0)
      expect(result.penalties.fatiguePenalty).toBeGreaterThan(0)
      expect(result.penalties.hrvPenaltyCoefficient).toBeCloseTo(1 / 0.85, 5)
    })
  })
})

/**
 * tests/unit/staged-zscore.test.ts
 * ============================================================
 * 段階的 Z-Score 重み付けの単体テスト
 *
 * Go エンジン GraduatedZScoreWeight() との一致を検証:
 *   Day  0-13: 0.0  (Z-Score 未使用)
 *   Day 14-21: 0.5  (学習初期)
 *   Day 22-27: 0.75 (学習後期)
 *   Day 28+  : 1.0  (完全モード)
 * ============================================================
 */

import { describe, it, expect } from 'vitest'
import { getZScoreStageWeight } from '../../lib/engine/v6/nodes/node2-feature-engineering'
import { Z_SCORE_STAGES } from '../../lib/engine/v6/config'
import type { ZScoreStage } from '../../lib/engine/v6/types'

// ---------------------------------------------------------------------------
// getZScoreStageWeight — Go GraduatedZScoreWeight 準拠テスト
// ---------------------------------------------------------------------------

describe('getZScoreStageWeight', () => {
  // Day 0-13: weight = 0.0
  it('Day 0 → weight 0.0', () => {
    expect(getZScoreStageWeight(0)).toBe(0.0)
  })

  it('Day 7 → weight 0.0', () => {
    expect(getZScoreStageWeight(7)).toBe(0.0)
  })

  it('Day 13 (boundary) → weight 0.0', () => {
    expect(getZScoreStageWeight(13)).toBe(0.0)
  })

  // Day 14-21: weight = 0.5
  it('Day 14 (boundary) → weight 0.5', () => {
    expect(getZScoreStageWeight(14)).toBe(0.5)
  })

  it('Day 18 → weight 0.5', () => {
    expect(getZScoreStageWeight(18)).toBe(0.5)
  })

  it('Day 21 (boundary) → weight 0.5', () => {
    expect(getZScoreStageWeight(21)).toBe(0.5)
  })

  // Day 22-27: weight = 0.75
  it('Day 22 (boundary) → weight 0.75', () => {
    expect(getZScoreStageWeight(22)).toBe(0.75)
  })

  it('Day 25 → weight 0.75', () => {
    expect(getZScoreStageWeight(25)).toBe(0.75)
  })

  it('Day 27 (boundary) → weight 0.75', () => {
    expect(getZScoreStageWeight(27)).toBe(0.75)
  })

  // Day 28+: weight = 1.0
  it('Day 28 (boundary) → weight 1.0', () => {
    expect(getZScoreStageWeight(28)).toBe(1.0)
  })

  it('Day 100 → weight 1.0', () => {
    expect(getZScoreStageWeight(100)).toBe(1.0)
  })

  it('Day 365 → weight 1.0', () => {
    expect(getZScoreStageWeight(365)).toBe(1.0)
  })
})

// ---------------------------------------------------------------------------
// Z_SCORE_STAGES 設定値の整合性チェック
// ---------------------------------------------------------------------------

describe('Z_SCORE_STAGES config', () => {
  it('4 段階が定義されている', () => {
    expect(Z_SCORE_STAGES).toHaveLength(4)
  })

  it('全区間が隙間なく連続している', () => {
    for (let i = 1; i < Z_SCORE_STAGES.length; i++) {
      expect(Z_SCORE_STAGES[i]!.minDays).toBe(Z_SCORE_STAGES[i - 1]!.maxDays + 1)
    }
  })

  it('重みが単調増加している', () => {
    for (let i = 1; i < Z_SCORE_STAGES.length; i++) {
      expect(Z_SCORE_STAGES[i]!.weight).toBeGreaterThanOrEqual(Z_SCORE_STAGES[i - 1]!.weight)
    }
  })

  it('最初の区間が Day 0 から開始', () => {
    expect(Z_SCORE_STAGES[0]!.minDays).toBe(0)
  })

  it('最後の区間が Infinity まで', () => {
    expect(Z_SCORE_STAGES[Z_SCORE_STAGES.length - 1]!.maxDays).toBe(Infinity)
  })
})

// ---------------------------------------------------------------------------
// カスタムステージ設定のテスト
// ---------------------------------------------------------------------------

describe('getZScoreStageWeight with custom stages', () => {
  const customStages: ZScoreStage[] = [
    { minDays: 0, maxDays: 6, weight: 0.0 },
    { minDays: 7, maxDays: 13, weight: 0.25 },
    { minDays: 14, maxDays: Infinity, weight: 1.0 },
  ]

  it('カスタム 3 段階: Day 5 → 0.0', () => {
    expect(getZScoreStageWeight(5, customStages)).toBe(0.0)
  })

  it('カスタム 3 段階: Day 10 → 0.25', () => {
    expect(getZScoreStageWeight(10, customStages)).toBe(0.25)
  })

  it('カスタム 3 段階: Day 14 → 1.0', () => {
    expect(getZScoreStageWeight(14, customStages)).toBe(1.0)
  })
})

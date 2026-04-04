/**
 * tests/unit/posterior-updater.test.ts
 * ============================================================
 * ベイズ事後確率更新エンジン単体テスト
 *
 * 対象: lib/assessment/posterior-updater.ts
 *   - initializePriors()          — 事前確率初期化
 *   - updatePosteriors()          — ベイズ更新
 *   - normalizeWithMutualExclusion() — 排他グループ正規化
 * ============================================================
 */

import { describe, it, expect } from 'vitest'
import {
  initializePriors,
  updatePosteriors,
  normalizeWithMutualExclusion,
} from '../../lib/assessment/posterior-updater'
import type { AssessmentNode, AnswerValue } from '../../lib/assessment/types'

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

function makeNode(overrides: Partial<AssessmentNode> & { node_id: string; target_axis: string }): AssessmentNode {
  return {
    file_type: 'F1',
    phase: 'acute',
    category: 'knee',
    question_text: `質問: ${overrides.node_id}`,
    lr_yes: 5.0,
    lr_no: 0.2,
    kappa: 1.0,
    routing_rules_json: null,
    prescription_tags_json: null,
    contraindication_tags_json: null,
    time_decay_lambda: null,
    base_prevalence: 0.1,
    mutual_exclusive_group: null,
    ...overrides,
  }
}

/** 事後確率マップの合計が 1.0 に近いことを検証する */
function expectSumToOne(posteriors: Map<string, number>, tolerance = 1e-6) {
  const sum = Array.from(posteriors.values()).reduce((s, p) => s + p, 0)
  expect(sum).toBeCloseTo(1.0, -Math.log10(tolerance))
}

// ===========================================================================
// initializePriors テスト
// ===========================================================================

describe('initializePriors', () => {
  it('ユニークな診断軸ごとに事前確率を初期化する', () => {
    const nodes = [
      makeNode({ node_id: 'n1', target_axis: 'ACL_tear', base_prevalence: 0.15 }),
      makeNode({ node_id: 'n2', target_axis: 'meniscus', base_prevalence: 0.20 }),
      makeNode({ node_id: 'n3', target_axis: 'patella', base_prevalence: 0.10 }),
    ]

    const priors = initializePriors(nodes)
    expect(priors.size).toBe(3)
    expect(priors.has('ACL_tear')).toBe(true)
    expect(priors.has('meniscus')).toBe(true)
    expect(priors.has('patella')).toBe(true)
  })

  it('合計が 1.0 に正規化される', () => {
    const nodes = [
      makeNode({ node_id: 'n1', target_axis: 'A', base_prevalence: 0.3 }),
      makeNode({ node_id: 'n2', target_axis: 'B', base_prevalence: 0.5 }),
      makeNode({ node_id: 'n3', target_axis: 'C', base_prevalence: 0.2 }),
    ]

    const priors = initializePriors(nodes)
    expectSumToOne(priors)
  })

  it('同一 target_axis の複数ノードは最大 base_prevalence を使用', () => {
    const nodes = [
      makeNode({ node_id: 'n1', target_axis: 'ACL_tear', base_prevalence: 0.10 }),
      makeNode({ node_id: 'n2', target_axis: 'ACL_tear', base_prevalence: 0.20 }),
      makeNode({ node_id: 'n3', target_axis: 'meniscus', base_prevalence: 0.15 }),
    ]

    const priors = initializePriors(nodes)
    expect(priors.size).toBe(2) // ACL_tear, meniscus
    // ACL_tear の事前確率 > meniscus の事前確率 (正規化後も比率維持)
    expect(priors.get('ACL_tear')!).toBeGreaterThan(priors.get('meniscus')!)
  })

  it('base_prevalence の比率が正規化後も維持される', () => {
    const nodes = [
      makeNode({ node_id: 'n1', target_axis: 'A', base_prevalence: 0.4 }),
      makeNode({ node_id: 'n2', target_axis: 'B', base_prevalence: 0.2 }),
    ]

    const priors = initializePriors(nodes)
    // A は B の 2 倍の事前確率を持つべき
    expect(priors.get('A')! / priors.get('B')!).toBeCloseTo(2.0, 5)
  })
})

// ===========================================================================
// updatePosteriors テスト
// ===========================================================================

describe('updatePosteriors', () => {
  it('yes 回答で LR_yes によるベイズ更新が適用される', () => {
    const priors = new Map([
      ['ACL_tear', 0.3],
      ['meniscus', 0.4],
      ['patella', 0.3],
    ])
    const node = makeNode({
      node_id: 'n1',
      target_axis: 'ACL_tear',
      lr_yes: 10.0,
      lr_no: 0.1,
      kappa: 1.0,
    })

    const updated = updatePosteriors(priors, node, 'yes')

    // ACL_tear の事後確率が大幅に上昇
    expect(updated.get('ACL_tear')!).toBeGreaterThan(priors.get('ACL_tear')!)
    // 他の仮説は相対的に低下
    expect(updated.get('meniscus')!).toBeLessThan(priors.get('meniscus')!)
    expectSumToOne(updated)
  })

  it('no 回答で LR_no によるベイズ更新が適用される', () => {
    const priors = new Map([
      ['ACL_tear', 0.5],
      ['meniscus', 0.3],
      ['patella', 0.2],
    ])
    const node = makeNode({
      node_id: 'n1',
      target_axis: 'ACL_tear',
      lr_yes: 10.0,
      lr_no: 0.1,
      kappa: 1.0,
    })

    const updated = updatePosteriors(priors, node, 'no')

    // ACL_tear の事後確率が低下
    expect(updated.get('ACL_tear')!).toBeLessThan(priors.get('ACL_tear')!)
    // 他の仮説は相対的に上昇
    expect(updated.get('meniscus')!).toBeGreaterThan(priors.get('meniscus')!)
    expectSumToOne(updated)
  })

  it('unknown 回答では事後確率が変化しない（LR=1.0）', () => {
    const priors = new Map([
      ['ACL_tear', 0.4],
      ['meniscus', 0.35],
      ['patella', 0.25],
    ])
    const node = makeNode({
      node_id: 'n1',
      target_axis: 'ACL_tear',
      lr_yes: 10.0,
      lr_no: 0.1,
    })

    const updated = updatePosteriors(priors, node, 'unknown')

    // 全て元の値と同じ
    for (const [key, value] of priors) {
      expect(updated.get(key)!).toBeCloseTo(value, 10)
    }
    expectSumToOne(updated)
  })

  it('更新後も全事後確率の合計が 1.0', () => {
    const priors = new Map([
      ['A', 0.25],
      ['B', 0.25],
      ['C', 0.25],
      ['D', 0.25],
    ])
    const node = makeNode({
      node_id: 'n1',
      target_axis: 'A',
      lr_yes: 15.0,
      kappa: 0.9,
    })

    const updated = updatePosteriors(priors, node, 'yes')
    expectSumToOne(updated)
  })

  it('κ 調整: κ が低いと LR の影響が減衰する', () => {
    const priors = new Map([
      ['ACL_tear', 0.3],
      ['meniscus', 0.4],
      ['patella', 0.3],
    ])

    const highKappaNode = makeNode({
      node_id: 'n1',
      target_axis: 'ACL_tear',
      lr_yes: 10.0,
      kappa: 1.0,  // 完全一致
    })
    const lowKappaNode = makeNode({
      node_id: 'n2',
      target_axis: 'ACL_tear',
      lr_yes: 10.0,
      kappa: 0.3,  // 低い信頼度
    })

    const updatedHigh = updatePosteriors(priors, highKappaNode, 'yes')
    const updatedLow = updatePosteriors(priors, lowKappaNode, 'yes')

    // κ が高い方が ACL_tear の事後確率上昇が大きい
    expect(updatedHigh.get('ACL_tear')!).toBeGreaterThan(updatedLow.get('ACL_tear')!)
    expectSumToOne(updatedHigh)
    expectSumToOne(updatedLow)
  })

  it('κ = 0 の場合、LR は 1.0 になり事後確率が変化しない', () => {
    const priors = new Map([
      ['A', 0.5],
      ['B', 0.5],
    ])
    const node = makeNode({
      node_id: 'n1',
      target_axis: 'A',
      lr_yes: 100.0,
      kappa: 0,
    })

    const updated = updatePosteriors(priors, node, 'yes')
    // κ=0 → LR_adjusted = 1.0 → 事後確率は変わらない（正規化後も同じ）
    expect(updated.get('A')!).toBeCloseTo(0.5, 5)
    expect(updated.get('B')!).toBeCloseTo(0.5, 5)
    expectSumToOne(updated)
  })

  it('連続更新でも事後確率の合計が 1.0 を維持する', () => {
    let posteriors = new Map([
      ['A', 0.25],
      ['B', 0.25],
      ['C', 0.25],
      ['D', 0.25],
    ])

    const updates: Array<{ target: string; answer: AnswerValue }> = [
      { target: 'A', answer: 'yes' },
      { target: 'B', answer: 'no' },
      { target: 'C', answer: 'yes' },
      { target: 'A', answer: 'yes' },
      { target: 'D', answer: 'no' },
    ]

    for (const { target, answer } of updates) {
      const node = makeNode({
        node_id: `node_${target}`,
        target_axis: target,
        lr_yes: 5.0,
        lr_no: 0.2,
        kappa: 0.8,
      })
      posteriors = updatePosteriors(posteriors, node, answer)
      expectSumToOne(posteriors)
    }
  })

  it('LR_yes が非常に大きい場合でも数値的に安定する', () => {
    const priors = new Map([
      ['A', 0.01],
      ['B', 0.99],
    ])
    const node = makeNode({
      node_id: 'n1',
      target_axis: 'A',
      lr_yes: 1000.0,
      kappa: 1.0,
    })

    const updated = updatePosteriors(priors, node, 'yes')
    // 数値的に安定していて NaN/Infinity にならない
    for (const value of updated.values()) {
      expect(Number.isFinite(value)).toBe(true)
      expect(value).toBeGreaterThan(0)
    }
    expectSumToOne(updated)
  })
})

// ===========================================================================
// normalizeWithMutualExclusion テスト
// ===========================================================================

describe('normalizeWithMutualExclusion', () => {
  it('排他グループがないノードではそのまま正規化される', () => {
    const posteriors = new Map([
      ['A', 0.6],
      ['B', 0.3],
      ['C', 0.1],
    ])
    const nodes = [
      makeNode({ node_id: 'n1', target_axis: 'A', mutual_exclusive_group: null }),
      makeNode({ node_id: 'n2', target_axis: 'B', mutual_exclusive_group: null }),
    ]

    const result = normalizeWithMutualExclusion(posteriors, nodes)
    expectSumToOne(result)
    // 比率が維持される
    expect(result.get('A')! / result.get('B')!).toBeCloseTo(2.0, 3)
  })

  it('排他グループありでも合計 1.0 が維持される', () => {
    const posteriors = new Map([
      ['ACL_tear', 0.4],
      ['meniscus', 0.3],
      ['patella', 0.2],
      ['other', 0.1],
    ])
    const nodes = [
      makeNode({ node_id: 'n1', target_axis: 'ACL_tear', mutual_exclusive_group: 'knee_ligament' }),
      makeNode({ node_id: 'n2', target_axis: 'meniscus', mutual_exclusive_group: 'knee_ligament' }),
      makeNode({ node_id: 'n3', target_axis: 'patella', mutual_exclusive_group: null }),
    ]

    const result = normalizeWithMutualExclusion(posteriors, nodes)
    expectSumToOne(result)
  })

  it('空のノードリストでもエラーにならない', () => {
    const posteriors = new Map([['A', 0.5], ['B', 0.5]])
    const result = normalizeWithMutualExclusion(posteriors, [])
    expectSumToOne(result)
  })
})

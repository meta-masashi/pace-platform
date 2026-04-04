/**
 * tests/unit/cat-engine.test.ts
 * ============================================================
 * CAT（Computerized Adaptive Testing）エンジン単体テスト
 *
 * 対象: lib/assessment/cat-engine.ts
 *   - selectNextQuestion()  — 情報利得に基づく質問選択
 *   - shouldTerminate()     — 終了条件判定
 *   - checkRedFlags()       — レッドフラグ検出
 *   - buildAssessmentResult() — 結果構築
 * ============================================================
 */

import { describe, it, expect } from 'vitest'
import {
  selectNextQuestion,
  shouldTerminate,
  checkRedFlags,
  buildAssessmentResult,
} from '../../lib/assessment/cat-engine'
import type {
  AssessmentNode,
  AssessmentResponse,
} from '../../lib/assessment/types'

// ---------------------------------------------------------------------------
// テストフィクスチャ
// ---------------------------------------------------------------------------

function makeNode(overrides: Partial<AssessmentNode> & { node_id: string; target_axis: string }): AssessmentNode {
  return {
    file_type: 'F1',
    phase: 'acute',
    category: 'knee',
    question_text: `質問: ${overrides.node_id}`,
    lr_yes: 5.0,
    lr_no: 0.2,
    kappa: 0.8,
    routing_rules_json: null,
    prescription_tags_json: null,
    contraindication_tags_json: null,
    time_decay_lambda: null,
    base_prevalence: 0.1,
    mutual_exclusive_group: null,
    ...overrides,
  }
}

function makeResponse(nodeId: string, answer: 'yes' | 'no' | 'unknown' = 'yes'): AssessmentResponse {
  return {
    nodeId,
    answer,
    timestamp: new Date().toISOString(),
  }
}

/** 3 つの診断軸を持つテストノード群 */
function createTestNodes(): AssessmentNode[] {
  return [
    makeNode({ node_id: 'n1', target_axis: 'ACL_tear', lr_yes: 8.0, lr_no: 0.1, base_prevalence: 0.15 }),
    makeNode({ node_id: 'n2', target_axis: 'meniscus', lr_yes: 4.0, lr_no: 0.3, base_prevalence: 0.2 }),
    makeNode({ node_id: 'n3', target_axis: 'patella', lr_yes: 3.0, lr_no: 0.4, base_prevalence: 0.1 }),
    makeNode({ node_id: 'n4', target_axis: 'ACL_tear', lr_yes: 6.0, lr_no: 0.15, base_prevalence: 0.15 }),
    makeNode({ node_id: 'n5', target_axis: 'meniscus', lr_yes: 2.0, lr_no: 0.5, base_prevalence: 0.2 }),
  ]
}

/** 均等事前確率マップ */
function uniformPosteriors(axes: string[]): Map<string, number> {
  const p = 1 / axes.length
  return new Map(axes.map((a) => [a, p]))
}

// ===========================================================================
// selectNextQuestion テスト
// ===========================================================================

describe('selectNextQuestion', () => {
  it('未回答ノードの中から情報利得が最大の質問を選択する', () => {
    const nodes = createTestNodes()
    const posteriors = uniformPosteriors(['ACL_tear', 'meniscus', 'patella'])
    const responses: AssessmentResponse[] = []

    const result = selectNextQuestion(nodes, responses, posteriors)
    expect(result).not.toBeNull()
    expect(result!.nodeId).toBeTruthy()
    expect(result!.informationGain).toBeGreaterThan(0)
  })

  it('情報利得が正の値を返す（エントロピーが減少する方向）', () => {
    const nodes = createTestNodes()
    const posteriors = uniformPosteriors(['ACL_tear', 'meniscus', 'patella'])
    const result = selectNextQuestion(nodes, [], posteriors)
    expect(result!.informationGain).toBeGreaterThanOrEqual(0)
  })

  it('高い LR を持つノードが優先的に選択される傾向', () => {
    // LR_yes が大きいノード（n1: LR=8.0）が選ばれやすい
    const nodes = [
      makeNode({ node_id: 'low_lr', target_axis: 'ACL_tear', lr_yes: 1.5, lr_no: 0.9 }),
      makeNode({ node_id: 'high_lr', target_axis: 'ACL_tear', lr_yes: 20.0, lr_no: 0.05 }),
    ]
    const posteriors = uniformPosteriors(['ACL_tear', 'meniscus'])
    const result = selectNextQuestion(nodes, [], posteriors)
    expect(result!.nodeId).toBe('high_lr')
  })

  it('全ノード回答済みの場合は null を返す', () => {
    const nodes = [makeNode({ node_id: 'n1', target_axis: 'ACL_tear' })]
    const responses = [makeResponse('n1')]
    const posteriors = uniformPosteriors(['ACL_tear'])

    const result = selectNextQuestion(nodes, responses, posteriors)
    expect(result).toBeNull()
  })

  it('回答済みのノードは候補から除外される', () => {
    const nodes = createTestNodes()
    const responses = [makeResponse('n1')]
    const posteriors = uniformPosteriors(['ACL_tear', 'meniscus', 'patella'])

    const result = selectNextQuestion(nodes, responses, posteriors)
    expect(result).not.toBeNull()
    expect(result!.nodeId).not.toBe('n1')
  })

  it('進捗率 (progress) が 0-100 の範囲で返される', () => {
    const nodes = createTestNodes()
    const posteriors = uniformPosteriors(['ACL_tear', 'meniscus', 'patella'])
    const result = selectNextQuestion(nodes, [], posteriors)
    expect(result!.progress).toBeGreaterThanOrEqual(0)
    expect(result!.progress).toBeLessThanOrEqual(100)
  })
})

// ===========================================================================
// shouldTerminate テスト
// ===========================================================================

describe('shouldTerminate', () => {
  it('最大事後確率 > 0.85 で "high_confidence" を返す', () => {
    const posteriors = new Map([
      ['ACL_tear', 0.90],
      ['meniscus', 0.07],
      ['patella', 0.03],
    ])
    expect(shouldTerminate(posteriors, 5)).toBe('high_confidence')
  })

  it('最大事後確率 <= 0.85 では high_confidence にならない', () => {
    const posteriors = new Map([
      ['ACL_tear', 0.80],
      ['meniscus', 0.15],
      ['patella', 0.05],
    ])
    expect(shouldTerminate(posteriors, 5)).toBeNull()
  })

  it('回答数 >= 30 で "max_questions" を返す', () => {
    const posteriors = uniformPosteriors(['ACL_tear', 'meniscus', 'patella'])
    expect(shouldTerminate(posteriors, 30)).toBe('max_questions')
    expect(shouldTerminate(posteriors, 35)).toBe('max_questions')
  })

  it('高信頼かつ最大質問数超過の場合は "high_confidence" が優先される', () => {
    const posteriors = new Map([
      ['ACL_tear', 0.95],
      ['meniscus', 0.03],
      ['patella', 0.02],
    ])
    // high_confidence チェックが max_questions より先
    expect(shouldTerminate(posteriors, 35)).toBe('high_confidence')
  })

  it('条件を満たさない場合は null を返す', () => {
    const posteriors = uniformPosteriors(['ACL_tear', 'meniscus', 'patella'])
    expect(shouldTerminate(posteriors, 5)).toBeNull()
  })

  it('情報利得 < 0.01 のとき "diminishing_returns" を返す（ノード・回答提供時）', () => {
    // ほぼ確定した状態で残りノードの情報利得が低い場合
    const posteriors = new Map([
      ['ACL_tear', 0.84],  // 閾値ギリギリ以下
      ['meniscus', 0.10],
      ['patella', 0.06],
    ])
    // 全ノード回答済みに近い状態を作る → selectNextQuestion が低い情報利得を返す
    const nodes = [
      makeNode({ node_id: 'n1', target_axis: 'ACL_tear', lr_yes: 1.001, lr_no: 0.999 }), // LR ≈ 1 → 情報利得ほぼ 0
    ]
    const responses: AssessmentResponse[] = []
    const reason = shouldTerminate(posteriors, 5, nodes, responses)
    expect(reason).toBe('diminishing_returns')
  })
})

// ===========================================================================
// checkRedFlags テスト
// ===========================================================================

describe('checkRedFlags', () => {
  it('routing_rules_json が null の場合は null を返す', () => {
    const node = makeNode({ node_id: 'n1', target_axis: 'ACL_tear', routing_rules_json: null })
    expect(checkRedFlags(node, 'yes')).toBeNull()
  })

  it('red_flags が空配列の場合は null を返す', () => {
    const node = makeNode({
      node_id: 'n1',
      target_axis: 'ACL_tear',
      routing_rules_json: { red_flags: [] },
    })
    expect(checkRedFlags(node, 'yes')).toBeNull()
  })

  it('trigger_answer に一致する場合にレッドフラグを返す', () => {
    const node = makeNode({
      node_id: 'n1',
      target_axis: 'ACL_tear',
      routing_rules_json: {
        red_flags: [
          {
            trigger_answer: 'yes',
            severity: 'critical',
            description: '重度の不安定性が疑われます',
            hard_lock: true,
          },
        ],
      },
    })

    const result = checkRedFlags(node, 'yes')
    expect(result).not.toBeNull()
    expect(result!.severity).toBe('critical')
    expect(result!.hardLock).toBe(true)
    expect(result!.description).toContain('重度')
  })

  it('trigger_answer に一致しない場合は null を返す', () => {
    const node = makeNode({
      node_id: 'n1',
      target_axis: 'ACL_tear',
      routing_rules_json: {
        red_flags: [
          {
            trigger_answer: 'yes',
            severity: 'critical',
            description: '重度の不安定性',
            hard_lock: true,
          },
        ],
      },
    })

    expect(checkRedFlags(node, 'no')).toBeNull()
    expect(checkRedFlags(node, 'unknown')).toBeNull()
  })

  it('複数のレッドフラグ条件のうち最初に一致したものを返す', () => {
    const node = makeNode({
      node_id: 'n1',
      target_axis: 'ACL_tear',
      routing_rules_json: {
        red_flags: [
          {
            trigger_answer: 'yes',
            severity: 'high',
            description: '高リスク',
            hard_lock: false,
          },
          {
            trigger_answer: 'yes',
            severity: 'critical',
            description: '最高リスク',
            hard_lock: true,
          },
        ],
      },
    })

    const result = checkRedFlags(node, 'yes')
    expect(result!.severity).toBe('high')
    expect(result!.description).toBe('高リスク')
  })
})

// ===========================================================================
// buildAssessmentResult テスト
// ===========================================================================

describe('buildAssessmentResult', () => {
  it('事後確率の降順で鑑別診断が並ぶ', () => {
    const posteriors = new Map([
      ['ACL_tear', 0.50],
      ['meniscus', 0.30],
      ['patella', 0.20],
    ])
    const nodes = createTestNodes()
    const result = buildAssessmentResult(posteriors, [], nodes, [], 'high_confidence')

    expect(result.primaryDiagnosis).toBe('ACL_tear')
    expect(result.differentials[0]!.diagnosisCode).toBe('ACL_tear')
    expect(result.differentials[1]!.diagnosisCode).toBe('meniscus')
    expect(result.differentials[2]!.diagnosisCode).toBe('patella')
  })

  it('上位 5 件の鑑別診断のみ返される', () => {
    const posteriors = new Map(
      Array.from({ length: 10 }, (_, i) => [`diag_${i}`, 0.1] as [string, number])
    )
    const nodes = Array.from({ length: 10 }, (_, i) =>
      makeNode({ node_id: `n${i}`, target_axis: `diag_${i}` })
    )
    const result = buildAssessmentResult(posteriors, [], nodes, [], 'max_questions')
    expect(result.differentials.length).toBeLessThanOrEqual(5)
  })

  it('レッドフラグ情報が結果に含まれる', () => {
    const posteriors = new Map([['ACL_tear', 1.0]])
    const redFlags = [
      { nodeId: 'n1', severity: 'critical' as const, description: '重度', hardLock: true },
    ]
    const result = buildAssessmentResult(posteriors, [], [], redFlags, 'red_flag')
    expect(result.redFlags).toHaveLength(1)
    expect(result.redFlags[0]!.severity).toBe('critical')
  })

  it('yes 回答の処方タグ・禁忌タグが集計される', () => {
    const nodes = [
      makeNode({
        node_id: 'n1',
        target_axis: 'ACL_tear',
        prescription_tags_json: ['quad_strengthening'],
        contraindication_tags_json: ['high_impact'],
      }),
    ]
    const responses = [makeResponse('n1', 'yes')]
    const posteriors = new Map([['ACL_tear', 1.0]])

    const result = buildAssessmentResult(posteriors, responses, nodes, [], 'high_confidence')
    expect(result.prescriptionTags).toContain('quad_strengthening')
    expect(result.contraindicationTags).toContain('high_impact')
  })

  it('no 回答のタグは集計されない', () => {
    const nodes = [
      makeNode({
        node_id: 'n1',
        target_axis: 'ACL_tear',
        prescription_tags_json: ['quad_strengthening'],
        contraindication_tags_json: ['high_impact'],
      }),
    ]
    const responses = [makeResponse('n1', 'no')]
    const posteriors = new Map([['ACL_tear', 0.5]])

    const result = buildAssessmentResult(posteriors, responses, nodes, [], 'max_questions')
    expect(result.prescriptionTags).toHaveLength(0)
    expect(result.contraindicationTags).toHaveLength(0)
  })

  it('信頼区間 [lower, upper] が返される', () => {
    const posteriors = new Map([['ACL_tear', 0.8]])
    const responses = Array.from({ length: 10 }, (_, i) => makeResponse(`n${i}`))
    const result = buildAssessmentResult(posteriors, responses, [], [], 'high_confidence')

    const ci = result.differentials[0]!.confidence
    expect(ci).toHaveLength(2)
    expect(ci[0]).toBeLessThanOrEqual(ci[1])
    expect(ci[0]).toBeGreaterThanOrEqual(0)
    expect(ci[1]).toBeLessThanOrEqual(1)
  })
})

// ===========================================================================
// 進捗率計算テスト（selectNextQuestion 経由）
// ===========================================================================

describe('進捗率計算', () => {
  it('信頼度が低い段階では進捗率も低い', () => {
    const nodes = createTestNodes()
    const posteriors = uniformPosteriors(['ACL_tear', 'meniscus', 'patella'])
    const result = selectNextQuestion(nodes, [], posteriors)
    // 均等分布 → maxPosterior = 0.333 → progress ≈ 0%
    expect(result!.progress).toBeLessThanOrEqual(20)
  })

  it('信頼度が高くなると進捗率も高くなる', () => {
    const nodes = createTestNodes()
    const posteriors = new Map([
      ['ACL_tear', 0.75],
      ['meniscus', 0.15],
      ['patella', 0.10],
    ])
    const result = selectNextQuestion(nodes, [], posteriors)
    expect(result!.progress).toBeGreaterThan(50)
  })
})

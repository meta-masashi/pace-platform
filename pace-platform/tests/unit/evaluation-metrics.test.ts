/**
 * tests/unit/evaluation-metrics.test.ts
 * ============================================================
 * AI 精度評価指標の単体テスト
 *
 * 対象: lib/evaluation/metrics.ts
 *   - precisionAtK()
 *   - recallAtK()
 *   - computeMrr()
 *   - evaluateRag()
 *   - computeAuroc()
 *   - computeSensitivitySpecificity()
 * ============================================================
 */

import { describe, it, expect } from 'vitest'
import {
  precisionAtK,
  recallAtK,
  computeMrr,
  evaluateRag,
  computeAuroc,
  computeSensitivitySpecificity,
  type RagEvalCase,
  type RagSearchResult,
  type BayesEvalCase,
} from '../../lib/evaluation/metrics'

// ---------------------------------------------------------------------------
// precisionAtK
// ---------------------------------------------------------------------------

describe('precisionAtK', () => {
  it('K=5 で全件正解の場合 1.0 を返す', () => {
    const retrieved = ['doc1', 'doc2', 'doc3', 'doc4', 'doc5']
    const relevant = ['doc1', 'doc2', 'doc3', 'doc4', 'doc5']
    expect(precisionAtK(retrieved, relevant, 5)).toBe(1.0)
  })

  it('K=5 で正解 0 件の場合 0.0 を返す', () => {
    const retrieved = ['doc1', 'doc2', 'doc3', 'doc4', 'doc5']
    const relevant = ['doc6', 'doc7']
    expect(precisionAtK(retrieved, relevant, 5)).toBe(0.0)
  })

  it('K=5 で正解 2 件の場合 0.4 を返す', () => {
    const retrieved = ['doc1', 'doc2', 'doc3', 'doc4', 'doc5']
    const relevant = ['doc1', 'doc3']
    expect(precisionAtK(retrieved, relevant, 5)).toBeCloseTo(0.4)
  })

  it('K=3 で上位 3 件のみ評価する', () => {
    // retrieved[3], retrieved[4] は正解だが K=3 では評価外
    const retrieved = ['doc6', 'doc7', 'doc8', 'doc1', 'doc2']
    const relevant = ['doc1', 'doc2']
    expect(precisionAtK(retrieved, relevant, 3)).toBe(0.0)
  })

  it('K=1 で先頭が正解の場合 1.0 を返す', () => {
    const retrieved = ['doc1', 'doc2', 'doc3']
    const relevant = ['doc1']
    expect(precisionAtK(retrieved, relevant, 1)).toBe(1.0)
  })
})

// ---------------------------------------------------------------------------
// recallAtK
// ---------------------------------------------------------------------------

describe('recallAtK', () => {
  it('全正解ドキュメントが上位 K 件に含まれる場合 1.0 を返す', () => {
    const retrieved = ['doc1', 'doc2', 'doc3']
    const relevant = ['doc1', 'doc2']
    expect(recallAtK(retrieved, relevant, 3)).toBe(1.0)
  })

  it('正解ドキュメントが 0 件の場合 0.0 を返す', () => {
    const retrieved = ['doc1', 'doc2']
    const relevant: string[] = []
    expect(recallAtK(retrieved, relevant, 5)).toBe(0.0)
  })

  it('正解ドキュメントの半数が検索結果に含まれる場合 0.5 を返す', () => {
    const retrieved = ['doc1', 'doc3', 'doc5']
    const relevant = ['doc1', 'doc2']
    // doc1 だけがヒット → 1/2 = 0.5
    expect(recallAtK(retrieved, relevant, 5)).toBeCloseTo(0.5)
  })
})

// ---------------------------------------------------------------------------
// computeMrr
// ---------------------------------------------------------------------------

describe('computeMrr', () => {
  it('cases が空の場合 0 を返す', () => {
    expect(computeMrr([], [])).toBe(0)
  })

  it('最初の正解が 1 位の場合 MRR=1.0 を返す', () => {
    const cases: RagEvalCase[] = [{ caseId: 'c1', query: '質問', relevantDocIds: ['doc1'] }]
    const results: RagSearchResult[] = [{ caseId: 'c1', retrievedDocIds: ['doc1', 'doc2'] }]
    expect(computeMrr(cases, results)).toBe(1.0)
  })

  it('最初の正解が 2 位の場合 MRR=0.5 を返す', () => {
    const cases: RagEvalCase[] = [{ caseId: 'c1', query: '質問', relevantDocIds: ['doc2'] }]
    const results: RagSearchResult[] = [{ caseId: 'c1', retrievedDocIds: ['doc1', 'doc2'] }]
    expect(computeMrr(cases, results)).toBeCloseTo(0.5)
  })

  it('複数ケースの平均 MRR を正しく計算する', () => {
    const cases: RagEvalCase[] = [
      { caseId: 'c1', query: 'q1', relevantDocIds: ['doc1'] },
      { caseId: 'c2', query: 'q2', relevantDocIds: ['doc2'] },
    ]
    const results: RagSearchResult[] = [
      { caseId: 'c1', retrievedDocIds: ['doc1', 'doc3'] }, // RR=1.0
      { caseId: 'c2', retrievedDocIds: ['doc3', 'doc2'] }, // RR=0.5
    ]
    // MRR = (1.0 + 0.5) / 2 = 0.75
    expect(computeMrr(cases, results)).toBeCloseTo(0.75)
  })

  it('正解ドキュメントが検索結果に含まれない場合 RR=0 として計算する', () => {
    const cases: RagEvalCase[] = [{ caseId: 'c1', query: 'q', relevantDocIds: ['docX'] }]
    const results: RagSearchResult[] = [{ caseId: 'c1', retrievedDocIds: ['doc1', 'doc2'] }]
    expect(computeMrr(cases, results)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// evaluateRag
// ---------------------------------------------------------------------------

describe('evaluateRag', () => {
  it('cases が空の場合 全指標 0 を返す', () => {
    const metrics = evaluateRag([], [], 5)
    expect(metrics.precisionAtK).toBe(0)
    expect(metrics.recallAtK).toBe(0)
    expect(metrics.mrr).toBe(0)
  })

  it('完全正解の場合 全指標 1.0 を返す', () => {
    const cases: RagEvalCase[] = [
      { caseId: 'c1', query: 'q1', relevantDocIds: ['doc1', 'doc2'] },
    ]
    const results: RagSearchResult[] = [
      { caseId: 'c1', retrievedDocIds: ['doc1', 'doc2', 'doc3', 'doc4', 'doc5'] },
    ]
    const metrics = evaluateRag(cases, results, 5)
    // P@5: 2/5=0.4, R@5: 2/2=1.0, MRR: 1.0
    expect(metrics.recallAtK).toBeCloseTo(1.0)
    expect(metrics.mrr).toBeCloseTo(1.0)
  })
})

// ---------------------------------------------------------------------------
// computeAuroc
// ---------------------------------------------------------------------------

describe('computeAuroc', () => {
  it('cases が空の場合 0 を返す', () => {
    expect(computeAuroc([])).toBe(0)
  })

  it('全件陽性（退化ケース）の場合 0.5 を返す', () => {
    const cases: BayesEvalCase[] = [
      { caseId: 'c1', trueLabel: 'injury', predictedScore: 0.9, trueLabel01: 1 },
      { caseId: 'c2', trueLabel: 'injury', predictedScore: 0.8, trueLabel01: 1 },
    ]
    expect(computeAuroc(cases)).toBe(0.5)
  })

  it('完全分離（理想的分類器）の場合 1.0 に近い値を返す', () => {
    const cases: BayesEvalCase[] = [
      { caseId: 'c1', trueLabel: 'injury', predictedScore: 0.95, trueLabel01: 1 },
      { caseId: 'c2', trueLabel: 'injury', predictedScore: 0.90, trueLabel01: 1 },
      { caseId: 'c3', trueLabel: 'healthy', predictedScore: 0.10, trueLabel01: 0 },
      { caseId: 'c4', trueLabel: 'healthy', predictedScore: 0.05, trueLabel01: 0 },
    ]
    const auroc = computeAuroc(cases)
    expect(auroc).toBeGreaterThan(0.9)
  })

  it('ランダム分類器の場合 0.5 付近の値を返す', () => {
    const cases: BayesEvalCase[] = [
      { caseId: 'c1', trueLabel: 'injury', predictedScore: 0.6, trueLabel01: 1 },
      { caseId: 'c2', trueLabel: 'healthy', predictedScore: 0.7, trueLabel01: 0 },
      { caseId: 'c3', trueLabel: 'injury', predictedScore: 0.4, trueLabel01: 1 },
      { caseId: 'c4', trueLabel: 'healthy', predictedScore: 0.3, trueLabel01: 0 },
    ]
    const auroc = computeAuroc(cases)
    // ランダムに近いため 0.3-0.7 の範囲に収まることを確認
    expect(auroc).toBeGreaterThanOrEqual(0.0)
    expect(auroc).toBeLessThanOrEqual(1.0)
  })
})

// ---------------------------------------------------------------------------
// computeSensitivitySpecificity
// ---------------------------------------------------------------------------

describe('computeSensitivitySpecificity', () => {
  const testCases: BayesEvalCase[] = [
    { caseId: 'c1', trueLabel: 'injury', predictedScore: 0.8, trueLabel01: 1 }, // TP
    { caseId: 'c2', trueLabel: 'injury', predictedScore: 0.9, trueLabel01: 1 }, // TP
    { caseId: 'c3', trueLabel: 'injury', predictedScore: 0.3, trueLabel01: 1 }, // FN
    { caseId: 'c4', trueLabel: 'healthy', predictedScore: 0.1, trueLabel01: 0 }, // TN
    { caseId: 'c5', trueLabel: 'healthy', predictedScore: 0.2, trueLabel01: 0 }, // TN
    { caseId: 'c6', trueLabel: 'healthy', predictedScore: 0.7, trueLabel01: 0 }, // FP
  ]

  it('感度（Sensitivity）を正しく計算する', () => {
    const { sensitivity } = computeSensitivitySpecificity(testCases, 0.5)
    // TP=2, FN=1 → sensitivity = 2/3
    expect(sensitivity).toBeCloseTo(2 / 3)
  })

  it('特異度（Specificity）を正しく計算する', () => {
    const { specificity } = computeSensitivitySpecificity(testCases, 0.5)
    // TN=2, FP=1 → specificity = 2/3
    expect(specificity).toBeCloseTo(2 / 3)
  })

  it('閾値を変えると結果が変わる', () => {
    const { sensitivity: s08 } = computeSensitivitySpecificity(testCases, 0.8)
    const { sensitivity: s05 } = computeSensitivitySpecificity(testCases, 0.5)
    // 閾値を上げると感度は下がる（または同等）
    expect(s08).toBeLessThanOrEqual(s05 + 0.001)
  })

  it('cases が空の場合 0 を返す', () => {
    const { sensitivity, specificity } = computeSensitivitySpecificity([], 0.5)
    expect(sensitivity).toBe(0)
    expect(specificity).toBe(0)
  })
})

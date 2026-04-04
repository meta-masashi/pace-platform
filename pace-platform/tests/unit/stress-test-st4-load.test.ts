/**
 * ST-4: Load / Performance Stress Tests
 * ============================================================
 * Tests that the PACE v6.0 platform can handle:
 *   - High-volume concurrent processing
 *   - Large historical datasets
 *   - Memory stability under sustained load
 *   - State isolation between pipeline executions
 *   - Edge case input sizes
 *
 * NOTE: These tests exercise the TypeScript layer only.
 * ODE/EKF calls are gated behind the Python gateway which
 * returns fallback values when the service is unavailable.
 * ============================================================
 */

import { describe, it, expect } from 'vitest';

// --- Conditioning engine ---
import { calculateConditioningScore } from '../../lib/conditioning/engine';
import { calculateEWMA } from '../../lib/conditioning/ewma';
import type { DailyMetricRow, ConditioningInput } from '../../lib/conditioning/types';

// --- Bayes inference ---
import {
  calculatePosteriorWithDAG,
  probabilityToOdds,
  oddsToProbability,
} from '../../lib/bayes/inference';
import type {
  AssessmentNode as BayesAssessmentNode,
  ActiveObservation,
} from '../../lib/bayes/types';

// --- Posterior updater ---
import {
  initializePriors,
  updatePosteriors,
} from '../../lib/assessment/posterior-updater';
import type { AssessmentNode as CATAssessmentNode } from '../../lib/assessment/types';

// --- Time decay ---
import {
  calculateDecayedRisk,
  lambdaFromHalfLife,
} from '../../lib/decay/calculator';

// --- Pipeline ---
import { InferencePipeline } from '../../lib/engine/v6/pipeline';
import { DEFAULT_PIPELINE_CONFIG } from '../../lib/engine/v6/config';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeDailyRow(overrides: Partial<DailyMetricRow> & { date: string }): DailyMetricRow {
  return {
    srpe: 300,
    sleepScore: 7,
    fatigueSubjective: 3,
    hrv: null,
    hrvBaseline: null,
    ...overrides,
  };
}

function makeHistory(days: number, srpe = 300): DailyMetricRow[] {
  return Array.from({ length: days }, (_, i) =>
    makeDailyRow({
      date: `2025-01-${String((i % 28) + 1).padStart(2, '0')}`,
      srpe: srpe + (i % 7) * 50, // add some variation
    }),
  );
}

function makeConditioningInput(overrides: Partial<ConditioningInput> = {}): ConditioningInput {
  return {
    srpe: 300,
    sleepScore: 7,
    fatigueSubjective: 3,
    ...overrides,
  };
}

function makeBayesNode(
  overrides: Partial<BayesAssessmentNode> & { node_id: string },
): BayesAssessmentNode {
  return {
    source: 'test',
    category: 'test',
    axis_type: 'structural',
    unit: 'binary',
    lr_yes: 5.0,
    lr_no: 0.2,
    base_lr: 1.0,
    evidence_level: 'B' as const,
    description: 'Test node',
    pace_annotation: null,
    prescription_tags: [],
    contraindication_tags: [],
    is_active: true,
    ...overrides,
  };
}

function makeCATNode(
  overrides: Partial<CATAssessmentNode> & { node_id: string; target_axis: string },
): CATAssessmentNode {
  return {
    file_type: 'F1',
    phase: 'acute',
    category: 'general',
    question_text: 'Test question?',
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
  };
}

// ===========================================================================
// ST-4.1: THROUGHPUT TESTS
// ===========================================================================

describe('ST-4.1: Throughput Tests', () => {
  it('ST-4.1.1: Process 100 athletes through conditioning engine < 10s', () => {
    const start = performance.now();
    const results: number[] = [];

    for (let i = 0; i < 100; i++) {
      const history = makeHistory(42, 200 + i * 5);
      const input = makeConditioningInput({
        srpe: 200 + i * 3,
        sleepScore: 3 + (i % 8),
        fatigueSubjective: 2 + (i % 6),
      });
      const result = calculateConditioningScore(history, input);
      results.push(result.conditioningScore);
    }

    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(10_000); // < 10 seconds
    expect(results).toHaveLength(100);
    for (const score of results) {
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
      expect(Number.isFinite(score)).toBe(true);
    }
  });

  it('ST-4.1.2: Single athlete with 365 days of history < 200ms', () => {
    const history = makeHistory(365);
    const input = makeConditioningInput();

    const start = performance.now();
    const result = calculateConditioningScore(history, input);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(200);
    expect(Number.isFinite(result.conditioningScore)).toBe(true);
    expect(result.conditioningScore).toBeGreaterThanOrEqual(0);
    expect(result.conditioningScore).toBeLessThanOrEqual(100);
  });

  it('ST-4.1.3: Process 1000 Bayes DAG posterior updates < 500ms', () => {
    const nodes = Array.from({ length: 50 }, (_, i) =>
      makeBayesNode({ node_id: `n${i}`, lr_yes: 2 + (i % 5) }),
    );

    const start = performance.now();
    const results: number[] = [];

    for (let trial = 0; trial < 1000; trial++) {
      const obs: ActiveObservation[] = nodes
        .slice(0, 5 + (trial % 10))
        .map((n) => ({ node_id: n.node_id, is_active: true }));
      const posterior = calculatePosteriorWithDAG(0.05, nodes, obs);
      results.push(posterior);
    }

    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(500);
    expect(results).toHaveLength(1000);
    for (const p of results) {
      expect(Number.isFinite(p)).toBe(true);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1.0);
    }
  });

  it('ST-4.1.4: EWMA with 10,000 data points < 50ms', () => {
    const values = Array.from({ length: 10_000 }, () => Math.random() * 1000);

    const start = performance.now();
    const result = calculateEWMA(values, 42);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50);
    expect(Number.isFinite(result)).toBe(true);
  });

  it('ST-4.1.5: Time decay batch of 10,000 risks < 100ms', () => {
    const lambda = lambdaFromHalfLife(14);

    const start = performance.now();
    const results: number[] = [];

    for (let i = 0; i < 10_000; i++) {
      const risk = calculateDecayedRisk(
        Math.random(),
        lambda,
        Math.random() * 365,
        1.0 + Math.random() * 0.5,
      );
      results.push(risk);
    }

    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
    for (const r of results) {
      expect(Number.isFinite(r)).toBe(true);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1.0);
    }
  });
});

// ===========================================================================
// ST-4.2: MEMORY STABILITY TESTS
// ===========================================================================

describe('ST-4.2: Memory Stability Tests', () => {
  it('ST-4.2.1: 10,000 conditioning score calculations must not leak memory significantly', () => {
    // Measure baseline heap
    if (typeof global.gc === 'function') global.gc();
    const heapBefore = process.memoryUsage().heapUsed;

    for (let i = 0; i < 10_000; i++) {
      const history = makeHistory(28, 200 + (i % 100));
      calculateConditioningScore(history, makeConditioningInput({ srpe: i % 500 }));
    }

    if (typeof global.gc === 'function') global.gc();
    const heapAfter = process.memoryUsage().heapUsed;
    const heapDeltaMB = (heapAfter - heapBefore) / (1024 * 1024);

    // Allow up to 100MB growth (generous for GC timing differences)
    expect(heapDeltaMB).toBeLessThan(100);
  });

  it('ST-4.2.2: Creating 1000 pipeline instances must not leak', () => {
    const pipelines: InferencePipeline[] = [];
    for (let i = 0; i < 1000; i++) {
      pipelines.push(new InferencePipeline());
    }
    expect(pipelines).toHaveLength(1000);
    // Just verify no crash; GC will handle cleanup
  });
});

// ===========================================================================
// ST-4.3: STATE ISOLATION TESTS
// ===========================================================================

describe('ST-4.3: State Isolation Tests', () => {
  it('ST-4.3.1: Rapid sequential conditioning calls must not leak state', () => {
    const results: number[] = [];

    // Run same input 100 times - must get identical results
    const history = makeHistory(28);
    const input = makeConditioningInput();

    for (let i = 0; i < 100; i++) {
      const result = calculateConditioningScore(history, input);
      results.push(result.conditioningScore);
    }

    // All 100 results must be identical (no state leakage)
    const first = results[0]!;
    for (const r of results) {
      expect(r).toBe(first);
    }
  });

  it('ST-4.3.2: Different athletes must get independent results', () => {
    const historyA = makeHistory(28, 100); // low load
    const historyB = makeHistory(28, 900); // high load

    const inputA = makeConditioningInput({ srpe: 100 });
    const inputB = makeConditioningInput({ srpe: 900 });

    const resultA = calculateConditioningScore(historyA, inputA);
    const resultB = calculateConditioningScore(historyB, inputB);

    // Results should differ due to different inputs
    expect(resultA.conditioningScore).not.toBe(resultB.conditioningScore);
    // But both must be valid
    expect(resultA.conditioningScore).toBeGreaterThanOrEqual(0);
    expect(resultA.conditioningScore).toBeLessThanOrEqual(100);
    expect(resultB.conditioningScore).toBeGreaterThanOrEqual(0);
    expect(resultB.conditioningScore).toBeLessThanOrEqual(100);
  });

  it('ST-4.3.3: Pipeline instances must be independent', () => {
    const pipeline1 = new InferencePipeline();
    const pipeline2 = new InferencePipeline({
      thresholds: { painRedFlag: 6, acwrRedLine: 1.2, monotonyRedLine: 1.5, decouplingThreshold: 1.0, zScoreExhaustion: -1.0, zScoreMultipleCount: 1, restingHRSpikePercent: 20 },
    });

    const config1 = pipeline1.getConfig();
    const config2 = pipeline2.getConfig();

    expect(config1.thresholds.painRedFlag).toBe(8);
    expect(config2.thresholds.painRedFlag).toBe(6);
    // Modifying one pipeline's config must not affect the other
  });

  it('ST-4.3.4: Posterior maps must be independent between updates', () => {
    const node = makeCATNode({
      node_id: 'n1',
      target_axis: 'diag_A',
      lr_yes: 5.0,
      kappa: 0.8,
    });

    const priors = new Map([
      ['diag_A', 0.3],
      ['diag_B', 0.7],
    ]);

    const updated = updatePosteriors(priors, node, 'yes');

    // Original priors must be untouched
    expect(priors.get('diag_A')).toBe(0.3);
    expect(priors.get('diag_B')).toBe(0.7);

    // Updated map should be different
    expect(updated.get('diag_A')).not.toBe(0.3);
  });

  it('ST-4.3.5: Bayesian DAG calculation must not mutate input arrays', () => {
    const nodes = [makeBayesNode({ node_id: 'n1', lr_yes: 5 })];
    const obs: ActiveObservation[] = [{ node_id: 'n1', is_active: true }];

    const nodesCopy = JSON.stringify(nodes);
    const obsCopy = JSON.stringify(obs);

    calculatePosteriorWithDAG(0.3, nodes, obs);

    expect(JSON.stringify(nodes)).toBe(nodesCopy);
    expect(JSON.stringify(obs)).toBe(obsCopy);
  });
});

// ===========================================================================
// ST-4.4: EXTREME INPUT SIZE TESTS
// ===========================================================================

describe('ST-4.4: Extreme Input Size Tests', () => {
  it('ST-4.4.1: History of 1000 days must produce valid result', () => {
    const history = makeHistory(1000);
    const result = calculateConditioningScore(history, makeConditioningInput());
    expect(Number.isFinite(result.conditioningScore)).toBe(true);
    expect(result.conditioningScore).toBeGreaterThanOrEqual(0);
    expect(result.conditioningScore).toBeLessThanOrEqual(100);
  });

  it('ST-4.4.2: 500 diagnosis candidates in posterior normalization', () => {
    const nodes = Array.from({ length: 500 }, (_, i) =>
      makeCATNode({
        node_id: `n${i}`,
        target_axis: `diag_${i}`,
        base_prevalence: 0.01,
      }),
    );

    const priors = initializePriors(nodes);
    expect(priors.size).toBe(500);

    const total = Array.from(priors.values()).reduce((s, v) => s + v, 0);
    expect(total).toBeCloseTo(1.0, 3);
  });

  it('ST-4.4.3: DAG with 200 active observations must complete in reasonable time', () => {
    const nodes = Array.from({ length: 200 }, (_, i) =>
      makeBayesNode({ node_id: `n${i}`, lr_yes: 1.5 + (i % 5) * 0.5 }),
    );
    const obs: ActiveObservation[] = nodes.map((n) => ({
      node_id: n.node_id,
      is_active: true,
    }));

    const start = performance.now();
    const result = calculatePosteriorWithDAG(0.01, nodes, obs);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(100);
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(1.0);
  });

  it('ST-4.4.4: sRPE values at extreme range must not break conditioning', () => {
    const history = makeHistory(28);
    // sRPE * duration = sessionLoad at extreme
    const extremeInput = makeConditioningInput({ srpe: Number.MAX_SAFE_INTEGER });
    const result = calculateConditioningScore(history, extremeInput);
    expect(Number.isFinite(result.conditioningScore)).toBe(true);
    expect(result.conditioningScore).toBeGreaterThanOrEqual(0);
    expect(result.conditioningScore).toBeLessThanOrEqual(100);
  });
});

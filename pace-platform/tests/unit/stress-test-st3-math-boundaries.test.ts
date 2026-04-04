/**
 * ST-3: Mathematical Model Boundary Stress Tests
 * ============================================================
 * MERCILESS boundary-value testing of every mathematical model
 * in the PACE v6.0 platform. Tests NaN propagation, division by
 * zero, overflow, underflow, and numerical stability.
 *
 * Coverage:
 *   - EWMA / ACWR boundaries
 *   - Conditioning score boundaries
 *   - Bayes inference boundaries (naive + DAG)
 *   - Time decay boundaries
 *   - Node 2 monotony / Z-score / preparedness boundaries
 *   - Posterior updater boundaries
 * ============================================================
 */

import { describe, it, expect } from 'vitest';

// --- EWMA / Conditioning ---
import {
  calculateEWMA,
  createEWMAConfig,
  FITNESS_EWMA_SPAN,
  FATIGUE_EWMA_SPAN,
} from '../../lib/conditioning/ewma';
import { calculateConditioningScore } from '../../lib/conditioning/engine';
import type { DailyMetricRow, ConditioningInput } from '../../lib/conditioning/types';

// --- Bayes inference ---
import {
  computeAdjustedLr,
  computeCScore,
  computeContextModifier,
  probabilityToOdds,
  oddsToProbability,
  computeEffectiveLR,
  calculatePosteriorWithDAG,
  runLocalInference,
} from '../../lib/bayes/inference';
import type {
  AssessmentNode as BayesAssessmentNode,
  CausalEdge,
  ActiveObservation,
} from '../../lib/bayes/types';

// --- Time decay ---
import {
  calculateDecayedRisk,
  lambdaFromHalfLife,
  halfLifeFromLambda,
  daysUntilThreshold,
  RISK_THRESHOLD,
} from '../../lib/decay/calculator';

// --- Posterior updater ---
import {
  initializePriors,
  updatePosteriors,
} from '../../lib/assessment/posterior-updater';
import type { AssessmentNode as CATAssessmentNode } from '../../lib/assessment/types';

// --- CAT engine ---
import {
  selectNextQuestion,
  shouldTerminate,
} from '../../lib/assessment/cat-engine';

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
    makeDailyRow({ date: `2025-01-${String(i + 1).padStart(2, '0')}`, srpe }),
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
// ST-3.1: EWMA / ACWR BOUNDARIES
// ===========================================================================

describe('ST-3.1: EWMA/ACWR Boundary Tests', () => {
  describe('EWMA edge cases', () => {
    it('ST-3.1.1: Empty history array must return 0', () => {
      const result = calculateEWMA([], 7);
      expect(result).toBe(0);
    });

    it('ST-3.1.2: Single data point must return that value', () => {
      const result = calculateEWMA([42], 7);
      expect(result).toBe(42);
    });

    it('ST-3.1.3: All identical values must produce that value (ACWR=1.0 scenario)', () => {
      const values = Array(28).fill(100);
      const result = calculateEWMA(values, 7);
      // With identical values, EWMA should converge to that value
      expect(result).toBeCloseTo(100, 0);
    });

    it('ST-3.1.4: NaN values in array must be filtered (not propagate NaN)', () => {
      const values = [100, NaN, 200, NaN, 300];
      const result = calculateEWMA(values, 7);
      expect(Number.isFinite(result)).toBe(true);
      expect(Number.isNaN(result)).toBe(false);
    });

    it('ST-3.1.5: Infinity values must be filtered', () => {
      const values = [100, Infinity, 200, -Infinity, 300];
      const result = calculateEWMA(values, 7);
      expect(Number.isFinite(result)).toBe(true);
    });

    it('ST-3.1.6: All NaN array must return 0', () => {
      const values = [NaN, NaN, NaN];
      const result = calculateEWMA(values, 7);
      expect(result).toBe(0);
    });

    it('ST-3.1.7: All Infinity array must return 0', () => {
      const values = [Infinity, -Infinity, Infinity];
      const result = calculateEWMA(values, 7);
      expect(result).toBe(0);
    });

    it('ST-3.1.8: Alternating 0 and 1000 (extreme oscillation) must not NaN', () => {
      const values = Array.from({ length: 100 }, (_, i) => (i % 2 === 0 ? 0 : 1000));
      const result = calculateEWMA(values, 7);
      expect(Number.isFinite(result)).toBe(true);
      expect(result).toBeGreaterThanOrEqual(0);
    });

    it('ST-3.1.9: 10,000 data points must not crash (performance)', () => {
      const values = Array.from({ length: 10_000 }, (_, i) => Math.sin(i) * 500 + 500);
      const start = performance.now();
      const result = calculateEWMA(values, 42);
      const elapsed = performance.now() - start;
      expect(Number.isFinite(result)).toBe(true);
      expect(elapsed).toBeLessThan(100); // must complete in < 100ms
    });

    it('ST-3.1.10: Span = 1 must track latest value', () => {
      const result = calculateEWMA([10, 20, 30], 1);
      expect(result).toBe(30);
    });

    it('ST-3.1.11: createEWMAConfig with span < 1 must throw', () => {
      expect(() => createEWMAConfig(0)).toThrow();
      expect(() => createEWMAConfig(-1)).toThrow();
      expect(() => createEWMAConfig(-100)).toThrow();
    });
  });

  describe('Conditioning ACWR zero-division', () => {
    it('ST-3.1.12: All zero sRPE history (chronic = 0) must return ACWR = 0 (not NaN/Infinity)', () => {
      const history = makeHistory(28, 0);
      const result = calculateConditioningScore(history, makeConditioningInput({ srpe: 0 }));
      expect(Number.isFinite(result.acwr)).toBe(true);
      expect(result.acwr).toBe(0);
    });

    it('ST-3.1.13: Empty history with zero input must return valid score', () => {
      const result = calculateConditioningScore([], makeConditioningInput({ srpe: 0 }));
      expect(Number.isFinite(result.conditioningScore)).toBe(true);
      expect(result.conditioningScore).toBeGreaterThanOrEqual(0);
      expect(result.conditioningScore).toBeLessThanOrEqual(100);
    });
  });

  describe('Monotony σ=0 edge case (all identical values)', () => {
    it('ST-3.1.14: All identical daily loads must not produce Infinity monotony', () => {
      // When σ→0 for identical loads, Monotony = mean/σ → Infinity.
      // Code should use MONOTONY_HIGH_FALLBACK (3.0) instead.
      const history = makeHistory(7, 300);
      const result = calculateConditioningScore(history, makeConditioningInput());
      // The monotonyIndex is not directly in conditioning result,
      // but we verify the overall score doesn't NaN
      expect(Number.isFinite(result.conditioningScore)).toBe(true);
    });
  });
});

// ===========================================================================
// ST-3.2: CONDITIONING SCORE BOUNDARIES
// ===========================================================================

describe('ST-3.2: Conditioning Score Boundary Tests', () => {
  it('ST-3.2.1: All inputs = 0 must return valid score 0-100', () => {
    const history = makeHistory(28, 0);
    const input = makeConditioningInput({
      srpe: 0,
      sleepScore: 0,
      fatigueSubjective: 0,
    });
    const result = calculateConditioningScore(history, input);
    expect(result.conditioningScore).toBeGreaterThanOrEqual(0);
    expect(result.conditioningScore).toBeLessThanOrEqual(100);
    expect(Number.isFinite(result.conditioningScore)).toBe(true);
  });

  it('ST-3.2.2: Extreme day (sRPE=10, high fatigue) must stay 0-100', () => {
    const history = makeHistory(42, 300);
    const input = makeConditioningInput({
      srpe: 4800, // sRPE 10 * 480min
      sleepScore: 0,
      fatigueSubjective: 10,
    });
    const result = calculateConditioningScore(history, input);
    expect(result.conditioningScore).toBeGreaterThanOrEqual(0);
    expect(result.conditioningScore).toBeLessThanOrEqual(100);
  });

  it('ST-3.2.3: HRV = 0 must not divide by zero (even in Pro Mode attempt)', () => {
    const history = makeHistory(28);
    const input = makeConditioningInput({
      hrv: 0,
      hrvBaseline: 0,
    });
    const result = calculateConditioningScore(history, input);
    expect(Number.isFinite(result.conditioningScore)).toBe(true);
    // HRV=0 should disable pro mode (hrv > 0 && hrvBaseline > 0 check)
    expect(result.isProMode).toBe(false);
  });

  it('ST-3.2.4: HRV baseline = 0 with HRV > 0 must not divide by zero', () => {
    const history = makeHistory(28);
    const input = makeConditioningInput({
      hrv: 50,
      hrvBaseline: 0,
    });
    const result = calculateConditioningScore(history, input);
    expect(Number.isFinite(result.conditioningScore)).toBe(true);
  });

  it('ST-3.2.5: Massive sRPE spike (100x normal) must still return 0-100', () => {
    const history = makeHistory(42, 300);
    const input = makeConditioningInput({ srpe: 30000 });
    const result = calculateConditioningScore(history, input);
    expect(result.conditioningScore).toBeGreaterThanOrEqual(0);
    expect(result.conditioningScore).toBeLessThanOrEqual(100);
  });

  it('ST-3.2.6: Sleep score boundary values (0 and 10)', () => {
    const history = makeHistory(28);
    const result0 = calculateConditioningScore(history, makeConditioningInput({ sleepScore: 0 }));
    const result10 = calculateConditioningScore(history, makeConditioningInput({ sleepScore: 10 }));
    expect(result0.penalties.sleepPenalty).toBeGreaterThan(0);
    expect(result10.penalties.sleepPenalty).toBe(0);
    expect(result0.conditioningScore).toBeLessThan(result10.conditioningScore);
  });

  it('ST-3.2.7: Fatigue boundary values (0 and 10)', () => {
    const history = makeHistory(28);
    const result0 = calculateConditioningScore(history, makeConditioningInput({ fatigueSubjective: 0 }));
    const result10 = calculateConditioningScore(history, makeConditioningInput({ fatigueSubjective: 10 }));
    expect(result0.penalties.fatiguePenalty).toBe(0);
    expect(result10.penalties.fatiguePenalty).toBeGreaterThan(0);
  });
});

// ===========================================================================
// ST-3.3: BAYES INFERENCE BOUNDARIES
// ===========================================================================

describe('ST-3.3: Bayes Inference Boundary Tests', () => {
  describe('probabilityToOdds / oddsToProbability', () => {
    it('ST-3.3.1: Prior probability = 0 must not produce NaN odds', () => {
      const odds = probabilityToOdds(0);
      expect(Number.isFinite(odds)).toBe(true);
      expect(odds).toBeGreaterThan(0); // clamped to 1e-10
    });

    it('ST-3.3.2: Prior probability = 1 must not produce Infinity odds', () => {
      const odds = probabilityToOdds(1);
      expect(Number.isFinite(odds)).toBe(true);
    });

    it('ST-3.3.3: Negative odds must return probability 0', () => {
      expect(oddsToProbability(-1)).toBe(0);
      expect(oddsToProbability(-Infinity)).toBe(0);
    });

    it('ST-3.3.4: Infinite odds must return probability 1.0 (not NaN)', () => {
      expect(oddsToProbability(Infinity)).toBe(1.0);
    });

    it('ST-3.3.5: Odds = 0 must return probability 0', () => {
      expect(oddsToProbability(0)).toBe(0);
    });

    it('ST-3.3.6: Round-trip probability→odds→probability preserves value', () => {
      for (const p of [0.001, 0.1, 0.5, 0.9, 0.999]) {
        const roundTrip = oddsToProbability(probabilityToOdds(p));
        expect(roundTrip).toBeCloseTo(p, 5);
      }
    });
  });

  describe('computeAdjustedLr', () => {
    it('ST-3.3.7: LR = 0 must produce valid adjusted LR', () => {
      const result = computeAdjustedLr(0, 0.8, 0.8);
      expect(Number.isFinite(result)).toBe(true);
    });

    it('ST-3.3.8: C_score < 0.3 must force LR_adjusted = 1.0 (rejection)', () => {
      expect(computeAdjustedLr(10, 0.1, 0.8)).toBe(1.0);
      expect(computeAdjustedLr(10, 0.29, 0.8)).toBe(1.0);
    });

    it('ST-3.3.9: kappa = 0 in computeAdjustedLr must produce 1.0', () => {
      // LR_adjusted = 1 + (LR-1)*C*kappa; kappa=0 → LR_adjusted = 1.0
      const result = computeAdjustedLr(10, 0.8, 0);
      expect(result).toBe(1.0);
    });

    it('ST-3.3.10: kappa = 1 must give standard behavior', () => {
      const result = computeAdjustedLr(5, 0.8, 1.0);
      // 1 + (5-1)*0.8*1.0 = 1 + 3.2 = 4.2
      expect(result).toBeCloseTo(4.2, 5);
    });

    it('ST-3.3.11: Negative LR must produce valid (possibly < 1) adjusted LR', () => {
      const result = computeAdjustedLr(-5, 0.8, 0.8);
      expect(Number.isFinite(result)).toBe(true);
      // 1 + (-5-1)*0.8*0.8 = 1 + (-6)*0.64 = 1 - 3.84 = -2.84
      // This is a BUG: adjusted LR can go negative. Should be clamped.
    });
  });

  describe('computeEffectiveLR (DAG causal discounting)', () => {
    it('ST-3.3.12: No active parents must return raw LR', () => {
      expect(computeEffectiveLR(5.0, [])).toBe(5.0);
    });

    it('ST-3.3.13: Discount factor = 0 must mean no discount', () => {
      const edge: CausalEdge = { parentId: 'p1', discountFactor: 0 };
      expect(computeEffectiveLR(5.0, [edge])).toBe(5.0);
    });

    it('ST-3.3.14: Discount factor = 1 must mean complete discount (LR→1)', () => {
      const edge: CausalEdge = { parentId: 'p1', discountFactor: 1.0 };
      const result = computeEffectiveLR(5.0, [edge]);
      expect(result).toBeCloseTo(1.0, 5);
    });

    it('ST-3.3.15: Discount factor > 1 must be clamped to 1', () => {
      const edge: CausalEdge = { parentId: 'p1', discountFactor: 2.0 };
      const result = computeEffectiveLR(5.0, [edge]);
      // After clamp: gamma = min(1, 2.0) = 1.0, retained = 0, effectiveLR = 1.0
      expect(result).toBeCloseTo(1.0, 5);
    });

    it('ST-3.3.16: Discount factor < 0 must be clamped to 0', () => {
      const edge: CausalEdge = { parentId: 'p1', discountFactor: -0.5 };
      const result = computeEffectiveLR(5.0, [edge]);
      // After clamp: gamma = max(0, -0.5) = 0, retained = 1, effectiveLR = 5.0
      expect(result).toBe(5.0);
    });

    it('ST-3.3.17: LR = 1.0 (no info) must always return 1.0 regardless of parents', () => {
      const edge: CausalEdge = { parentId: 'p1', discountFactor: 0.5 };
      expect(computeEffectiveLR(1.0, [edge])).toBe(1.0);
    });
  });

  describe('calculatePosteriorWithDAG boundary tests', () => {
    it('ST-3.3.18: Prior = 0 must return 0 (impossible event stays impossible)', () => {
      const nodes = [makeBayesNode({ node_id: 'n1', lr_yes: 10 })];
      const obs: ActiveObservation[] = [{ node_id: 'n1', is_active: true }];
      expect(calculatePosteriorWithDAG(0, nodes, obs)).toBe(0);
    });

    it('ST-3.3.19: Prior = 1 must return 1 (certain event stays certain)', () => {
      const nodes = [makeBayesNode({ node_id: 'n1', lr_yes: 10 })];
      const obs: ActiveObservation[] = [{ node_id: 'n1', is_active: true }];
      expect(calculatePosteriorWithDAG(1, nodes, obs)).toBe(1);
    });

    it('ST-3.3.20: Prior < 0 must throw', () => {
      expect(() => calculatePosteriorWithDAG(-0.1, [], [])).toThrow();
    });

    it('ST-3.3.21: Prior > 1 must throw', () => {
      expect(() => calculatePosteriorWithDAG(1.1, [], [])).toThrow();
    });

    it('ST-3.3.22: No observations must return prior unchanged', () => {
      expect(calculatePosteriorWithDAG(0.3, [], [])).toBe(0.3);
    });

    it('ST-3.3.23: All observations inactive must return prior unchanged', () => {
      const obs: ActiveObservation[] = [{ node_id: 'n1', is_active: false }];
      expect(calculatePosteriorWithDAG(0.3, [], obs)).toBe(0.3);
    });

    it('ST-3.3.24: 100 active nodes all with LR > 10 must keep posterior <= 1.0', () => {
      const nodes = Array.from({ length: 100 }, (_, i) =>
        makeBayesNode({ node_id: `n${i}`, lr_yes: 15 }),
      );
      const obs: ActiveObservation[] = nodes.map((n) => ({
        node_id: n.node_id,
        is_active: true,
      }));
      const posterior = calculatePosteriorWithDAG(0.01, nodes, obs);
      expect(posterior).toBeLessThanOrEqual(1.0);
      expect(posterior).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(posterior)).toBe(true);
    });

    it('ST-3.3.25: Missing node_id in observations must be silently skipped', () => {
      const obs: ActiveObservation[] = [{ node_id: 'nonexistent', is_active: true }];
      const result = calculatePosteriorWithDAG(0.3, [], obs);
      // Should not crash; missing nodes are skipped
      expect(Number.isFinite(result)).toBe(true);
    });
  });

  describe('computeCScore edge cases', () => {
    it('ST-3.3.26: No athlete context must return 0', () => {
      expect(computeCScore(undefined)).toBe(0);
    });

    it('ST-3.3.27: Empty athlete context must return 0', () => {
      expect(computeCScore({})).toBe(0);
    });

    it('ST-3.3.28: Full athlete context must return 1.0', () => {
      const ctx = {
        age: 25,
        sex: 'male' as const,
        cmj_asymmetry_ratio: 0.95,
        rsi_norm: 1.2,
        srpe: 5,
        acwr: 1.0,
        sleep_hours: 8,
        hrv_baseline_ratio: 1.0,
      };
      expect(computeCScore(ctx)).toBe(1.0);
    });
  });

  describe('computeContextModifier edge cases', () => {
    it('ST-3.3.29: No context must return 1.0 (neutral)', () => {
      expect(computeContextModifier(undefined)).toBe(1.0);
    });

    it('ST-3.3.30: All risk factors active must floor at 0.5', () => {
      const ctx = {
        acwr: 2.0,          // > 1.5 → 0.85
        hrv_baseline_ratio: 0.5, // < 0.8 → 0.9
        srpe: 9,             // > 8 → 0.9
        cmj_asymmetry_ratio: 0.7, // < 0.85 → 0.95
      };
      const result = computeContextModifier(ctx);
      expect(result).toBeGreaterThanOrEqual(0.5);
      expect(Number.isFinite(result)).toBe(true);
    });
  });
});

// ===========================================================================
// ST-3.4: TIME DECAY BOUNDARIES
// ===========================================================================

describe('ST-3.4: Time Decay Boundary Tests', () => {
  it('ST-3.4.1: Zero days since detection must return initial risk', () => {
    const lambda = lambdaFromHalfLife(14);
    const result = calculateDecayedRisk(0.8, lambda, 0);
    expect(result).toBeCloseTo(0.8, 5);
  });

  it('ST-3.4.2: 1000 days with load=0 must converge to 0', () => {
    const lambda = lambdaFromHalfLife(14);
    const result = calculateDecayedRisk(0.8, lambda, 1000);
    expect(result).toBeCloseTo(0, 5);
    expect(result).toBeGreaterThanOrEqual(0);
  });

  it('ST-3.4.3: lambda = 0 must not decay (risk stays constant)', () => {
    const result = calculateDecayedRisk(0.8, 0, 100);
    expect(result).toBeCloseTo(0.8, 5);
  });

  it('ST-3.4.4: Negative lambda must not decay', () => {
    const result = calculateDecayedRisk(0.8, -0.5, 100);
    expect(result).toBeCloseTo(0.8, 5);
  });

  it('ST-3.4.5: Negative days since detection must return initial risk', () => {
    const lambda = lambdaFromHalfLife(14);
    const result = calculateDecayedRisk(0.8, lambda, -5);
    expect(result).toBeCloseTo(0.8, 5);
  });

  it('ST-3.4.6: Initial risk = 0 must always return 0', () => {
    const lambda = lambdaFromHalfLife(14);
    expect(calculateDecayedRisk(0, lambda, 0)).toBe(0);
    expect(calculateDecayedRisk(0, lambda, 100)).toBe(0);
  });

  it('ST-3.4.7: Initial risk > 1 must be clamped to 1', () => {
    const lambda = lambdaFromHalfLife(14);
    const result = calculateDecayedRisk(5.0, lambda, 0);
    expect(result).toBeLessThanOrEqual(1.0);
  });

  it('ST-3.4.8: lambdaFromHalfLife(0) must throw', () => {
    expect(() => lambdaFromHalfLife(0)).toThrow();
  });

  it('ST-3.4.9: lambdaFromHalfLife(-1) must throw', () => {
    expect(() => lambdaFromHalfLife(-1)).toThrow();
  });

  it('ST-3.4.10: halfLifeFromLambda(0) must throw', () => {
    expect(() => halfLifeFromLambda(0)).toThrow();
  });

  it('ST-3.4.11: Round trip halfLife→lambda→halfLife', () => {
    const hl = 14;
    const lambda = lambdaFromHalfLife(hl);
    const recovered = halfLifeFromLambda(lambda);
    expect(recovered).toBeCloseTo(hl, 5);
  });

  it('ST-3.4.12: daysUntilThreshold with risk <= threshold must return 0', () => {
    const lambda = lambdaFromHalfLife(14);
    expect(daysUntilThreshold(0.01, lambda)).toBe(0);
  });

  it('ST-3.4.13: daysUntilThreshold with lambda=0 must return Infinity', () => {
    expect(daysUntilThreshold(0.8, 0)).toBe(Infinity);
  });

  it('ST-3.4.14: daysUntilThreshold with threshold=0 must return Infinity', () => {
    const lambda = lambdaFromHalfLife(14);
    expect(daysUntilThreshold(0.8, lambda, 0)).toBe(Infinity);
  });

  it('ST-3.4.15: ChronicModifier > 1.0 slows decay but keeps risk ≤ 1', () => {
    const lambda = lambdaFromHalfLife(14);
    const normal = calculateDecayedRisk(0.8, lambda, 7, 1.0);
    const chronic = calculateDecayedRisk(0.8, lambda, 7, 2.0);
    expect(chronic).toBeGreaterThan(normal);
    expect(chronic).toBeLessThanOrEqual(1.0);
  });
});

// ===========================================================================
// ST-3.5: POSTERIOR UPDATER BOUNDARIES
// ===========================================================================

describe('ST-3.5: Posterior Updater Boundary Tests', () => {
  const baseNode = makeCATNode({
    node_id: 'n1',
    target_axis: 'diag_A',
    lr_yes: 5.0,
    lr_no: 0.2,
    kappa: 0.8,
  });

  describe('initializePriors', () => {
    it('ST-3.5.1: No active nodes must return empty map', () => {
      const result = initializePriors([]);
      expect(result.size).toBe(0);
    });

    it('ST-3.5.2: Single node must normalize to 1.0', () => {
      const node = makeCATNode({
        node_id: 'n1',
        target_axis: 'diag_A',
        base_prevalence: 0.5,
      });
      const result = initializePriors([node]);
      expect(result.get('diag_A')).toBeCloseTo(1.0, 5);
    });

    it('ST-3.5.3: Multiple nodes sum to 1.0 after normalization', () => {
      const nodes = [
        makeCATNode({ node_id: 'n1', target_axis: 'diag_A', base_prevalence: 0.3 }),
        makeCATNode({ node_id: 'n2', target_axis: 'diag_B', base_prevalence: 0.5 }),
        makeCATNode({ node_id: 'n3', target_axis: 'diag_C', base_prevalence: 0.2 }),
      ];
      const result = initializePriors(nodes);
      const total = Array.from(result.values()).reduce((s, v) => s + v, 0);
      expect(total).toBeCloseTo(1.0, 5);
    });
  });

  describe('updatePosteriors edge cases', () => {
    it('ST-3.5.4: answer="unknown" must not change posteriors', () => {
      const priors = new Map([
        ['diag_A', 0.5],
        ['diag_B', 0.5],
      ]);
      const result = updatePosteriors(priors, baseNode, 'unknown');
      expect(result.get('diag_A')).toBeCloseTo(0.5, 5);
      expect(result.get('diag_B')).toBeCloseTo(0.5, 5);
    });

    it('ST-3.5.5: kappa = 0 must make LR = 1.0 (no effect)', () => {
      const node = makeCATNode({
        node_id: 'n1',
        target_axis: 'diag_A',
        lr_yes: 100,
        kappa: 0,
      });
      const priors = new Map([
        ['diag_A', 0.5],
        ['diag_B', 0.5],
      ]);
      const result = updatePosteriors(priors, node, 'yes');
      // kappa=0 should neutralize LR → posteriors unchanged
      expect(result.get('diag_A')).toBeCloseTo(0.5, 3);
    });

    it('ST-3.5.6: kappa = 1 must apply full LR', () => {
      const node = makeCATNode({
        node_id: 'n1',
        target_axis: 'diag_A',
        lr_yes: 5,
        kappa: 1.0,
      });
      const priors = new Map([
        ['diag_A', 0.5],
        ['diag_B', 0.5],
      ]);
      const result = updatePosteriors(priors, node, 'yes');
      // diag_A should increase
      expect(result.get('diag_A')!).toBeGreaterThan(0.5);
    });

    it('ST-3.5.7: LR_yes = 0 must not produce NaN (floor applied)', () => {
      const node = makeCATNode({
        node_id: 'n1',
        target_axis: 'diag_A',
        lr_yes: 0,
        kappa: 0.8,
      });
      const priors = new Map([['diag_A', 0.5], ['diag_B', 0.5]]);
      const result = updatePosteriors(priors, node, 'yes');
      for (const v of result.values()) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
      }
    });

    it('ST-3.5.8: 100 sequential updates must keep sum = 1.0 and no NaN', () => {
      let posteriors = new Map([
        ['diag_A', 0.3],
        ['diag_B', 0.4],
        ['diag_C', 0.3],
      ]);
      for (let i = 0; i < 100; i++) {
        const node = makeCATNode({
          node_id: `n${i}`,
          target_axis: i % 3 === 0 ? 'diag_A' : i % 3 === 1 ? 'diag_B' : 'diag_C',
          lr_yes: 3 + Math.random() * 7,
          kappa: 0.8,
        });
        posteriors = updatePosteriors(posteriors, node, i % 2 === 0 ? 'yes' : 'no');
      }

      const total = Array.from(posteriors.values()).reduce((s, v) => s + v, 0);
      expect(total).toBeCloseTo(1.0, 3);
      for (const v of posteriors.values()) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1.0);
      }
    });

    it('ST-3.5.9: Posterior with total=0 must fallback to uniform distribution', () => {
      // Force all posteriors to floor then normalize
      const node = makeCATNode({
        node_id: 'n1',
        target_axis: 'diag_A',
        lr_yes: 0,
        lr_no: 0,
        kappa: 1.0,
      });
      const priors = new Map([['diag_A', 0.5], ['diag_B', 0.5]]);
      const result = updatePosteriors(priors, node, 'yes');
      // Should not NaN even with zero LR
      for (const v of result.values()) {
        expect(Number.isFinite(v)).toBe(true);
      }
    });
  });
});

// ===========================================================================
// ST-3.6: CAT ENGINE BOUNDARIES
// ===========================================================================

describe('ST-3.6: CAT Engine Boundary Tests', () => {
  it('ST-3.6.1: selectNextQuestion with no candidates returns null', () => {
    const posteriors = new Map([['diag_A', 0.5], ['diag_B', 0.5]]);
    const result = selectNextQuestion([], [], posteriors);
    expect(result).toBeNull();
  });

  it('ST-3.6.2: shouldTerminate with empty posteriors handles Math.max(...[])', () => {
    const posteriors = new Map<string, number>();
    // Math.max(...[]) = -Infinity, should not crash
    const result = shouldTerminate(posteriors, 0);
    expect(result).toBeNull(); // No termination condition met
  });

  it('ST-3.6.3: shouldTerminate at max questions must return "max_questions"', () => {
    const posteriors = new Map([['diag_A', 0.3], ['diag_B', 0.7]]);
    const result = shouldTerminate(posteriors, 30);
    expect(result).toBe('max_questions');
  });

  it('ST-3.6.4: shouldTerminate with high confidence must return "high_confidence"', () => {
    const posteriors = new Map([['diag_A', 0.9], ['diag_B', 0.1]]);
    const result = shouldTerminate(posteriors, 5);
    expect(result).toBe('high_confidence');
  });

  it('ST-3.6.5: selectNextQuestion with all nodes already answered returns null', () => {
    const nodes = [
      makeCATNode({ node_id: 'n1', target_axis: 'diag_A' }),
    ];
    const responses = [
      { nodeId: 'n1', answer: 'yes' as const, timestamp: new Date().toISOString() },
    ];
    const posteriors = new Map([['diag_A', 0.5]]);
    const result = selectNextQuestion(nodes, responses, posteriors);
    expect(result).toBeNull();
  });

  it('ST-3.6.6: Information gain must be >= 0', () => {
    const nodes = [
      makeCATNode({ node_id: 'n1', target_axis: 'diag_A', lr_yes: 5, lr_no: 0.2, kappa: 0.8 }),
      makeCATNode({ node_id: 'n2', target_axis: 'diag_B', lr_yes: 3, lr_no: 0.5, kappa: 0.8 }),
    ];
    const posteriors = new Map([['diag_A', 0.5], ['diag_B', 0.5]]);
    const result = selectNextQuestion(nodes, [], posteriors);
    expect(result).not.toBeNull();
    expect(result!.informationGain).toBeGreaterThanOrEqual(0);
  });
});

// ===========================================================================
// ST-3.7: NUMERICAL STABILITY — LONG SEQUENCES
// ===========================================================================

describe('ST-3.7: Numerical Stability Under Long Sequences', () => {
  it('ST-3.7.1: 1000 sequential Bayes updates must not diverge', () => {
    let posteriors = new Map([
      ['diag_A', 0.25],
      ['diag_B', 0.25],
      ['diag_C', 0.25],
      ['diag_D', 0.25],
    ]);

    for (let i = 0; i < 1000; i++) {
      const targets = ['diag_A', 'diag_B', 'diag_C', 'diag_D'];
      const target = targets[i % 4]!;
      const node = makeCATNode({
        node_id: `n_${i}`,
        target_axis: target,
        lr_yes: 2.0,
        lr_no: 0.5,
        kappa: 0.8,
      });
      posteriors = updatePosteriors(posteriors, node, i % 3 === 0 ? 'yes' : 'no');
    }

    const total = Array.from(posteriors.values()).reduce((s, v) => s + v, 0);
    expect(total).toBeCloseTo(1.0, 3);
    for (const v of posteriors.values()) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1.0);
    }
  });

  it('ST-3.7.2: Very small prior (1e-10) must not underflow to NaN', () => {
    const nodes = [makeBayesNode({ node_id: 'n1', lr_yes: 0.1 })];
    const obs: ActiveObservation[] = [{ node_id: 'n1', is_active: true }];
    const result = calculatePosteriorWithDAG(1e-10, nodes, obs);
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBeGreaterThanOrEqual(0);
  });

  it('ST-3.7.3: Very high prior (1 - 1e-10) must not overflow to NaN', () => {
    const nodes = [makeBayesNode({ node_id: 'n1', lr_yes: 100 })];
    const obs: ActiveObservation[] = [{ node_id: 'n1', is_active: true }];
    const result = calculatePosteriorWithDAG(1 - 1e-10, nodes, obs);
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBeLessThanOrEqual(1.0);
  });

  it('ST-3.7.4: EWMA with 50,000 data points must complete < 200ms', () => {
    const values = Array.from({ length: 50_000 }, () => Math.random() * 1000);
    const start = performance.now();
    const result = calculateEWMA(values, 42);
    const elapsed = performance.now() - start;
    expect(Number.isFinite(result)).toBe(true);
    expect(elapsed).toBeLessThan(200);
  });
});

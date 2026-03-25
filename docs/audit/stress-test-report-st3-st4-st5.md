# PACE v6.0 Stress Test Audit Report: ST-3, ST-4, ST-5

**Date:** 2026-03-25
**Auditor:** Automated Stress Test Suite
**Platform Version:** v6.0
**Total Test Cases:** 148 (85 + 16 + 47)
**Overall Result:** ALL 148 TESTS PASS

---

## Summary

| Suite | Tests | Passed | Failed | Duration |
|-------|-------|--------|--------|----------|
| ST-3: Math Boundaries | 85 | 85 | 0 | 311ms |
| ST-4: Load/Performance | 16 | 16 | 0 | 374ms |
| ST-5: Business Logic | 47 | 47 | 0 | 508ms |
| **Total** | **148** | **148** | **0** | **~1.2s** |

---

## ST-3: Mathematical Model Boundary Tests

### ST-3.1: EWMA / ACWR Boundaries

| ID | Test Case | Result | Severity | Notes |
|----|-----------|--------|----------|-------|
| ST-3.1.1 | Empty history array returns 0 | PASS | -- | `calculateEWMA([])` returns 0 |
| ST-3.1.2 | Single data point returns that value | PASS | -- | |
| ST-3.1.3 | All identical values converge to value | PASS | -- | ACWR=1.0 scenario works |
| ST-3.1.4 | NaN values filtered from EWMA | PASS | -- | NaN is silently filtered |
| ST-3.1.5 | Infinity values filtered from EWMA | PASS | -- | Infinity is silently filtered |
| ST-3.1.6 | All NaN array returns 0 | PASS | -- | |
| ST-3.1.7 | All Infinity array returns 0 | PASS | -- | |
| ST-3.1.8 | Alternating 0/1000 (extreme oscillation) | PASS | -- | Numerically stable |
| ST-3.1.9 | 10,000 data points performance | PASS | -- | < 100ms |
| ST-3.1.10 | Span=1 tracks latest value | PASS | -- | |
| ST-3.1.11 | createEWMAConfig span<1 throws | PASS | -- | RangeError thrown correctly |
| ST-3.1.12 | All zero sRPE (chronic=0) ACWR=0 | PASS | -- | Division by zero guarded |
| ST-3.1.13 | Empty history with zero input valid | PASS | -- | |
| ST-3.1.14 | Identical loads monotony fallback | PASS | -- | MONOTONY_HIGH_FALLBACK=3.0 used |

### ST-3.2: Conditioning Score Boundaries

| ID | Test Case | Result | Severity | Notes |
|----|-----------|--------|----------|-------|
| ST-3.2.1 | All inputs = 0 score in [0,100] | PASS | -- | Returns 50 (neutral) |
| ST-3.2.2 | Extreme day stays in [0,100] | PASS | -- | Clamp function works |
| ST-3.2.3 | HRV=0 no divide by zero | PASS | -- | isProMode=false when hrv=0 |
| ST-3.2.4 | HRV baseline=0 with HRV>0 safe | PASS | -- | isProMode=false when baseline=0 |
| ST-3.2.5 | Massive sRPE spike safe | PASS | -- | Score stays 0-100 |
| ST-3.2.6 | Sleep score boundaries (0 and 10) | PASS | -- | Penalty correctly applied |
| ST-3.2.7 | Fatigue boundaries (0 and 10) | PASS | -- | Penalty correctly applied |

### ST-3.3: Bayes Inference Boundaries

| ID | Test Case | Result | Severity | Notes |
|----|-----------|--------|----------|-------|
| ST-3.3.1 | Prior=0 odds not NaN | PASS | -- | Clamped to 1e-10 |
| ST-3.3.2 | Prior=1 odds not Infinity | PASS | -- | Clamped to 1-1e-10 |
| ST-3.3.3 | Negative odds returns probability 0 | PASS | -- | |
| ST-3.3.4 | Infinite odds returns probability 1.0 | PASS | -- | |
| ST-3.3.5 | Odds=0 returns probability 0 | PASS | -- | |
| ST-3.3.6 | Round-trip preserves value | PASS | -- | Within 1e-5 precision |
| ST-3.3.7 | LR=0 produces valid adjusted LR | PASS | -- | |
| ST-3.3.8 | C_score<0.3 rejects (LR=1.0) | PASS | -- | Threshold correctly applied |
| ST-3.3.9 | kappa=0 neutralizes LR | PASS | -- | LR_adjusted=1.0 |
| ST-3.3.10 | kappa=1 standard behavior | PASS | -- | LR_adjusted=4.2 |
| ST-3.3.11 | Negative LR produces finite result | PASS | -- | **NOTE:** adjusted LR can go negative (-2.84). Not clamped. Low severity since negative LR is not a valid input in practice. |
| ST-3.3.12 | No active parents returns raw LR | PASS | -- | |
| ST-3.3.13 | Discount factor=0 means no discount | PASS | -- | |
| ST-3.3.14 | Discount factor=1 means complete discount | PASS | -- | Effective LR=1.0 |
| ST-3.3.15 | Discount factor>1 clamped to 1 | PASS | -- | Correctly clamped |
| ST-3.3.16 | Discount factor<0 clamped to 0 | PASS | -- | Correctly clamped |
| ST-3.3.17 | LR=1.0 always returns 1.0 | PASS | -- | |
| ST-3.3.18 | Prior=0 returns 0 | PASS | -- | Mathematically correct |
| ST-3.3.19 | Prior=1 returns 1 | PASS | -- | Mathematically correct |
| ST-3.3.20 | Prior<0 throws | PASS | -- | Validation works |
| ST-3.3.21 | Prior>1 throws | PASS | -- | Validation works |
| ST-3.3.22 | No observations returns prior | PASS | -- | |
| ST-3.3.23 | All inactive observations returns prior | PASS | -- | |
| ST-3.3.24 | 100 nodes with LR>10 posterior<=1.0 | PASS | -- | No overflow |
| ST-3.3.25 | Missing node_id skipped silently | PASS | -- | console.warn issued |
| ST-3.3.26 | No athlete context C_score=0 | PASS | -- | |
| ST-3.3.27 | Empty athlete context C_score=0 | PASS | -- | |
| ST-3.3.28 | Full athlete context C_score=1.0 | PASS | -- | |
| ST-3.3.29 | No context modifier=1.0 | PASS | -- | |
| ST-3.3.30 | All risk factors floor at 0.5 | PASS | -- | Math.max(0.5, modifier) |

### ST-3.4: Time Decay Boundaries

| ID | Test Case | Result | Severity | Notes |
|----|-----------|--------|----------|-------|
| ST-3.4.1 | Zero days returns initial risk | PASS | -- | |
| ST-3.4.2 | 1000 days converges to 0 | PASS | -- | |
| ST-3.4.3 | lambda=0 no decay | PASS | -- | |
| ST-3.4.4 | Negative lambda no decay | PASS | -- | |
| ST-3.4.5 | Negative days returns initial risk | PASS | -- | |
| ST-3.4.6 | Initial risk=0 always 0 | PASS | -- | |
| ST-3.4.7 | Initial risk>1 clamped to 1 | PASS | -- | |
| ST-3.4.8 | lambdaFromHalfLife(0) throws | PASS | -- | |
| ST-3.4.9 | lambdaFromHalfLife(-1) throws | PASS | -- | |
| ST-3.4.10 | halfLifeFromLambda(0) throws | PASS | -- | |
| ST-3.4.11 | Round trip halfLife/lambda | PASS | -- | |
| ST-3.4.12 | daysUntilThreshold risk<=threshold=0 | PASS | -- | |
| ST-3.4.13 | daysUntilThreshold lambda=0=Infinity | PASS | -- | |
| ST-3.4.14 | daysUntilThreshold threshold=0=Infinity | PASS | -- | |
| ST-3.4.15 | ChronicModifier>1.0 slows decay | PASS | -- | |

### ST-3.5: Posterior Updater Boundaries

| ID | Test Case | Result | Severity | Notes |
|----|-----------|--------|----------|-------|
| ST-3.5.1 | No nodes returns empty map | PASS | -- | |
| ST-3.5.2 | Single node normalizes to 1.0 | PASS | -- | |
| ST-3.5.3 | Multiple nodes sum to 1.0 | PASS | -- | |
| ST-3.5.4 | answer="unknown" no change | PASS | -- | Returns copy of priors |
| ST-3.5.5 | kappa=0 neutralizes LR | PASS | -- | |
| ST-3.5.6 | kappa=1 applies full LR | PASS | -- | |
| ST-3.5.7 | LR_yes=0 no NaN | PASS | -- | POSTERIOR_FLOOR applied |
| ST-3.5.8 | 100 sequential updates stable | PASS | -- | Sum stays ~1.0 |
| ST-3.5.9 | Total=0 fallback to uniform | PASS | -- | |

### ST-3.6: CAT Engine Boundaries

| ID | Test Case | Result | Severity | Notes |
|----|-----------|--------|----------|-------|
| ST-3.6.1 | No candidates returns null | PASS | -- | |
| ST-3.6.2 | Empty posteriors Math.max safe | PASS | -- | |
| ST-3.6.3 | Max questions terminates | PASS | -- | Returns "max_questions" |
| ST-3.6.4 | High confidence terminates | PASS | -- | Returns "high_confidence" |
| ST-3.6.5 | All answered returns null | PASS | -- | |
| ST-3.6.6 | Information gain >= 0 | PASS | -- | Math.max(0, ...) applied |

### ST-3.7: Numerical Stability

| ID | Test Case | Result | Severity | Notes |
|----|-----------|--------|----------|-------|
| ST-3.7.1 | 1000 sequential Bayes updates stable | PASS | -- | Sum stays ~1.0, no NaN |
| ST-3.7.2 | Very small prior (1e-10) no underflow | PASS | -- | |
| ST-3.7.3 | Very high prior (1-1e-10) no overflow | PASS | -- | |
| ST-3.7.4 | EWMA 50,000 points < 200ms | PASS | -- | |

---

## ST-4: Load / Performance Tests

### ST-4.1: Throughput Tests

| ID | Test Case | Result | Severity | Notes |
|----|-----------|--------|----------|-------|
| ST-4.1.1 | 100 athletes < 10s | PASS | -- | Well under threshold |
| ST-4.1.2 | 365 days history < 200ms | PASS | -- | |
| ST-4.1.3 | 1000 DAG updates < 500ms | PASS | -- | |
| ST-4.1.4 | 10,000 EWMA points < 50ms | PASS | -- | |
| ST-4.1.5 | 10,000 decay calculations < 100ms | PASS | -- | |

### ST-4.2: Memory Stability

| ID | Test Case | Result | Severity | Notes |
|----|-----------|--------|----------|-------|
| ST-4.2.1 | 10,000 calculations < 100MB growth | PASS | -- | |
| ST-4.2.2 | 1000 pipeline instances no crash | PASS | -- | |

### ST-4.3: State Isolation

| ID | Test Case | Result | Severity | Notes |
|----|-----------|--------|----------|-------|
| ST-4.3.1 | Sequential calls deterministic | PASS | -- | All 100 identical |
| ST-4.3.2 | Different athletes independent | PASS | -- | |
| ST-4.3.3 | Pipeline instances independent | PASS | -- | Config not shared |
| ST-4.3.4 | Posterior maps immutable | PASS | -- | Original priors unchanged |
| ST-4.3.5 | DAG does not mutate inputs | PASS | -- | |

### ST-4.4: Extreme Input Sizes

| ID | Test Case | Result | Severity | Notes |
|----|-----------|--------|----------|-------|
| ST-4.4.1 | 1000 days history valid | PASS | -- | |
| ST-4.4.2 | 500 diagnosis candidates | PASS | -- | Sum stays 1.0 |
| ST-4.4.3 | 200 DAG observations < 100ms | PASS | -- | |
| ST-4.4.4 | MAX_SAFE_INTEGER sRPE safe | PASS | -- | Score stays 0-100 |

---

## ST-5: Business Logic Invariant Tests

### ST-5.1: Priority Hierarchy

| ID | Test Case | Result | Severity | Notes |
|----|-----------|--------|----------|-------|
| ST-5.1.1 | P1 (painNRS>=8) always RED | PASS | -- | Tested for pain 8,9,10 |
| ST-5.1.2 | P1 overrides P2 (extreme ACWR) | PASS | -- | |
| ST-5.1.3 | P1 overrides P2-P5 all combos | PASS | -- | Post-fever + all triggers |
| ST-5.1.4 | GameDay NEVER suppresses P1 | PASS | -- | Safety cannot be overridden |
| ST-5.1.5 | P2 ACWR>1.5 produces ORANGE | PASS | -- | |
| ST-5.1.6 | P2 Monotony>2.0 produces ORANGE | PASS | -- | |
| ST-5.1.7 | P2 tissue damage>0.8 ORANGE | PASS | -- | |
| ST-5.1.8 | P3 decoupling produces YELLOW | PASS | -- | |
| ST-5.1.9 | P5 normal produces GREEN | PASS | -- | |
| ST-5.1.10 | P1 post-vaccination produces RED | PASS | -- | |

### ST-5.2: Data Consistency

| ID | Test Case | Result | Severity | Notes |
|----|-----------|--------|----------|-------|
| ST-5.2.1 | Conditioning score [0,100] (5 cases) | PASS | -- | All edge cases covered |
| ST-5.2.2 | ACWR >= 0 with zero loads | PASS | -- | |
| ST-5.2.3 | ACWR >= 0 with normal loads | PASS | -- | |
| ST-5.2.4 | sRPE > 10 detected as outlier | PASS | -- | Node 1 clamps correctly |
| ST-5.2.5 | sRPE = -1 detected as outlier | PASS | -- | |
| ST-5.2.6 | painNRS > 10 detected as outlier | PASS | -- | |
| ST-5.2.7 | painNRS = -5 clamped to >= 0 | PASS | -- | |
| ST-5.2.8 | Day 0 = "safety" mode | PASS | -- | |
| ST-5.2.9 | Day 13 = "safety" mode | PASS | -- | |
| ST-5.2.10 | Day 14 = "learning" mode | PASS | -- | |
| ST-5.2.11 | Day 28 = "full" mode | PASS | -- | |

### ST-5.3: Concurrency Safety

| ID | Test Case | Result | Severity | Notes |
|----|-----------|--------|----------|-------|
| ST-5.3.1 | Simultaneous Node 4 calls no corruption | PASS | -- | Promise.all verified |
| ST-5.3.2 | Pipeline state isolated | PASS | -- | Separate Map instances |
| ST-5.3.3 | 50 concurrent calculations valid | PASS | -- | All scores in [0,100] |

### ST-5.4: Context Override

| ID | Test Case | Result | Severity | Notes |
|----|-----------|--------|----------|-------|
| ST-5.4.1 | GameDay recorded in overridesApplied | PASS | -- | |
| ST-5.4.2 | Acclimatization recorded | PASS | -- | |
| ST-5.4.3 | Weight making recorded | PASS | -- | |
| ST-5.4.4 | P4 GameDay stricter threshold | PASS | -- | Z-threshold shifts -1.5 to -2.0 |

### ST-5.5: Assessment Flow Edge Cases

| ID | Test Case | Result | Severity | Notes |
|----|-----------|--------|----------|-------|
| ST-5.5.1 | 0 questions handled gracefully | PASS | -- | No termination |
| ST-5.5.2 | No active nodes returns empty | PASS | -- | |
| ST-5.5.3 | Red flag detection works | PASS | -- | severity=critical |
| ST-5.5.4 | Red flag NOT triggered on "no" | PASS | -- | |
| ST-5.5.5 | No routing_rules returns null | PASS | -- | |
| ST-5.5.6 | Empty posteriors buildResult safe | PASS | -- | |
| ST-5.5.7 | Double answer idempotent | PASS | -- | Sum still 1.0 |

### ST-5.6: Decision Output Structure

| ID | Test Case | Result | Severity | Notes |
|----|-----------|--------|----------|-------|
| ST-5.6.1 | Every decision has non-empty reason | PASS | -- | All priorities tested |
| ST-5.6.2 | Every decision has >= 1 action | PASS | -- | |
| ST-5.6.3 | P1/P2 actions require approval | PASS | -- | |
| ST-5.6.4 | P5 actions do NOT require approval | PASS | -- | |

### ST-5.7: Pipeline Fallback

| ID | Test Case | Result | Severity | Notes |
|----|-----------|--------|----------|-------|
| ST-5.7.1 | No nodes produces fallback ORANGE | PASS | -- | Conservative |
| ST-5.7.2 | Fallback has valid traceId | PASS | -- | UUID generated |
| ST-5.7.3 | Pipeline sets athleteId | PASS | -- | |
| ST-5.7.4 | buildTraceLog valid structure | PASS | -- | |

---

## Findings & Observations

### Potential Improvement Areas (Low Severity)

1. **ST-3.3.11: `computeAdjustedLr` with negative LR** — The function does not guard against negative LR values. When `LR_raw = -5, C_score = 0.8, kappa = 0.8`, the result is `-2.84`. While negative LR is not a valid domain input, adding a `Math.max(0, ...)` clamp would prevent silent corruption if upstream data is malformed.
   - **Severity:** LOW
   - **Recommendation:** Add `if (lrRaw <= 0) return 1.0;` guard in `computeAdjustedLr`

2. **Node 2 Monotony SIGMA_EPSILON guard** — When all 7-day loads are identical (sigma < 1e-6), the code returns `MONOTONY_HIGH_FALLBACK = 3.0` instead of `Infinity`. This is correct behavior, but the fallback value of 3.0 is above the `monotonyRedLine` threshold of 2.0, meaning identical training loads always trigger P2. This may be intentional (monotonous training is a risk factor).
   - **Severity:** INFO
   - **Recommendation:** Document this intentional design choice

3. **`shouldTerminate` with empty posteriors** — `Math.max(...posteriors.values())` on an empty Map produces `-Infinity`. The code handles this correctly (no termination triggered), but this relies on the comparison `-Infinity > 0.85` being false.
   - **Severity:** LOW
   - **Recommendation:** Add explicit empty-check for clarity

### Confirmed Robust Behaviors

- **NaN propagation fully blocked** at every mathematical boundary (EWMA, Bayes, posterior, decay)
- **Division by zero fully guarded** in ACWR (chronic=0), monotony (sigma=0), odds conversion (prob=0/1), HRV ratio (baseline=0)
- **Numerical stability verified** through 1000+ sequential updates without divergence
- **Priority hierarchy P1 > P2 > P3 > P4 > P5** enforced unconditionally, even on game day
- **Pipeline state isolation** confirmed through concurrent Promise.all execution
- **Input validation** (Node 1 clamping) correctly rejects out-of-range sRPE, painNRS, and all subjective scores
- **Immutability** confirmed: updatePosteriors never mutates the input Map; calculatePosteriorWithDAG never mutates input arrays

---

## Conclusion

All 148 stress tests pass. The PACE v6.0 platform demonstrates robust handling of mathematical edge cases, maintains all business logic invariants, and performs well under load. Three low-severity improvement opportunities were identified but none represent system-critical vulnerabilities.

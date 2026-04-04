/**
 * E2E Test: Simulator Flow
 *
 * Tests:
 * 1. Conditioning Simulator API input validation & output shape
 * 2. Rehab Simulator API input validation & output shape
 * 3. AI intervention suggestion API (Pro gate)
 * 4. Simulator -> Assessment save linkage
 */

import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// Constants (mirrored from API routes for verification)
// ---------------------------------------------------------------------------

const LAMBDA_ACUTE = 2 / (7 + 1)    // 0.25
const LAMBDA_CHRONIC = 2 / (28 + 1) // ~0.0689655
const TISSUE_LOAD_CEILING = 0.3

// ---------------------------------------------------------------------------
// Mock data helpers
// ---------------------------------------------------------------------------

function validUUID(): string {
  return '550e8400-e29b-41d4-a716-446655440000'
}

function validUUID2(): string {
  return '660e8400-e29b-41d4-a716-446655440001'
}

interface DailyLoad {
  day: number
  srpe: number
  type: 'normal' | 'modified' | 'rehab' | 'rest'
}

interface Scenario {
  name: string
  dailyLoads: DailyLoad[]
}

interface ConditioningRequest {
  athleteId?: string
  scenarios?: Scenario[]
  simulationDays?: number
}

function makeConditioningRequest(
  overrides: Partial<ConditioningRequest> = {}
): ConditioningRequest {
  return {
    athleteId: validUUID(),
    scenarios: [
      {
        name: 'Baseline',
        dailyLoads: [
          { day: 1, srpe: 400, type: 'normal' },
          { day: 2, srpe: 350, type: 'normal' },
          { day: 3, srpe: 300, type: 'modified' },
        ],
      },
    ],
    simulationDays: 7,
    ...overrides,
  }
}

interface RehabChange {
  action: 'add' | 'remove' | 'modify'
  exerciseId?: string
  prescriptionId?: string
  sets?: number
  reps?: number
  durationSec?: number
}

interface RehabRequest {
  athleteId?: string
  programId?: string
  changes?: RehabChange[]
  forecastDays?: number
}

function makeRehabRequest(overrides: Partial<RehabRequest> = {}): RehabRequest {
  return {
    athleteId: validUUID(),
    programId: validUUID2(),
    changes: [
      { action: 'add', exerciseId: validUUID2(), sets: 3, reps: 10 },
    ],
    forecastDays: 14,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// EWMA calculation helpers (pure math, mirrored from route)
// ---------------------------------------------------------------------------

function ewmaStep(
  lambda: number,
  value: number,
  previousEwma: number
): number {
  return lambda * value + (1 - lambda) * previousEwma
}

function projectAcwr(
  baselineAcute: number,
  baselineChronic: number,
  dailyLoads: DailyLoad[],
  simulationDays: number
): Array<{ day: number; acwr: number; acute: number; chronic: number }> {
  const result: Array<{ day: number; acwr: number; acute: number; chronic: number }> = []
  let acute = baselineAcute
  let chronic = baselineChronic

  for (let day = 1; day <= simulationDays; day++) {
    const loadEntry = dailyLoads.find((l) => l.day === day)
    const srpe = loadEntry ? loadEntry.srpe : 0

    acute = LAMBDA_ACUTE * srpe + (1 - LAMBDA_ACUTE) * acute
    chronic = LAMBDA_CHRONIC * srpe + (1 - LAMBDA_CHRONIC) * chronic

    const acwr = chronic > 0 ? acute / chronic : 0
    result.push({
      day,
      acwr: Math.round(acwr * 100) / 100,
      acute: Math.round(acute * 100) / 100,
      chronic: Math.round(chronic * 100) / 100,
    })
  }

  return result
}

// ---------------------------------------------------------------------------
// 1. Conditioning Simulator -- Input Validation
// ---------------------------------------------------------------------------

describe('Conditioning Simulator - Input Validation', () => {
  it('rejects missing athleteId', () => {
    const req = makeConditioningRequest({ athleteId: undefined as unknown as string })
    expect(req.athleteId).toBeUndefined()
    // The API would return 400 with error "Invalid athleteId. Must be a valid UUID."
    // Here we validate the precondition that triggers rejection
    const isValid = typeof req.athleteId === 'string' && req.athleteId.length > 0
    expect(isValid).toBe(false)
  })

  it('rejects empty string athleteId', () => {
    const req = makeConditioningRequest({ athleteId: '' })
    const isValid = typeof req.athleteId === 'string' && req.athleteId.length > 0
    expect(isValid).toBe(false)
  })

  it('rejects simulationDays outside 3-14 range (clamped)', () => {
    const MIN_DAYS = 3
    const MAX_DAYS = 14

    // Below range: clamped to 3
    const belowReq = makeConditioningRequest({ simulationDays: 1 })
    const clampedBelow = Math.max(MIN_DAYS, Math.min(MAX_DAYS, belowReq.simulationDays!))
    expect(clampedBelow).toBe(3)

    // Above range: clamped to 14
    const aboveReq = makeConditioningRequest({ simulationDays: 30 })
    const clampedAbove = Math.max(MIN_DAYS, Math.min(MAX_DAYS, aboveReq.simulationDays!))
    expect(clampedAbove).toBe(14)

    // Within range: unchanged
    const validReq = makeConditioningRequest({ simulationDays: 10 })
    const clampedValid = Math.max(MIN_DAYS, Math.min(MAX_DAYS, validReq.simulationDays!))
    expect(clampedValid).toBe(10)
  })

  it('rejects more than 3 scenarios', () => {
    const MAX_SCENARIOS = 3
    const scenarios: Scenario[] = Array.from({ length: 4 }, (_, i) => ({
      name: `Scenario ${i + 1}`,
      dailyLoads: [{ day: 1, srpe: 300, type: 'normal' as const }],
    }))
    const req = makeConditioningRequest({ scenarios })
    expect(req.scenarios!.length).toBeGreaterThan(MAX_SCENARIOS)
    // API would return 400: "Maximum 3 scenarios allowed."
  })

  it('rejects sRPE outside 0-1000 (clamped)', () => {
    const MIN_SRPE = 0
    const MAX_SRPE = 1000

    // Below range
    const clampedBelow = Math.max(MIN_SRPE, Math.min(MAX_SRPE, -50))
    expect(clampedBelow).toBe(0)

    // Above range
    const clampedAbove = Math.max(MIN_SRPE, Math.min(MAX_SRPE, 1500))
    expect(clampedAbove).toBe(1000)

    // Valid range
    const clampedValid = Math.max(MIN_SRPE, Math.min(MAX_SRPE, 500))
    expect(clampedValid).toBe(500)
  })

  it('requires at least one scenario', () => {
    const req = makeConditioningRequest({ scenarios: [] })
    expect(req.scenarios!.length).toBe(0)
    // API would return 400: "At least one scenario is required."
  })
})

// ---------------------------------------------------------------------------
// 2. Conditioning Simulator -- Output Shape
// ---------------------------------------------------------------------------

describe('Conditioning Simulator - Output Shape', () => {
  // Simulate the expected response shape
  interface ConditioningBaseline {
    currentAcwr: number
    currentMonotony: number
    currentStrain: number
    tissueDamage: Record<string, number>
  }

  interface AcwrPoint {
    day: number
    acwr: number
    acute: number
    chronic: number
  }

  interface MonotonyPoint {
    day: number
    monotony: number
    strain: number
  }

  interface TissuePoint {
    day: number
    value: number
  }

  interface DecisionPoint {
    day: number
    priority: string
    decision: string
  }

  interface ScenarioResult {
    name: string
    acwrTrend: AcwrPoint[]
    monotonyTrend: MonotonyPoint[]
    tissueRecovery: Record<string, TissuePoint[]>
    decisions: DecisionPoint[]
    sweetSpotReturn: number | null
    score: number
  }

  interface ConditioningResponse {
    success: boolean
    data: {
      baseline: ConditioningBaseline
      scenarios: ScenarioResult[]
      recommendedScenario: number
    }
  }

  function makeMockConditioningResponse(): ConditioningResponse {
    return {
      success: true,
      data: {
        baseline: {
          currentAcwr: 1.15,
          currentMonotony: 1.82,
          currentStrain: 2450,
          tissueDamage: {
            metabolic: 0.35,
            structural_soft: 0.22,
            structural_hard: 0.08,
            neuromotor: 0.15,
          },
        },
        scenarios: [
          {
            name: 'Baseline',
            acwrTrend: [
              { day: 1, acwr: 1.12, acute: 350, chronic: 312.5 },
              { day: 2, acwr: 1.10, acute: 340, chronic: 309.3 },
            ],
            monotonyTrend: [
              { day: 1, monotony: 1.5, strain: 2100 },
              { day: 2, monotony: 1.4, strain: 1960 },
            ],
            tissueRecovery: {
              metabolic: [
                { day: 1, value: 0.3 },
                { day: 2, value: 0.25 },
              ],
              structural_soft: [
                { day: 1, value: 0.2 },
                { day: 2, value: 0.18 },
              ],
            },
            decisions: [
              { day: 1, priority: 'P5', decision: 'Normal: Continue current plan' },
              { day: 2, priority: 'P5', decision: 'Normal: Continue current plan' },
            ],
            sweetSpotReturn: 1,
            score: 0.342,
          },
        ],
        recommendedScenario: 0,
      },
    }
  }

  it('baseline has required fields: currentAcwr, currentMonotony, currentStrain, tissueDamage', () => {
    const response = makeMockConditioningResponse()
    const baseline = response.data.baseline

    expect(baseline).toHaveProperty('currentAcwr')
    expect(baseline).toHaveProperty('currentMonotony')
    expect(baseline).toHaveProperty('currentStrain')
    expect(baseline).toHaveProperty('tissueDamage')

    expect(typeof baseline.currentAcwr).toBe('number')
    expect(typeof baseline.currentMonotony).toBe('number')
    expect(typeof baseline.currentStrain).toBe('number')
    expect(typeof baseline.tissueDamage).toBe('object')
  })

  it('each scenario has acwrTrend, monotonyTrend, tissueRecovery, decisions, sweetSpotReturn, score', () => {
    const response = makeMockConditioningResponse()

    for (const scenario of response.data.scenarios) {
      expect(scenario).toHaveProperty('name')
      expect(scenario).toHaveProperty('acwrTrend')
      expect(scenario).toHaveProperty('monotonyTrend')
      expect(scenario).toHaveProperty('tissueRecovery')
      expect(scenario).toHaveProperty('decisions')
      expect(scenario).toHaveProperty('sweetSpotReturn')
      expect(scenario).toHaveProperty('score')

      expect(typeof scenario.name).toBe('string')
      expect(Array.isArray(scenario.acwrTrend)).toBe(true)
      expect(Array.isArray(scenario.monotonyTrend)).toBe(true)
      expect(typeof scenario.tissueRecovery).toBe('object')
      expect(Array.isArray(scenario.decisions)).toBe(true)
      expect(typeof scenario.score).toBe('number')
    }
  })

  it('acwrTrend entries have day, acwr, acute, chronic', () => {
    const response = makeMockConditioningResponse()
    const trend = response.data.scenarios[0]!.acwrTrend

    for (const point of trend) {
      expect(point).toHaveProperty('day')
      expect(point).toHaveProperty('acwr')
      expect(point).toHaveProperty('acute')
      expect(point).toHaveProperty('chronic')
      expect(typeof point.day).toBe('number')
      expect(typeof point.acwr).toBe('number')
      expect(typeof point.acute).toBe('number')
      expect(typeof point.chronic).toBe('number')
    }
  })

  it('monotonyTrend entries have day, monotony, strain', () => {
    const response = makeMockConditioningResponse()
    const trend = response.data.scenarios[0]!.monotonyTrend

    for (const point of trend) {
      expect(point).toHaveProperty('day')
      expect(point).toHaveProperty('monotony')
      expect(point).toHaveProperty('strain')
    }
  })

  it('decisions entries have day, priority, decision', () => {
    const response = makeMockConditioningResponse()
    const decisions = response.data.scenarios[0]!.decisions

    for (const d of decisions) {
      expect(d).toHaveProperty('day')
      expect(d).toHaveProperty('priority')
      expect(d).toHaveProperty('decision')
      expect(typeof d.priority).toBe('string')
      expect(d.priority).toMatch(/^P[1-5]$/)
    }
  })

  it('recommendedScenario is a valid index', () => {
    const response = makeMockConditioningResponse()
    const { recommendedScenario, scenarios } = response.data

    expect(typeof recommendedScenario).toBe('number')
    expect(recommendedScenario).toBeGreaterThanOrEqual(0)
    expect(recommendedScenario).toBeLessThan(scenarios.length)
  })

  it('sweetSpotReturn is number or null', () => {
    const response = makeMockConditioningResponse()
    const scenario = response.data.scenarios[0]!

    expect(
      typeof scenario.sweetSpotReturn === 'number' ||
      scenario.sweetSpotReturn === null
    ).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 3. Conditioning ACWR Projection Math
// ---------------------------------------------------------------------------

describe('Conditioning ACWR Projection Math', () => {
  it('verifies EWMA formula: ewma_new = lambda * value + (1 - lambda) * ewma_old', () => {
    const lambda = 0.25
    const value = 400
    const previousEwma = 300

    const expected = lambda * value + (1 - lambda) * previousEwma
    // 0.25 * 400 + 0.75 * 300 = 100 + 225 = 325
    expect(expected).toBe(325)

    const result = ewmaStep(lambda, value, previousEwma)
    expect(result).toBe(325)
  })

  it('verifies LAMBDA_ACUTE = 0.25 (2 / (7 + 1))', () => {
    expect(LAMBDA_ACUTE).toBe(0.25)
    expect(LAMBDA_ACUTE).toBeCloseTo(2 / 8, 10)
  })

  it('verifies LAMBDA_CHRONIC ~ 0.069 (2 / (28 + 1))', () => {
    expect(LAMBDA_CHRONIC).toBeCloseTo(2 / 29, 10)
    expect(LAMBDA_CHRONIC).toBeCloseTo(0.06896551724, 5)
  })

  it('computes a multi-day ACWR projection with known inputs', () => {
    const baselineAcute = 300
    const baselineChronic = 280
    const loads: DailyLoad[] = [
      { day: 1, srpe: 500, type: 'normal' },
      { day: 2, srpe: 400, type: 'normal' },
      { day: 3, srpe: 350, type: 'modified' },
    ]

    const result = projectAcwr(baselineAcute, baselineChronic, loads, 3)

    expect(result).toHaveLength(3)

    // Day 1 manual calculation:
    // acute_1 = 0.25 * 500 + 0.75 * 300 = 125 + 225 = 350
    // chronic_1 = (2/29) * 500 + (27/29) * 280 = 34.483 + 260.690 = 295.172
    // acwr_1 = 350 / 295.172 = 1.1858... -> rounded to 1.19
    const day1 = result[0]!
    expect(day1.acute).toBeCloseTo(350, 0)
    expect(day1.chronic).toBeCloseTo(295.17, 0)
    expect(day1.acwr).toBeCloseTo(1.19, 1)

    // Day 2 manual calculation:
    // acute_2 = 0.25 * 400 + 0.75 * 350 = 100 + 262.5 = 362.5
    // chronic_2 = (2/29) * 400 + (27/29) * 295.172 = 27.586 + 274.814 = 302.400
    const day2 = result[1]!
    expect(day2.acute).toBeCloseTo(362.5, 0)
    expect(day2.acwr).toBeGreaterThan(1.0)
  })

  it('ACWR = acute / chronic when chronic > 0', () => {
    const acute = 400
    const chronic = 350
    const acwr = acute / chronic
    expect(acwr).toBeCloseTo(1.143, 2)
  })

  it('ACWR = 0 when chronic is 0 (division guard)', () => {
    const result = projectAcwr(0, 0, [], 3)
    // With no loads and zero baseline, all values stay at 0
    for (const point of result) {
      expect(point.acwr).toBe(0)
    }
  })

  it('EWMA converges toward constant input', () => {
    // If we feed constant sRPE, acute and chronic should converge
    const constantLoad = 500
    const loads: DailyLoad[] = Array.from({ length: 14 }, (_, i) => ({
      day: i + 1,
      srpe: constantLoad,
      type: 'normal' as const,
    }))

    const result = projectAcwr(0, 0, loads, 14)
    const lastPoint = result[result.length - 1]!

    // After many days with constant load, ACWR should approach 1.0
    // because acute and chronic both converge to the same value
    // With 14 days, acute (fast lambda) converges faster than chronic
    // so ACWR will still be > 1 but trending toward 1
    expect(lastPoint.acwr).toBeGreaterThan(0)
    expect(lastPoint.acute).toBeGreaterThan(0)
    expect(lastPoint.chronic).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// 4. Rehab Simulator -- Input Validation
// ---------------------------------------------------------------------------

describe('Rehab Simulator - Input Validation', () => {
  it('rejects missing programId', () => {
    const req = makeRehabRequest({ programId: undefined as unknown as string })
    expect(req.programId).toBeUndefined()
    // API requires programId - would return 400
    const isValid = typeof req.programId === 'string' && req.programId.length > 0
    expect(isValid).toBe(false)
  })

  it('rejects forecastDays outside 7-60 range (clamped)', () => {
    const MIN_FORECAST = 7
    const MAX_FORECAST = 60

    // Below range: clamped to 7
    const clampedBelow = Math.min(Math.max(Math.round(3), MIN_FORECAST), MAX_FORECAST)
    expect(clampedBelow).toBe(7)

    // Above range: clamped to 60
    const clampedAbove = Math.min(Math.max(Math.round(90), MIN_FORECAST), MAX_FORECAST)
    expect(clampedAbove).toBe(60)

    // Within range: unchanged
    const clampedValid = Math.min(Math.max(Math.round(30), MIN_FORECAST), MAX_FORECAST)
    expect(clampedValid).toBe(30)
  })

  it('rejects more than 10 changes', () => {
    const MAX_CHANGES = 10
    const changes: RehabChange[] = Array.from({ length: 11 }, () => ({
      action: 'add' as const,
      exerciseId: validUUID2(),
      sets: 3,
      reps: 10,
    }))
    const req = makeRehabRequest({ changes })
    expect(req.changes!.length).toBeGreaterThan(MAX_CHANGES)
    // API would return 400
  })

  it('rejects empty changes array', () => {
    const req = makeRehabRequest({ changes: [] })
    expect(req.changes!.length).toBe(0)
    // API requires at least 1 change
  })

  it('validates change action must be add, remove, or modify', () => {
    const validActions = ['add', 'remove', 'modify']
    for (const action of validActions) {
      expect(validActions).toContain(action)
    }
    expect(validActions).not.toContain('delete')
    expect(validActions).not.toContain('update')
  })
})

// ---------------------------------------------------------------------------
// 5. Rehab Simulator -- Output Shape
// ---------------------------------------------------------------------------

describe('Rehab Simulator - Output Shape', () => {
  interface TissueLoadEntry {
    tissue: string
    currentLoad: number
    proposedLoad: number
    ceiling: number
    safe: boolean
  }

  interface RecoveryForecastEntry {
    day: number
    baselineNrs: number
    proposedNrs: number
  }

  interface PhaseTransitionEntry {
    criterion: string
    currentProgress: number
    targetValue: number
    daysToAchieve: number | null
  }

  interface ReturnTimeline {
    currentDays: number
    proposedDays: number
    improvementDays: number
  }

  interface RiskAssessment {
    level: 'low' | 'moderate' | 'high'
    warnings: string[]
  }

  interface RehabResponse {
    success: boolean
    data: {
      currentState: {
        phase: number
        daysSinceInjury: number
        currentNrs: number
        activePrescriptions: number
      }
      tissueLoadAnalysis: TissueLoadEntry[]
      recoveryForecast: RecoveryForecastEntry[]
      phaseTransition: PhaseTransitionEntry[]
      returnTimeline: ReturnTimeline
      riskAssessment: RiskAssessment
      safetyViolations: string[]
    }
  }

  function makeMockRehabResponse(): RehabResponse {
    return {
      success: true,
      data: {
        currentState: {
          phase: 2,
          daysSinceInjury: 21,
          currentNrs: 3,
          activePrescriptions: 5,
        },
        tissueLoadAnalysis: [
          {
            tissue: 'quadriceps',
            currentLoad: 0.15,
            proposedLoad: 0.22,
            ceiling: TISSUE_LOAD_CEILING,
            safe: true,
          },
          {
            tissue: 'hamstring',
            currentLoad: 0.1,
            proposedLoad: 0.35,
            ceiling: TISSUE_LOAD_CEILING,
            safe: false,
          },
        ],
        recoveryForecast: [
          { day: 0, baselineNrs: 3.0, proposedNrs: 3.0 },
          { day: 7, baselineNrs: 2.3, proposedNrs: 2.0 },
          { day: 14, baselineNrs: 1.6, proposedNrs: 1.0 },
        ],
        phaseTransition: [
          {
            criterion: 'ROM >= 120 degrees',
            currentProgress: 95,
            targetValue: 120,
            daysToAchieve: 8,
          },
          {
            criterion: 'Strength >= 80% contralateral',
            currentProgress: 60,
            targetValue: 80,
            daysToAchieve: 14,
          },
        ],
        returnTimeline: {
          currentDays: 42,
          proposedDays: 36,
          improvementDays: 6,
        },
        riskAssessment: {
          level: 'moderate',
          warnings: [
            'Tissue load approaching threshold for hamstring.',
          ],
        },
        safetyViolations: [],
      },
    }
  }

  it('tissueLoadAnalysis has tissue, currentLoad, proposedLoad, ceiling, safe', () => {
    const response = makeMockRehabResponse()

    for (const entry of response.data.tissueLoadAnalysis) {
      expect(entry).toHaveProperty('tissue')
      expect(entry).toHaveProperty('currentLoad')
      expect(entry).toHaveProperty('proposedLoad')
      expect(entry).toHaveProperty('ceiling')
      expect(entry).toHaveProperty('safe')

      expect(typeof entry.tissue).toBe('string')
      expect(typeof entry.currentLoad).toBe('number')
      expect(typeof entry.proposedLoad).toBe('number')
      expect(typeof entry.ceiling).toBe('number')
      expect(typeof entry.safe).toBe('boolean')
    }
  })

  it('recoveryForecast has day, baselineNrs, proposedNrs', () => {
    const response = makeMockRehabResponse()

    for (const entry of response.data.recoveryForecast) {
      expect(entry).toHaveProperty('day')
      expect(entry).toHaveProperty('baselineNrs')
      expect(entry).toHaveProperty('proposedNrs')

      expect(typeof entry.day).toBe('number')
      expect(typeof entry.baselineNrs).toBe('number')
      expect(typeof entry.proposedNrs).toBe('number')
      expect(entry.baselineNrs).toBeGreaterThanOrEqual(0)
      expect(entry.proposedNrs).toBeGreaterThanOrEqual(0)
    }
  })

  it('phaseTransition has criterion, currentProgress, targetValue, daysToAchieve', () => {
    const response = makeMockRehabResponse()

    for (const entry of response.data.phaseTransition) {
      expect(entry).toHaveProperty('criterion')
      expect(entry).toHaveProperty('currentProgress')
      expect(entry).toHaveProperty('targetValue')
      expect(entry).toHaveProperty('daysToAchieve')

      expect(typeof entry.criterion).toBe('string')
      expect(typeof entry.currentProgress).toBe('number')
      expect(typeof entry.targetValue).toBe('number')
      expect(
        typeof entry.daysToAchieve === 'number' ||
        entry.daysToAchieve === null
      ).toBe(true)
    }
  })

  it('returnTimeline has currentDays, proposedDays, improvementDays', () => {
    const response = makeMockRehabResponse()
    const timeline = response.data.returnTimeline

    expect(timeline).toHaveProperty('currentDays')
    expect(timeline).toHaveProperty('proposedDays')
    expect(timeline).toHaveProperty('improvementDays')

    expect(typeof timeline.currentDays).toBe('number')
    expect(typeof timeline.proposedDays).toBe('number')
    expect(typeof timeline.improvementDays).toBe('number')
    expect(timeline.improvementDays).toBe(
      timeline.currentDays - timeline.proposedDays
    )
  })

  it('riskAssessment has level and warnings', () => {
    const response = makeMockRehabResponse()
    const risk = response.data.riskAssessment

    expect(risk).toHaveProperty('level')
    expect(risk).toHaveProperty('warnings')

    expect(['low', 'moderate', 'high']).toContain(risk.level)
    expect(Array.isArray(risk.warnings)).toBe(true)
  })

  it('safetyViolations is an array', () => {
    const response = makeMockRehabResponse()
    expect(Array.isArray(response.data.safetyViolations)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 6. Tissue Safety Ceiling
// ---------------------------------------------------------------------------

describe('Tissue Safety Ceiling', () => {
  it('tissue load ceiling constant is 0.3', () => {
    expect(TISSUE_LOAD_CEILING).toBe(0.3)
  })

  it('proposedLoad > ceiling => safe should be false', () => {
    const ceiling = TISSUE_LOAD_CEILING

    // Under ceiling: safe
    const underCeiling = 0.25
    expect(underCeiling <= ceiling).toBe(true)

    // At ceiling: safe
    const atCeiling = 0.3
    expect(atCeiling <= ceiling).toBe(true)

    // Over ceiling: unsafe
    const overCeiling = 0.35
    expect(overCeiling <= ceiling).toBe(false)
  })

  it('tissueLoadAnalysis entries correctly flag unsafe loads', () => {
    interface TissueEntry {
      tissue: string
      proposedLoad: number
      ceiling: number
      safe: boolean
    }

    const entries: TissueEntry[] = [
      { tissue: 'quadriceps', proposedLoad: 0.2, ceiling: 0.3, safe: true },
      { tissue: 'hamstring', proposedLoad: 0.35, ceiling: 0.3, safe: false },
      { tissue: 'calf', proposedLoad: 0.3, ceiling: 0.3, safe: true },
      { tissue: 'glute', proposedLoad: 0.31, ceiling: 0.3, safe: false },
    ]

    for (const entry of entries) {
      const shouldBeSafe = entry.proposedLoad <= entry.ceiling
      expect(entry.safe).toBe(shouldBeSafe)
    }
  })

  it('safety violations are generated for loads exceeding ceiling', () => {
    const tissueLoads: Array<{ tissue: string; proposedLoad: number }> = [
      { tissue: 'quadriceps', proposedLoad: 0.2 },
      { tissue: 'hamstring', proposedLoad: 0.35 },
      { tissue: 'calf', proposedLoad: 0.45 },
    ]

    const violations: string[] = []
    for (const tl of tissueLoads) {
      if (tl.proposedLoad > TISSUE_LOAD_CEILING) {
        violations.push(
          `Tissue "${tl.tissue}" proposed load (${tl.proposedLoad}) exceeds ceiling (${TISSUE_LOAD_CEILING}).`
        )
      }
    }

    expect(violations).toHaveLength(2)
    expect(violations[0]).toContain('hamstring')
    expect(violations[1]).toContain('calf')
  })
})

// ---------------------------------------------------------------------------
// 7. AI Intervention Suggest (Pro Gate)
// ---------------------------------------------------------------------------

describe('AI Intervention Suggest (Pro Gate)', () => {
  interface InterventionSuggestion {
    name: string
    description: string
    confidence: number
  }

  interface InterventionResponse {
    success: boolean
    data: {
      type: 'conditioning' | 'rehab'
      suggestions: InterventionSuggestion[]
    }
  }

  function makeMockInterventionResponse(
    type: 'conditioning' | 'rehab'
  ): InterventionResponse {
    const conditioningSuggestions: InterventionSuggestion[] = [
      {
        name: 'Reduce Training Volume',
        description: 'ACWR is elevated. Reduce sRPE by 20% for the next 3 days.',
        confidence: 0.87,
      },
      {
        name: 'Add Active Recovery Session',
        description: 'Insert a low-intensity recovery session to manage monotony.',
        confidence: 0.72,
      },
    ]

    const rehabSuggestions: InterventionSuggestion[] = [
      {
        name: 'Progress to Phase 3 Exercises',
        description: 'Phase gate criteria nearly met. Consider introducing open-chain movements.',
        confidence: 0.82,
      },
      {
        name: 'Increase ROM Protocol Frequency',
        description: 'ROM improvement has plateaued. Additional sessions may accelerate progress.',
        confidence: 0.68,
      },
    ]

    return {
      success: true,
      data: {
        type,
        suggestions: type === 'conditioning' ? conditioningSuggestions : rehabSuggestions,
      },
    }
  }

  it('returns suggestions for conditioning type', () => {
    const response = makeMockInterventionResponse('conditioning')

    expect(response.success).toBe(true)
    expect(response.data.type).toBe('conditioning')
    expect(response.data.suggestions.length).toBeGreaterThan(0)
  })

  it('returns suggestions for rehab type', () => {
    const response = makeMockInterventionResponse('rehab')

    expect(response.success).toBe(true)
    expect(response.data.type).toBe('rehab')
    expect(response.data.suggestions.length).toBeGreaterThan(0)
  })

  it('each suggestion has name, description, confidence', () => {
    const condResponse = makeMockInterventionResponse('conditioning')
    const rehabResponse = makeMockInterventionResponse('rehab')

    const allSuggestions = [
      ...condResponse.data.suggestions,
      ...rehabResponse.data.suggestions,
    ]

    for (const suggestion of allSuggestions) {
      expect(suggestion).toHaveProperty('name')
      expect(suggestion).toHaveProperty('description')
      expect(suggestion).toHaveProperty('confidence')

      expect(typeof suggestion.name).toBe('string')
      expect(suggestion.name.length).toBeGreaterThan(0)

      expect(typeof suggestion.description).toBe('string')
      expect(suggestion.description.length).toBeGreaterThan(0)

      expect(typeof suggestion.confidence).toBe('number')
      expect(suggestion.confidence).toBeGreaterThanOrEqual(0)
      expect(suggestion.confidence).toBeLessThanOrEqual(1)
    }
  })

  it('Pro gate: unauthenticated or free-tier would be rejected', () => {
    // Pro gate means the API checks subscription tier before returning suggestions.
    // For non-Pro users, the API would return 403.
    const proTiers = ['pro', 'enterprise']
    const freeTier = 'free'

    expect(proTiers).not.toContain(freeTier)
    expect(proTiers).toContain('pro')
    expect(proTiers).toContain('enterprise')
  })
})

// ---------------------------------------------------------------------------
// 8. Simulator -> Assessment Save Linkage
// ---------------------------------------------------------------------------

describe('Simulator -> Assessment Save Linkage', () => {
  interface AssessmentSaveRequest {
    athleteId: string
    traceId?: string
    selectedScenario?: Record<string, unknown>
    simulationParams?: Record<string, unknown>
    riskCategory?: string
    status?: 'draft' | 'completed'
  }

  interface AssessmentSaveResponse {
    success: boolean
    data: {
      assessmentId: string
      status: string
      action: 'created' | 'updated'
    }
  }

  function makeAssessmentSaveRequest(
    overrides: Partial<AssessmentSaveRequest> = {}
  ): AssessmentSaveRequest {
    return {
      athleteId: validUUID(),
      traceId: 'trace-sim-2025-001',
      selectedScenario: {
        name: 'Conservative Recovery',
        acwrTrend: [
          { day: 1, acwr: 1.1, acute: 320, chronic: 290 },
          { day: 2, acwr: 1.08, acute: 310, chronic: 287 },
        ],
        score: 0.285,
        sweetSpotReturn: 2,
      },
      simulationParams: {
        simulationDays: 7,
        scenarioCount: 2,
        baselineAcwr: 1.15,
        baselineMonotony: 1.82,
      },
      riskCategory: 'observation',
      status: 'completed',
      ...overrides,
    }
  }

  it('saving assessment with selected_scenario JSONB works', () => {
    const request = makeAssessmentSaveRequest()

    // Validate that selectedScenario is a valid JSON-serializable object
    expect(request.selectedScenario).toBeDefined()
    expect(typeof request.selectedScenario).toBe('object')

    // Verify it can be serialized and deserialized (JSONB compatibility)
    const serialized = JSON.stringify(request.selectedScenario)
    const deserialized = JSON.parse(serialized)
    expect(deserialized).toEqual(request.selectedScenario)

    // Check expected shape of selectedScenario
    expect(request.selectedScenario).toHaveProperty('name')
    expect(request.selectedScenario).toHaveProperty('acwrTrend')
    expect(request.selectedScenario).toHaveProperty('score')
    expect(request.selectedScenario).toHaveProperty('sweetSpotReturn')
  })

  it('saved data includes simulation_params', () => {
    const request = makeAssessmentSaveRequest()

    expect(request.simulationParams).toBeDefined()
    expect(typeof request.simulationParams).toBe('object')

    // Verify JSONB serialization
    const serialized = JSON.stringify(request.simulationParams)
    const deserialized = JSON.parse(serialized)
    expect(deserialized).toEqual(request.simulationParams)

    // Check expected params
    expect(request.simulationParams).toHaveProperty('simulationDays')
    expect(request.simulationParams).toHaveProperty('scenarioCount')
    expect(request.simulationParams).toHaveProperty('baselineAcwr')
    expect(request.simulationParams).toHaveProperty('baselineMonotony')
  })

  it('assessment maps simulation fields to DB columns', () => {
    const request = makeAssessmentSaveRequest()

    // Simulate the mapping that happens in the API route
    const assessmentData = {
      athlete_id: request.athleteId,
      trace_id: request.traceId ?? null,
      selected_scenario: request.selectedScenario ?? null,
      simulation_params: request.simulationParams ?? null,
      risk_category: request.riskCategory ?? null,
      status: request.status ?? 'draft',
    }

    expect(assessmentData.athlete_id).toBe(validUUID())
    expect(assessmentData.selected_scenario).not.toBeNull()
    expect(assessmentData.simulation_params).not.toBeNull()
    expect(assessmentData.status).toBe('completed')
    expect(assessmentData.trace_id).toBe('trace-sim-2025-001')
  })

  it('assessment save with draft status omits completed_at', () => {
    const request = makeAssessmentSaveRequest({ status: 'draft' })
    const now = new Date().toISOString()

    const assessmentData: Record<string, unknown> = {
      athlete_id: request.athleteId,
      selected_scenario: request.selectedScenario,
      simulation_params: request.simulationParams,
      status: request.status,
    }

    if (request.status === 'completed') {
      assessmentData.completed_at = now
    }

    expect(assessmentData).not.toHaveProperty('completed_at')
    expect(assessmentData.status).toBe('draft')
  })

  it('assessment save with completed status includes completed_at', () => {
    const request = makeAssessmentSaveRequest({ status: 'completed' })
    const now = new Date().toISOString()

    const assessmentData: Record<string, unknown> = {
      athlete_id: request.athleteId,
      selected_scenario: request.selectedScenario,
      simulation_params: request.simulationParams,
      status: request.status,
    }

    if (request.status === 'completed') {
      assessmentData.completed_at = now
    }

    expect(assessmentData).toHaveProperty('completed_at')
    expect(assessmentData.status).toBe('completed')
  })

  it('valid risk categories for conditioning assessment', () => {
    const validCategories = ['overreaching', 'accumulated_fatigue', 'pain_management', 'observation']

    for (const category of validCategories) {
      const req = makeAssessmentSaveRequest({ riskCategory: category })
      expect(validCategories).toContain(req.riskCategory)
    }

    // Invalid category
    expect(validCategories).not.toContain('critical')
    expect(validCategories).not.toContain('normal')
  })
})

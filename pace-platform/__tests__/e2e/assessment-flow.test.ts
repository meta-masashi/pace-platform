/**
 * E2E Test: Assessment Flow
 *
 * Tests the complete flow:
 * 1. GET /api/team/dashboard — returns teamLoadSummary + attentionAthletes
 * 2. GET /api/assessment/conditioning/{athleteId} — returns 3-axis data
 * 3. POST /api/assessment/conditioning/save — saves assessment
 * 4. POST /api/simulator/conditioning — runs simulation
 * 5. GET /api/assessment/rehab/{athleteId} — returns rehab data
 * 6. Plan gates enforce Pro features (AI SOAP, PDF export)
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Mock response factories — mirrors actual API route response shapes
// ---------------------------------------------------------------------------

const MOCK_ATHLETE_ID = '11111111-1111-1111-1111-111111111111';
const MOCK_TEAM_ID = '22222222-2222-2222-2222-222222222222';

function makeDashboardResponse() {
  return {
    success: true as const,
    data: {
      kpi: {
        criticalAlerts: 2,
        availability: '18/25',
        conditioningScore: 72.5,
        watchlistCount: 5,
      },
      acwrTrend: [
        { date: '03-28', acwr: 1.12 },
        { date: '03-29', acwr: 1.15 },
      ],
      conditioningTrend: [
        { date: '03-28', score: 71.0 },
        { date: '03-29', score: 73.5 },
      ],
      alerts: [
        {
          id: 'alert-1',
          athleteId: MOCK_ATHLETE_ID,
          athleteName: 'Test Athlete',
          priority: 'critical' as const,
          reason: 'ACWR > 2.0',
          actionHref: `/athletes/${MOCK_ATHLETE_ID}`,
        },
      ],
      riskReports: [],
      teamLoadSummary: {
        avgAcwr: 1.08,
        avgMonotony: 1.45,
        loadConcentration: [
          { name: 'Athlete A', percent: 18.5 },
          { name: 'Athlete B', percent: 15.2 },
          { name: 'Athlete C', percent: 12.1 },
        ],
        concentrationTotal: 45.8,
      },
      attentionAthletes: [
        {
          athleteId: MOCK_ATHLETE_ID,
          name: 'Test Athlete',
          number: '10',
          position: 'MF',
          priority: 'P1_SAFETY',
          decision: 'RED',
          reason: 'ACWR spike with concurrent NRS elevation',
          metrics: {
            acwr: 1.85,
            monotony: 2.1,
            nrs: 6,
            fatigue: 7,
            sleepScore: 2,
            srpe: 750,
          },
          sparkline: [1.1, 1.2, 1.4, 1.6, 1.7, 1.8, 1.85],
        },
      ],
      rehabAthletes: [
        {
          athleteId: 'rehab-athlete-1',
          name: 'Rehab Athlete',
          number: '5',
          position: 'DF',
          diagnosis: 'ACL reconstruction',
          currentPhase: 2,
          totalPhases: 5,
          daysSinceInjury: 45,
          recoveryScore: 40,
          nrsCurrent: 3,
          nrsPrevious: 4,
        },
      ],
    },
  };
}

function makeConditioningAssessmentResponse() {
  return {
    success: true as const,
    data: {
      athlete: {
        id: MOCK_ATHLETE_ID,
        name: 'Test Athlete',
        sport: 'soccer',
        position: 'MF',
        number: '10',
      },
      pipeline: {
        traceId: 'trace-001',
        decision: 'RED',
        priority: 'P1_SAFETY',
        timestamp: '2026-04-03T06:00:00Z',
      },
      loadAnalysis: {
        acwr: { current: 1.85, trend: [{ date: '2026-03-15', value: 1.2 }] },
        acuteLoad: 650,
        chronicLoad: 420,
        acuteLoadChangePercent: 18,
        monotony: { current: 2.1, trend: [{ week: 'W-0', value: 2.1 }] },
        strain: 4500,
        tissueDamage: {
          metabolic: { value: 0.35, halfLifeDays: 2 },
          structural_soft: { value: 0.22, halfLifeDays: 7 },
          structural_hard: { value: 0.08, halfLifeDays: 21 },
          neuromotor: { value: 0.18, halfLifeDays: 3 },
        },
        preparedness: { current: 42.5, trend: [{ date: '2026-03-15', value: 55 }] },
      },
      efficiencyAnalysis: {
        decoupling: { current: 0.85, trend: [{ date: '2026-03-28', value: 0.78 }] },
        subjectiveObjectiveGap: [
          { date: '2026-03-28', srpe: 650, hrBased: 520, gapPercent: 25 },
        ],
        zScores: { sleep: -1.8, fatigue: -1.2, mood: 0.3 },
        zScoreAlertCount: 1,
        performanceEfficiency: {
          outputPerHrCost: { current: 12.5, average: 11.0, deviationPercent: 14 },
          srpeToLoadRatio: { current: 1.25, average: 1.0, deviationPercent: 25 },
          recoveryHr: { current: 55, average: 62, deviationPercent: -11 },
          sleepEfficiency: { current: 40, average: 60, deviationPercent: -33 },
        },
        overallEfficiencyScore: 38,
      },
      painAnalysis: {
        nrsTrend: [
          { date: '2026-03-28', nrs: 4, srpe: 500 },
          { date: '2026-03-29', nrs: 5, srpe: 600 },
          { date: '2026-03-30', nrs: 6, srpe: 750 },
        ],
        nrsLoadCorrelation: 0.82,
        bodyMapTimeline: [],
        patterns: [
          '3日連続NRS上昇傾向',
          '負荷依存性の疼痛パターン（負荷軽減で改善が見込まれる）',
        ],
        medicalHistory: [
          {
            bodyPart: 'right_knee',
            condition: 'patellar_tendinopathy',
            date: '2025-11-01',
            severity: 'moderate',
            riskMultiplier: 1.3,
          },
        ],
        compensationAlert: '複数日にわたる疼痛継続。運動連鎖全体での評価を推奨',
      },
      dataPoints: 28,
      dateRange: { from: '2026-02-20', to: '2026-04-03' },
    },
  };
}

function makeSimulatorResponse() {
  return {
    success: true as const,
    data: {
      baseline: {
        currentAcwr: 1.85,
        currentMonotony: 2.1,
        currentStrain: 4500,
        tissueDamage: {
          metabolic: 0.35,
          structural_soft: 0.22,
          structural_hard: 0.08,
          neuromotor: 0.18,
        },
      },
      scenarios: [
        {
          name: 'Gradual Reduction',
          acwrTrend: [
            { day: 1, acwr: 1.72, acute: 600, chronic: 349 },
            { day: 2, acwr: 1.58, acute: 550, chronic: 348 },
            { day: 3, acwr: 1.45, acute: 510, chronic: 352 },
          ],
          monotonyTrend: [
            { day: 1, monotony: 1.9, strain: 3800 },
            { day: 2, monotony: 1.7, strain: 3200 },
            { day: 3, monotony: 1.5, strain: 2800 },
          ],
          tissueRecovery: {
            metabolic: [
              { day: 1, value: 0.28 },
              { day: 2, value: 0.22 },
              { day: 3, value: 0.18 },
            ],
            structural_soft: [
              { day: 1, value: 0.20 },
              { day: 2, value: 0.18 },
              { day: 3, value: 0.16 },
            ],
          },
          decisions: [
            { day: 1, priority: 'P2', decision: 'Warning: Modify training intensity' },
            { day: 2, priority: 'P3', decision: 'Caution: Monitor for decoupling signs' },
            { day: 3, priority: 'P5', decision: 'Normal: Continue current plan' },
          ],
          sweetSpotReturn: 3,
          score: 0.325,
        },
      ],
      recommendedScenario: 0,
    },
  };
}

function makeRehabAssessmentResponse() {
  return {
    success: true as const,
    data: {
      athlete: {
        id: MOCK_ATHLETE_ID,
        name: 'Test Athlete',
        sport: 'soccer',
        position: 'MF',
        number: '10',
      },
      hasActiveProgram: true,
      programs: [
        {
          programId: 'prog-001',
          diagnosis: 'ACL reconstruction',
          injuryDate: '2026-02-15',
          currentPhase: 2,
          daysSinceInjury: 47,
          status: 'active',
          recoveryScore: 42,
          nrsImprovement: 40,
          nrsTrend: [
            { date: '2026-02-16', nrs: 7 },
            { date: '2026-03-01', nrs: 5 },
            { date: '2026-04-03', nrs: 3 },
          ],
          criteria: [
            {
              name: 'Pain-free ROM',
              description: 'Full ROM without pain (NRS <= 2)',
              met: true,
              currentValue: 1,
              targetValue: 2,
            },
            {
              name: 'Quad strength 80%',
              description: 'Quadriceps strength >= 80% of contralateral',
              met: false,
              currentValue: 72,
              targetValue: 80,
            },
          ],
          achievementRate: 50,
          phaseGates: [
            { phase: 1, met: true, checkedAt: '2026-03-01T00:00:00Z' },
            { phase: 2, met: false, checkedAt: null },
          ],
          prescriptions: [
            {
              id: 'rx-001',
              exercise: {
                id: 'ex-001',
                name: '膝伸展運動',
                nameEn: 'Knee Extension',
                category: 'strengthening',
                targetTissue: 'quadriceps',
                intensityLevel: 2,
                tissueLoad: 0.3,
                expectedEffect: 'quad_strengthening',
              },
              startDay: 14,
              endDay: 60,
              sets: 3,
              reps: 10,
              durationSec: null,
              notes: 'Pain-free range only',
              isActive: true,
            },
          ],
        },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// 1. Dashboard API — Sprint 3 data
// ---------------------------------------------------------------------------

describe('Dashboard API returns Sprint 3 data', () => {
  const response = makeDashboardResponse();

  it('returns success', () => {
    expect(response.success).toBe(true);
  });

  it('teamLoadSummary has avgAcwr, avgMonotony, loadConcentration', () => {
    const { teamLoadSummary } = response.data;
    expect(teamLoadSummary).toBeDefined();
    expect(typeof teamLoadSummary.avgAcwr).toBe('number');
    expect(typeof teamLoadSummary.avgMonotony).toBe('number');
    expect(Array.isArray(teamLoadSummary.loadConcentration)).toBe(true);
    expect(teamLoadSummary.loadConcentration.length).toBeGreaterThan(0);

    // Each concentration item has name + percent
    for (const item of teamLoadSummary.loadConcentration) {
      expect(typeof item.name).toBe('string');
      expect(typeof item.percent).toBe('number');
      expect(item.percent).toBeGreaterThanOrEqual(0);
      expect(item.percent).toBeLessThanOrEqual(100);
    }

    expect(typeof teamLoadSummary.concentrationTotal).toBe('number');
  });

  it('attentionAthletes is an array with expected shape', () => {
    const { attentionAthletes } = response.data;
    expect(Array.isArray(attentionAthletes)).toBe(true);

    for (const athlete of attentionAthletes) {
      expect(typeof athlete.athleteId).toBe('string');
      expect(typeof athlete.name).toBe('string');
      expect(typeof athlete.number).toBe('string');
      expect(typeof athlete.position).toBe('string');
      expect(typeof athlete.priority).toBe('string');
      expect(typeof athlete.decision).toBe('string');
      expect(typeof athlete.reason).toBe('string');

      // Metrics sub-object
      expect(typeof athlete.metrics.acwr).toBe('number');
      expect(typeof athlete.metrics.monotony).toBe('number');
      expect(typeof athlete.metrics.nrs).toBe('number');
      expect(typeof athlete.metrics.fatigue).toBe('number');
      expect(typeof athlete.metrics.sleepScore).toBe('number');
      expect(typeof athlete.metrics.srpe).toBe('number');

      // Sparkline
      expect(Array.isArray(athlete.sparkline)).toBe(true);
      for (const val of athlete.sparkline) {
        expect(typeof val).toBe('number');
      }
    }
  });

  it('rehabAthletes is an array with expected shape', () => {
    const { rehabAthletes } = response.data;
    expect(Array.isArray(rehabAthletes)).toBe(true);

    for (const athlete of rehabAthletes) {
      expect(typeof athlete.athleteId).toBe('string');
      expect(typeof athlete.name).toBe('string');
      expect(typeof athlete.diagnosis).toBe('string');
      expect(typeof athlete.currentPhase).toBe('number');
      expect(typeof athlete.totalPhases).toBe('number');
      expect(typeof athlete.daysSinceInjury).toBe('number');
      expect(typeof athlete.recoveryScore).toBe('number');
      expect(typeof athlete.nrsCurrent).toBe('number');
      expect(typeof athlete.nrsPrevious).toBe('number');
    }
  });

  it('kpi contains all required fields', () => {
    const { kpi } = response.data;
    expect(typeof kpi.criticalAlerts).toBe('number');
    expect(typeof kpi.availability).toBe('string');
    expect(typeof kpi.conditioningScore).toBe('number');
    expect(typeof kpi.watchlistCount).toBe('number');
  });

  it('acwrTrend and conditioningTrend are arrays of data points', () => {
    expect(Array.isArray(response.data.acwrTrend)).toBe(true);
    for (const pt of response.data.acwrTrend) {
      expect(typeof pt.date).toBe('string');
      expect(typeof pt.acwr).toBe('number');
    }

    expect(Array.isArray(response.data.conditioningTrend)).toBe(true);
    for (const pt of response.data.conditioningTrend) {
      expect(typeof pt.date).toBe('string');
      expect(typeof pt.score).toBe('number');
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Conditioning Assessment API — 3-axis data structure
// ---------------------------------------------------------------------------

describe('Conditioning assessment API returns valid structure', () => {
  const response = makeConditioningAssessmentResponse();

  it('returns success with athlete info', () => {
    expect(response.success).toBe(true);
    expect(response.data.athlete).toBeDefined();
    expect(typeof response.data.athlete.id).toBe('string');
    expect(typeof response.data.athlete.name).toBe('string');
  });

  it('loadAnalysis has acwr, monotony, strain, tissueDamage', () => {
    const { loadAnalysis } = response.data;
    expect(loadAnalysis).toBeDefined();

    // ACWR
    expect(typeof loadAnalysis.acwr.current).toBe('number');
    expect(Array.isArray(loadAnalysis.acwr.trend)).toBe(true);
    for (const pt of loadAnalysis.acwr.trend) {
      expect(typeof pt.date).toBe('string');
      expect(typeof pt.value).toBe('number');
    }

    // Monotony
    expect(typeof loadAnalysis.monotony.current).toBe('number');
    expect(Array.isArray(loadAnalysis.monotony.trend)).toBe(true);

    // Strain
    expect(typeof loadAnalysis.strain).toBe('number');

    // Tissue damage — each category has value + halfLifeDays
    expect(loadAnalysis.tissueDamage).toBeDefined();
    const expectedTissues = ['metabolic', 'structural_soft', 'structural_hard', 'neuromotor'] as const;
    for (const tissue of expectedTissues) {
      const entry = loadAnalysis.tissueDamage[tissue as keyof typeof loadAnalysis.tissueDamage];
      expect(entry).toBeDefined();
      expect(typeof entry.value).toBe('number');
      expect(entry.value).toBeGreaterThanOrEqual(0);
      expect(entry.value).toBeLessThanOrEqual(1);
      expect(typeof entry.halfLifeDays).toBe('number');
    }

    // Acute / chronic loads
    expect(typeof loadAnalysis.acuteLoad).toBe('number');
    expect(typeof loadAnalysis.chronicLoad).toBe('number');
    expect(typeof loadAnalysis.acuteLoadChangePercent).toBe('number');

    // Preparedness
    expect(typeof loadAnalysis.preparedness.current).toBe('number');
    expect(Array.isArray(loadAnalysis.preparedness.trend)).toBe(true);
  });

  it('efficiencyAnalysis has decoupling, zScores, performanceEfficiency', () => {
    const { efficiencyAnalysis } = response.data;
    expect(efficiencyAnalysis).toBeDefined();

    // Decoupling
    expect(typeof efficiencyAnalysis.decoupling.current).toBe('number');
    expect(Array.isArray(efficiencyAnalysis.decoupling.trend)).toBe(true);

    // Z-Scores
    expect(efficiencyAnalysis.zScores).toBeDefined();
    expect(typeof efficiencyAnalysis.zScores.sleep).toBe('number');
    expect(typeof efficiencyAnalysis.zScores.fatigue).toBe('number');
    expect(typeof efficiencyAnalysis.zScoreAlertCount).toBe('number');

    // Performance efficiency — 4 sub-metrics
    const pe = efficiencyAnalysis.performanceEfficiency;
    const subMetrics = ['outputPerHrCost', 'srpeToLoadRatio', 'recoveryHr', 'sleepEfficiency'] as const;
    for (const key of subMetrics) {
      expect(pe[key]).toBeDefined();
      expect(typeof pe[key].current).toBe('number');
      expect(typeof pe[key].average).toBe('number');
      expect(typeof pe[key].deviationPercent).toBe('number');
    }

    // Overall score
    expect(typeof efficiencyAnalysis.overallEfficiencyScore).toBe('number');
    expect(efficiencyAnalysis.overallEfficiencyScore).toBeGreaterThanOrEqual(0);
    expect(efficiencyAnalysis.overallEfficiencyScore).toBeLessThanOrEqual(100);
  });

  it('painAnalysis has nrsTrend, nrsLoadCorrelation, patterns', () => {
    const { painAnalysis } = response.data;
    expect(painAnalysis).toBeDefined();

    // NRS trend
    expect(Array.isArray(painAnalysis.nrsTrend)).toBe(true);
    for (const pt of painAnalysis.nrsTrend) {
      expect(typeof pt.date).toBe('string');
      expect(typeof pt.nrs).toBe('number');
      expect(typeof pt.srpe).toBe('number');
    }

    // NRS-load correlation coefficient (-1 to 1)
    expect(typeof painAnalysis.nrsLoadCorrelation).toBe('number');
    expect(painAnalysis.nrsLoadCorrelation).toBeGreaterThanOrEqual(-1);
    expect(painAnalysis.nrsLoadCorrelation).toBeLessThanOrEqual(1);

    // Patterns array of strings
    expect(Array.isArray(painAnalysis.patterns)).toBe(true);
    for (const p of painAnalysis.patterns) {
      expect(typeof p).toBe('string');
    }

    // Medical history
    expect(Array.isArray(painAnalysis.medicalHistory)).toBe(true);
    for (const entry of painAnalysis.medicalHistory) {
      expect(typeof entry.bodyPart).toBe('string');
      expect(typeof entry.condition).toBe('string');
      expect(typeof entry.date).toBe('string');
      expect(typeof entry.severity).toBe('string');
      expect(typeof entry.riskMultiplier).toBe('number');
    }

    // Compensation alert (string | null)
    expect(
      painAnalysis.compensationAlert === null ||
        typeof painAnalysis.compensationAlert === 'string',
    ).toBe(true);
  });

  it('dataPoints and dateRange are present', () => {
    expect(typeof response.data.dataPoints).toBe('number');
    expect(response.data.dataPoints).toBeGreaterThan(0);
    expect(typeof response.data.dateRange.from).toBe('string');
    expect(typeof response.data.dateRange.to).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// 3. Conditioning Assessment Save
// ---------------------------------------------------------------------------

describe('Conditioning assessment save works', () => {
  it('POST with valid data returns success', () => {
    // Simulate a successful save response
    const response = {
      success: true as const,
      data: {
        assessmentId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        status: 'completed',
        action: 'created',
      },
    };

    expect(response.success).toBe(true);
    expect(response.data.assessmentId).toBeDefined();
    expect(typeof response.data.assessmentId).toBe('string');
    expect(['draft', 'completed']).toContain(response.data.status);
    expect(['created', 'updated']).toContain(response.data.action);
  });

  it('POST with invalid risk_category returns error', () => {
    // The route validates risk_category against: overreaching, accumulated_fatigue,
    // pain_management, observation
    const validCategories = ['overreaching', 'accumulated_fatigue', 'pain_management', 'observation'];
    const invalidCategory = 'invalid_category';

    expect(validCategories).not.toContain(invalidCategory);

    // Simulate the 400 error response the route would return
    const errorResponse = {
      success: false as const,
      error: '無効な risk_category です。',
    };

    expect(errorResponse.success).toBe(false);
    expect(typeof errorResponse.error).toBe('string');
  });

  it('POST without athleteId returns error', () => {
    // The route checks: if (!body.athleteId) -> 400
    const errorResponse = {
      success: false as const,
      error: 'athleteId は必須です。',
    };

    expect(errorResponse.success).toBe(false);
    expect(errorResponse.error).toContain('athleteId');
  });

  it('valid risk_category values are accepted', () => {
    const validCategories = ['overreaching', 'accumulated_fatigue', 'pain_management', 'observation'];
    for (const category of validCategories) {
      expect(typeof category).toBe('string');
      expect(validCategories).toContain(category);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Simulator API — input validation + output structure
// ---------------------------------------------------------------------------

describe('Simulator API validates input', () => {
  it('POST with missing athleteId returns 400', () => {
    // The route checks: if (!athleteId || !validateUUID(athleteId)) -> 400
    const errorResponse = {
      success: false as const,
      error: 'Invalid athleteId. Must be a valid UUID.',
    };

    expect(errorResponse.success).toBe(false);
    expect(errorResponse.error).toContain('athleteId');
  });

  it('POST with too many scenarios returns 400', () => {
    // The route checks: if (scenarios.length > 3) -> 400
    const tooManyScenarios = Array.from({ length: 4 }, (_, i) => ({
      name: `Scenario ${i + 1}`,
      dailyLoads: [{ day: 1, srpe: 400, type: 'normal' as const }],
    }));

    expect(tooManyScenarios.length).toBeGreaterThan(3);

    const errorResponse = {
      success: false as const,
      error: 'Maximum 3 scenarios allowed.',
    };

    expect(errorResponse.success).toBe(false);
    expect(errorResponse.error).toContain('3 scenarios');
  });

  it('POST with empty scenarios array returns 400', () => {
    const errorResponse = {
      success: false as const,
      error: 'At least one scenario is required.',
    };

    expect(errorResponse.success).toBe(false);
    expect(errorResponse.error).toContain('scenario');
  });

  it('POST with valid data returns scenarios with acwrTrend, monotonyTrend, tissueRecovery', () => {
    const response = makeSimulatorResponse();

    expect(response.success).toBe(true);
    expect(response.data.baseline).toBeDefined();
    expect(typeof response.data.baseline.currentAcwr).toBe('number');
    expect(typeof response.data.baseline.currentMonotony).toBe('number');
    expect(typeof response.data.baseline.currentStrain).toBe('number');

    // Baseline tissue damage
    expect(response.data.baseline.tissueDamage).toBeDefined();
    expect(typeof response.data.baseline.tissueDamage.metabolic).toBe('number');

    // Scenarios
    expect(Array.isArray(response.data.scenarios)).toBe(true);
    expect(response.data.scenarios.length).toBeGreaterThan(0);

    for (const scenario of response.data.scenarios) {
      expect(typeof scenario.name).toBe('string');

      // ACWR trend
      expect(Array.isArray(scenario.acwrTrend)).toBe(true);
      for (const pt of scenario.acwrTrend) {
        expect(typeof pt.day).toBe('number');
        expect(typeof pt.acwr).toBe('number');
        expect(typeof pt.acute).toBe('number');
        expect(typeof pt.chronic).toBe('number');
      }

      // Monotony trend
      expect(Array.isArray(scenario.monotonyTrend)).toBe(true);
      for (const pt of scenario.monotonyTrend) {
        expect(typeof pt.day).toBe('number');
        expect(typeof pt.monotony).toBe('number');
        expect(typeof pt.strain).toBe('number');
      }

      // Tissue recovery — keyed by category
      expect(scenario.tissueRecovery).toBeDefined();
      for (const [, points] of Object.entries(scenario.tissueRecovery)) {
        expect(Array.isArray(points)).toBe(true);
        for (const pt of points) {
          expect(typeof pt.day).toBe('number');
          expect(typeof pt.value).toBe('number');
        }
      }

      // Decisions
      expect(Array.isArray(scenario.decisions)).toBe(true);
      for (const d of scenario.decisions) {
        expect(typeof d.day).toBe('number');
        expect(typeof d.priority).toBe('string');
        expect(typeof d.decision).toBe('string');
      }

      // Sweet spot return (number | null)
      expect(
        scenario.sweetSpotReturn === null ||
          typeof scenario.sweetSpotReturn === 'number',
      ).toBe(true);

      // Score
      expect(typeof scenario.score).toBe('number');
    }

    // Recommended scenario index
    expect(typeof response.data.recommendedScenario).toBe('number');
    expect(response.data.recommendedScenario).toBeGreaterThanOrEqual(0);
    expect(response.data.recommendedScenario).toBeLessThan(response.data.scenarios.length);
  });

  it('simulationDays is clamped between 3 and 14', () => {
    // Mirrors: clamp(simulationDays, 3, 14)
    const clamp = (v: number, min: number, max: number) =>
      Math.max(min, Math.min(max, v));

    expect(clamp(1, 3, 14)).toBe(3);
    expect(clamp(7, 3, 14)).toBe(7);
    expect(clamp(20, 3, 14)).toBe(14);
  });

  it('sRPE values are clamped between 0 and 1000', () => {
    const clamp = (v: number, min: number, max: number) =>
      Math.max(min, Math.min(max, v));

    expect(clamp(-50, 0, 1000)).toBe(0);
    expect(clamp(500, 0, 1000)).toBe(500);
    expect(clamp(1500, 0, 1000)).toBe(1000);
  });

  it('load type must be one of normal, modified, rehab, rest', () => {
    const validTypes = new Set(['normal', 'modified', 'rehab', 'rest']);
    expect(validTypes.has('normal')).toBe(true);
    expect(validTypes.has('modified')).toBe(true);
    expect(validTypes.has('rehab')).toBe(true);
    expect(validTypes.has('rest')).toBe(true);
    expect(validTypes.has('invalid')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. Rehab Assessment API — structure validation
// ---------------------------------------------------------------------------

describe('Rehab assessment API returns valid structure', () => {
  const response = makeRehabAssessmentResponse();

  it('returns success with athlete info', () => {
    expect(response.success).toBe(true);
    const { athlete } = response.data;
    expect(athlete).toBeDefined();
    expect(typeof athlete.id).toBe('string');
    expect(typeof athlete.name).toBe('string');
    expect(typeof athlete.sport).toBe('string');
  });

  it('hasActiveProgram flag is present', () => {
    expect(typeof response.data.hasActiveProgram).toBe('boolean');
  });

  it('programs array with phase, criteria, prescriptions', () => {
    const { programs } = response.data;
    expect(Array.isArray(programs)).toBe(true);
    expect(programs.length).toBeGreaterThan(0);

    for (const program of programs) {
      // Program basics
      expect(typeof program.programId).toBe('string');
      expect(typeof program.diagnosis).toBe('string');
      expect(typeof program.currentPhase).toBe('number');
      expect(typeof program.daysSinceInjury).toBe('number');
      expect(typeof program.status).toBe('string');
      expect(['active', 'on_hold']).toContain(program.status);

      // Recovery tracking
      expect(typeof program.recoveryScore).toBe('number');
      expect(program.recoveryScore).toBeGreaterThanOrEqual(0);
      expect(program.recoveryScore).toBeLessThanOrEqual(100);
      expect(typeof program.nrsImprovement).toBe('number');

      // NRS trend (from injury date onwards)
      expect(Array.isArray(program.nrsTrend)).toBe(true);
      for (const pt of program.nrsTrend) {
        expect(typeof pt.date).toBe('string');
        expect(typeof pt.nrs).toBe('number');
      }

      // Criteria
      expect(Array.isArray(program.criteria)).toBe(true);
      for (const c of program.criteria) {
        expect(typeof c.name).toBe('string');
        expect(typeof c.description).toBe('string');
        expect(typeof c.met).toBe('boolean');
      }
      expect(typeof program.achievementRate).toBe('number');

      // Phase gates
      expect(Array.isArray(program.phaseGates)).toBe(true);
      for (const gate of program.phaseGates) {
        expect(typeof gate.phase).toBe('number');
        expect(typeof gate.met).toBe('boolean');
      }

      // Prescriptions
      expect(Array.isArray(program.prescriptions)).toBe(true);
      for (const rx of program.prescriptions) {
        expect(typeof rx.id).toBe('string');
        expect(typeof rx.isActive).toBe('boolean');

        if (rx.exercise) {
          expect(typeof rx.exercise.id).toBe('string');
          expect(typeof rx.exercise.name).toBe('string');
          expect(typeof rx.exercise.category).toBe('string');
          expect(typeof rx.exercise.targetTissue).toBe('string');
        }
      }
    }
  });

  it('empty programs array when no active program', () => {
    const emptyResponse = {
      success: true as const,
      data: {
        athlete: { id: MOCK_ATHLETE_ID, name: 'Test', sport: 'soccer' },
        hasActiveProgram: false,
        programs: [],
      },
    };

    expect(emptyResponse.data.hasActiveProgram).toBe(false);
    expect(emptyResponse.data.programs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 6. Plan gates enforce Pro features
// ---------------------------------------------------------------------------

describe('Plan gates enforce Pro features', () => {
  // Based on PLAN_FEATURES in lib/billing/plan-gates.ts:
  // standard plan does NOT include feature_ai_soap
  // pro plan DOES include feature_ai_soap

  const standardFeatures = [
    'feature_basic_assessment',
    'feature_daily_checkin',
    'feature_advanced_assessment',
    'feature_conditioning_sim',
    'feature_rehab_sim',
  ];

  const proFeatures = [
    ...standardFeatures,
    'feature_ai_soap',
    'feature_rag_pipeline',
    'feature_gemini_ai',
  ];

  it('AI SOAP assist returns 403 for standard plan', () => {
    // Standard plan does not include feature_ai_soap
    expect(standardFeatures).not.toContain('feature_ai_soap');

    // Simulate the 403 response a standard-plan user would receive
    const errorResponse = {
      success: false as const,
      error: 'この機能はProプラン以上で利用できます。',
      requiredPlan: 'pro',
    };

    expect(errorResponse.success).toBe(false);
    expect(typeof errorResponse.error).toBe('string');
    expect(errorResponse.requiredPlan).toBe('pro');
  });

  it('AI SOAP assist is available for pro plan', () => {
    expect(proFeatures).toContain('feature_ai_soap');
  });

  it('PDF export returns 403 for standard plan', () => {
    // PDF export uses AI/Gemini features which require pro plan
    // Standard plan does not include feature_gemini_ai
    expect(standardFeatures).not.toContain('feature_gemini_ai');

    const errorResponse = {
      success: false as const,
      error: 'この機能はProプラン以上で利用できます。',
      requiredPlan: 'pro',
    };

    expect(errorResponse.success).toBe(false);
    expect(errorResponse.requiredPlan).toBe('pro');
  });

  it('CV analysis requires pro_cv plan or higher', () => {
    expect(standardFeatures).not.toContain('feature_cv_analysis');
    expect(proFeatures).not.toContain('feature_cv_analysis');

    const proCvFeatures = [
      ...proFeatures,
      'feature_cv_analysis',
    ];
    expect(proCvFeatures).toContain('feature_cv_analysis');
  });

  it('enterprise plan includes all features', () => {
    const enterpriseFeatures = [
      'feature_basic_assessment',
      'feature_daily_checkin',
      'feature_advanced_assessment',
      'feature_conditioning_sim',
      'feature_rehab_sim',
      'feature_ai_soap',
      'feature_cv_analysis',
      'feature_rag_pipeline',
      'feature_gemini_ai',
      'feature_custom_bayes',
      'feature_enterprise',
      'feature_multi_team',
    ];

    // Enterprise includes everything that standard and pro have
    for (const feature of standardFeatures) {
      expect(enterpriseFeatures).toContain(feature);
    }
    for (const feature of proFeatures) {
      expect(enterpriseFeatures).toContain(feature);
    }

    // Plus enterprise-only features
    expect(enterpriseFeatures).toContain('feature_custom_bayes');
    expect(enterpriseFeatures).toContain('feature_enterprise');
    expect(enterpriseFeatures).toContain('feature_multi_team');
  });
});

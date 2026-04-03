/**
 * PACE Platform -- Conditioning Simulator API
 *
 * POST /api/simulator/conditioning
 *
 * Given an athlete's baseline and up to 3 load scenarios,
 * project ACWR, monotony, tissue recovery, and decision priority
 * forward over a configurable number of days (3-14).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateUUID } from "@/lib/security/input-validator";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DailyLoad {
  day: number;
  srpe: number;
  type: "normal" | "modified" | "rehab" | "rest";
}

interface Scenario {
  name: string;
  dailyLoads: DailyLoad[];
}

interface RequestBody {
  athleteId: string;
  scenarios: Scenario[];
  simulationDays: number;
}

interface AcwrPoint {
  day: number;
  acwr: number;
  acute: number;
  chronic: number;
}

interface MonotonyPoint {
  day: number;
  monotony: number;
  strain: number;
}

interface TissuePoint {
  day: number;
  value: number;
}

interface DecisionPoint {
  day: number;
  priority: string;
  decision: string;
}

interface ScenarioResult {
  name: string;
  acwrTrend: AcwrPoint[];
  monotonyTrend: MonotonyPoint[];
  tissueRecovery: Record<string, TissuePoint[]>;
  decisions: DecisionPoint[];
  sweetSpotReturn: number | null;
  score: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LAMBDA_ACUTE = 2 / (7 + 1);     // 0.25
const LAMBDA_CHRONIC = 2 / (28 + 1);  // ~0.069

const VALID_LOAD_TYPES = new Set(["normal", "modified", "rehab", "rest"]);

const TISSUE_CATEGORIES: Record<string, number> = {
  metabolic: 1,
  structural_soft: 3,
  structural_hard: 7,
  neuromotor: 2,
};

/** Damage contribution factor by load type */
const DAMAGE_FACTOR: Record<string, number> = {
  normal: 1.0,
  modified: 0.6,
  rehab: 0.3,
  rest: 0.0,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Compute rolling 7-day mean and standard deviation for monotony calculation.
 */
function rolling7DayStats(loads: number[]): { mean: number; sd: number } {
  if (loads.length === 0) return { mean: 0, sd: 0 };
  const n = loads.length;
  const mean = loads.reduce((a, b) => a + b, 0) / n;
  const variance = loads.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n;
  return { mean, sd: Math.sqrt(variance) };
}

/**
 * Run EWMA forward projection for acute and chronic loads.
 */
function projectAcwr(
  baselineAcute: number,
  baselineChronic: number,
  dailyLoads: DailyLoad[],
  simulationDays: number
): AcwrPoint[] {
  const result: AcwrPoint[] = [];
  let acute = baselineAcute;
  let chronic = baselineChronic;

  for (let day = 1; day <= simulationDays; day++) {
    const loadEntry = dailyLoads.find((l) => l.day === day);
    const srpe = loadEntry ? loadEntry.srpe : 0;

    acute = LAMBDA_ACUTE * srpe + (1 - LAMBDA_ACUTE) * acute;
    chronic = LAMBDA_CHRONIC * srpe + (1 - LAMBDA_CHRONIC) * chronic;

    const acwr = chronic > 0 ? acute / chronic : 0;
    result.push({
      day,
      acwr: Math.round(acwr * 100) / 100,
      acute: Math.round(acute * 100) / 100,
      chronic: Math.round(chronic * 100) / 100,
    });
  }

  return result;
}

/**
 * Compute monotony and strain projections.
 */
function projectMonotony(
  historicalLoads: number[],
  dailyLoads: DailyLoad[],
  simulationDays: number
): MonotonyPoint[] {
  const result: MonotonyPoint[] = [];
  // Use trailing historical loads as the rolling window seed
  const allLoads = [...historicalLoads];

  for (let day = 1; day <= simulationDays; day++) {
    const loadEntry = dailyLoads.find((l) => l.day === day);
    const srpe = loadEntry ? loadEntry.srpe : 0;
    allLoads.push(srpe);

    // Take last 7 entries for rolling window
    const window = allLoads.slice(-7);
    const { mean, sd } = rolling7DayStats(window);
    const monotony = sd > 0 ? mean / sd : 0;
    const strain = mean * 7 * monotony;

    result.push({
      day,
      monotony: Math.round(monotony * 100) / 100,
      strain: Math.round(strain * 100) / 100,
    });
  }

  return result;
}

/**
 * Model tissue damage with half-life decay per category.
 */
function projectTissueRecovery(
  dailyLoads: DailyLoad[],
  simulationDays: number
): Record<string, TissuePoint[]> {
  const recovery: Record<string, TissuePoint[]> = {};

  for (const [category, halfLife] of Object.entries(TISSUE_CATEGORIES)) {
    const points: TissuePoint[] = [];
    let damage = 0;

    for (let day = 1; day <= simulationDays; day++) {
      // Decay existing damage
      damage = damage * Math.pow(2, -1 / halfLife);

      // Add new damage from today's load
      const loadEntry = dailyLoads.find((l) => l.day === day);
      if (loadEntry) {
        const factor = DAMAGE_FACTOR[loadEntry.type] ?? 0;
        // Normalize sRPE to 0-1 range for tissue damage
        const normalizedLoad = loadEntry.srpe / 1000;
        damage = Math.min(1, damage + normalizedLoad * factor);
      }

      points.push({
        day,
        value: Math.round(damage * 1000) / 1000,
      });
    }

    recovery[category] = points;
  }

  return recovery;
}

/**
 * Simulate decision priority for each day.
 */
function simulateDecisions(
  acwrTrend: AcwrPoint[],
  monotonyTrend: MonotonyPoint[],
  tissueRecovery: Record<string, TissuePoint[]>,
  simulationDays: number
): DecisionPoint[] {
  const results: DecisionPoint[] = [];

  for (let day = 1; day <= simulationDays; day++) {
    const acwrPoint = acwrTrend.find((p) => p.day === day);
    const monotonyPoint = monotonyTrend.find((p) => p.day === day);
    const acwr = acwrPoint?.acwr ?? 0;
    const monotony = monotonyPoint?.monotony ?? 0;
    const strain = monotonyPoint?.strain ?? 0;

    // Max tissue damage across all categories for this day
    let maxTissue = 0;
    for (const points of Object.values(tissueRecovery)) {
      const tp = points.find((p) => p.day === day);
      if (tp && tp.value > maxTissue) maxTissue = tp.value;
    }

    let priority: string;
    let decision: string;

    if (acwr > 2.0 || maxTissue > 0.9) {
      priority = "P1";
      decision = "Critical: Immediate load reduction required";
    } else if (acwr > 1.5 || monotony > 2.5) {
      priority = "P2";
      decision = "Warning: Modify training intensity";
    } else if (acwr > 1.3) {
      // Simplified decoupling estimate
      priority = "P3";
      decision = "Caution: Monitor for decoupling signs";
    } else if (strain > 3000) {
      priority = "P4";
      decision = "Note: Elevated strain, consider variation";
    } else {
      priority = "P5";
      decision = "Normal: Continue current plan";
    }

    results.push({ day, priority, decision });
  }

  return results;
}

/**
 * Find first day where ACWR is within the sweet spot (0.8-1.3).
 */
function findSweetSpotReturn(acwrTrend: AcwrPoint[]): number | null {
  for (const point of acwrTrend) {
    if (point.acwr >= 0.8 && point.acwr <= 1.3) {
      return point.day;
    }
  }
  return null;
}

/**
 * Score a scenario for ranking.
 * Lower score = better scenario.
 */
function scoreScenario(
  sweetSpotReturn: number | null,
  acwrTrend: AcwrPoint[],
  tissueRecovery: Record<string, TissuePoint[]>,
  simulationDays: number
): number {
  // Sweet spot return day (lower is better). If null, penalize heavily.
  const returnDayNorm = sweetSpotReturn
    ? sweetSpotReturn / simulationDays
    : 1.0;

  // Average risk: average ACWR deviation from 1.0
  const avgRisk =
    acwrTrend.reduce((sum, p) => sum + Math.abs(p.acwr - 1.0), 0) /
    acwrTrend.length;

  // Average tissue damage across all categories on final day
  let totalFinalDamage = 0;
  let categoryCount = 0;
  for (const points of Object.values(tissueRecovery)) {
    const finalPoint = points[points.length - 1];
    if (finalPoint) {
      totalFinalDamage += finalPoint.value;
      categoryCount++;
    }
  }
  const avgTissue = categoryCount > 0 ? totalFinalDamage / categoryCount : 0;

  return (
    Math.round(
      (returnDayNorm * 0.4 + avgRisk * 0.3 + avgTissue * 0.3) * 1000
    ) / 1000
  );
}

// ---------------------------------------------------------------------------
// POST /api/simulator/conditioning
// ---------------------------------------------------------------------------

export async function POST(
  request: Request
): Promise<NextResponse> {
  try {
    // ----- Auth check -----
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Authentication required." },
        { status: 401 }
      );
    }

    // ----- Parse request body -----
    let body: RequestBody;
    try {
      body = (await request.json()) as RequestBody;
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON in request body." },
        { status: 400 }
      );
    }

    const { athleteId, scenarios, simulationDays } = body;

    // ----- Validate athleteId -----
    if (!athleteId || !validateUUID(athleteId)) {
      return NextResponse.json(
        { success: false, error: "Invalid athleteId. Must be a valid UUID." },
        { status: 400 }
      );
    }

    // ----- Validate scenarios -----
    if (!Array.isArray(scenarios) || scenarios.length === 0) {
      return NextResponse.json(
        { success: false, error: "At least one scenario is required." },
        { status: 400 }
      );
    }

    if (scenarios.length > 3) {
      return NextResponse.json(
        { success: false, error: "Maximum 3 scenarios allowed." },
        { status: 400 }
      );
    }

    // ----- Validate & clamp simulationDays -----
    const clampedDays = clamp(
      typeof simulationDays === "number" ? simulationDays : 7,
      3,
      14
    );

    // ----- Validate & clamp daily loads -----
    const sanitizedScenarios: Scenario[] = scenarios.map((s) => ({
      name: typeof s.name === "string" ? s.name.slice(0, 100) : "Unnamed",
      dailyLoads: Array.isArray(s.dailyLoads)
        ? s.dailyLoads
            .filter(
              (dl): dl is DailyLoad =>
                typeof dl === "object" &&
                dl !== null &&
                typeof dl.day === "number" &&
                typeof dl.srpe === "number"
            )
            .map((dl) => ({
              day: clamp(Math.round(dl.day), 1, 14),
              srpe: clamp(dl.srpe, 0, 1000),
              type: VALID_LOAD_TYPES.has(dl.type) ? dl.type : "normal",
            }))
        : [],
    }));

    // ----- Org-level athlete access check -----
    const { data: athlete, error: athleteError } = await supabase
      .from("athletes")
      .select("id, org_id")
      .eq("id", athleteId)
      .single();

    if (athleteError || !athlete) {
      return NextResponse.json(
        {
          success: false,
          error: "Athlete not found or access denied.",
        },
        { status: 403 }
      );
    }

    // ----- Fetch baseline: last 42 days of daily_metrics -----
    const today = new Date().toISOString().split("T")[0]!;
    const fortyTwoDaysAgo = new Date();
    fortyTwoDaysAgo.setDate(fortyTwoDaysAgo.getDate() - 42);
    const fromDate = fortyTwoDaysAgo.toISOString().split("T")[0]!;

    const { data: metricsRows, error: metricsError } = await supabase
      .from("daily_metrics")
      .select("date, srpe, acwr, fitness_ewma, fatigue_ewma")
      .eq("athlete_id", athleteId)
      .gte("date", fromDate)
      .lte("date", today)
      .order("date", { ascending: true });

    if (metricsError) {
      console.error("[simulator/conditioning] daily_metrics fetch error:", metricsError);
      return NextResponse.json(
        { success: false, error: "Failed to fetch conditioning data." },
        { status: 500 }
      );
    }

    const rows = metricsRows ?? [];

    // ----- Compute baseline values -----
    const latestRow = rows.length > 0 ? rows[rows.length - 1] : null;

    const currentAcute = (latestRow?.fatigue_ewma as number | null) ?? 0;
    const currentChronic = (latestRow?.fitness_ewma as number | null) ?? 0;
    const currentAcwr = (latestRow?.acwr as number | null) ?? 0;

    // Historical sRPE values for monotony rolling window
    const historicalLoads = rows.map((r) => ((r.srpe as number | null) ?? 0));

    // Compute current monotony from last 7 days
    const last7Loads = historicalLoads.slice(-7);
    const { mean: baselineMean, sd: baselineSd } = rolling7DayStats(last7Loads);
    const currentMonotony =
      baselineSd > 0
        ? Math.round((baselineMean / baselineSd) * 100) / 100
        : 0;
    const currentStrain = Math.round(baselineMean * 7 * currentMonotony * 100) / 100;

    // Baseline tissue damage (simplified: estimate from recent load pattern)
    const tissueDamage: Record<string, number> = {};
    for (const [category, halfLife] of Object.entries(TISSUE_CATEGORIES)) {
      let damage = 0;
      for (const load of historicalLoads) {
        damage = damage * Math.pow(2, -1 / halfLife) + load / 1000;
      }
      tissueDamage[category] = Math.min(1, Math.round(damage * 1000) / 1000);
    }

    // ----- Run simulation for each scenario -----
    const scenarioResults: ScenarioResult[] = sanitizedScenarios.map((scenario) => {
      const acwrTrend = projectAcwr(
        currentAcute,
        currentChronic,
        scenario.dailyLoads,
        clampedDays
      );

      const monotonyTrend = projectMonotony(
        historicalLoads,
        scenario.dailyLoads,
        clampedDays
      );

      const tissueRecovery = projectTissueRecovery(
        scenario.dailyLoads,
        clampedDays
      );

      const decisions = simulateDecisions(
        acwrTrend,
        monotonyTrend,
        tissueRecovery,
        clampedDays
      );

      const sweetSpotReturn = findSweetSpotReturn(acwrTrend);

      const score = scoreScenario(
        sweetSpotReturn,
        acwrTrend,
        tissueRecovery,
        clampedDays
      );

      return {
        name: scenario.name,
        acwrTrend,
        monotonyTrend,
        tissueRecovery,
        decisions,
        sweetSpotReturn,
        score,
      };
    });

    // ----- Determine recommended scenario (lowest score = best) -----
    let recommendedScenario = 0;
    let lowestScore = Infinity;
    for (let i = 0; i < scenarioResults.length; i++) {
      if (scenarioResults[i]!.score < lowestScore) {
        lowestScore = scenarioResults[i]!.score;
        recommendedScenario = i;
      }
    }

    // ----- Response -----
    return NextResponse.json({
      success: true,
      data: {
        baseline: {
          currentAcwr,
          currentMonotony,
          currentStrain,
          tissueDamage,
        },
        scenarios: scenarioResults,
        recommendedScenario,
      },
    });
  } catch (err) {
    console.error("[simulator/conditioning] Unexpected error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error." },
      { status: 500 }
    );
  }
}

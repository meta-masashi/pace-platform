/**
 * PACE Platform -- AI Intervention Suggestion API
 *
 * POST /api/ai/intervention-suggest
 *
 * Pro plan only (feature_ai_soap).
 * Template-based generation with Gemini-ready structure.
 *
 * For conditioning: Generates 2-3 optimal load reduction/maintenance scenarios
 * based on current ACWR/monotony/strain.
 *
 * For rehab: Generates exercise recommendations based on current phase,
 * NRS, diagnosis, fetching suitable exercises from rehab_exercises table.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateUUID } from "@/lib/security/input-validator";
import { canAccess } from "@/lib/billing/plan-gates";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CurrentState {
  acwr?: number;
  monotony?: number;
  strain?: number;
  tissueDamage?: Record<string, number>;
  // Rehab-specific
  currentPhase?: number;
  daysSinceInjury?: number;
  currentNrs?: number;
  diagnosis?: string;
}

interface RequestBody {
  athleteId: string;
  type: "conditioning" | "rehab";
  currentState: CurrentState;
}

interface DailyLoadSuggestion {
  day: number;
  srpe: number;
  type: string;
}

interface ScenarioPreset {
  dailyLoads: DailyLoadSuggestion[];
}

interface ExerciseChange {
  action: "add" | "remove" | "modify";
  exerciseName: string;
  exerciseId?: string;
  reason: string;
}

interface Suggestion {
  name: string;
  description: string;
  confidence: number;
  scenarioPreset?: ScenarioPreset;
  exerciseChanges?: ExerciseChange[];
}

interface SuccessResponse {
  success: true;
  data: {
    type: "conditioning" | "rehab";
    suggestions: Suggestion[];
    generalAdvice: string;
  };
}

interface ErrorResponse {
  success: false;
  error: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_TYPES = new Set(["conditioning", "rehab"]);
const ACWR_SWEET_SPOT_LOW = 0.8;
const ACWR_SWEET_SPOT_HIGH = 1.3;
const ACWR_DANGER_ZONE = 1.5;
const MONOTONY_HIGH = 2.0;

// ---------------------------------------------------------------------------
// Template-based conditioning suggestion generator
// ---------------------------------------------------------------------------

function generateConditioningSuggestions(state: CurrentState): {
  suggestions: Suggestion[];
  generalAdvice: string;
} {
  const acwr = state.acwr ?? 1.0;
  const monotony = state.monotony ?? 1.0;
  const strain = state.strain ?? 0;
  const suggestions: Suggestion[] = [];

  // Determine baseline sRPE from strain/monotony (rough estimate)
  const estimatedDailySrpe =
    monotony > 0 && strain > 0 ? strain / (7 * monotony) : 300;

  if (acwr > ACWR_DANGER_ZONE) {
    // ---- High ACWR: aggressive load reduction ----
    suggestions.push({
      name: "Aggressive Load Reduction",
      description:
        `ACWR is critically elevated (${acwr.toFixed(2)}). ` +
        "Recommends significant load reduction over 7 days to bring ACWR below 1.3.",
      confidence: 0.9,
      scenarioPreset: {
        dailyLoads: generateDailyLoads(estimatedDailySrpe, 0.4, 7, "modified"),
      },
    });

    suggestions.push({
      name: "Gradual Taper with Active Recovery",
      description:
        "Moderate reduction with alternating rest days. " +
        "Maintains training stimulus while reducing acute load accumulation.",
      confidence: 0.75,
      scenarioPreset: {
        dailyLoads: generateAlternatingLoads(estimatedDailySrpe, 0.5, 7),
      },
    });

    suggestions.push({
      name: "Complete Rest Period",
      description:
        "Full rest for 3 days followed by gradual reintroduction. " +
        "Recommended if athlete shows signs of overreaching or injury risk.",
      confidence: 0.6,
      scenarioPreset: {
        dailyLoads: generateRestThenRamp(estimatedDailySrpe, 7),
      },
    });
  } else if (acwr > ACWR_SWEET_SPOT_HIGH) {
    // ---- Elevated ACWR: moderate reduction ----
    suggestions.push({
      name: "Moderate Load Reduction",
      description:
        `ACWR is above optimal (${acwr.toFixed(2)}). ` +
        "Reduce load by ~25% for 5-7 days to return to sweet spot.",
      confidence: 0.85,
      scenarioPreset: {
        dailyLoads: generateDailyLoads(estimatedDailySrpe, 0.75, 7, "normal"),
      },
    });

    suggestions.push({
      name: "Maintain with Variation",
      description:
        "Keep total volume similar but increase exercise variety. " +
        "Reduces monotony while managing ACWR.",
      confidence: 0.7,
      scenarioPreset: {
        dailyLoads: generateVariedLoads(estimatedDailySrpe, 7),
      },
    });
  } else if (acwr < ACWR_SWEET_SPOT_LOW) {
    // ---- Low ACWR: progressive overload ----
    suggestions.push({
      name: "Progressive Load Increase",
      description:
        `ACWR is below optimal (${acwr.toFixed(2)}). ` +
        "Gradually increase load by 10-15% per week to build chronic fitness.",
      confidence: 0.85,
      scenarioPreset: {
        dailyLoads: generateDailyLoads(estimatedDailySrpe, 1.15, 7, "normal"),
      },
    });

    suggestions.push({
      name: "Stepped Ramp-Up",
      description:
        "Increase load in steps every 2-3 days. " +
        "Allows tissue adaptation between load increments.",
      confidence: 0.7,
      scenarioPreset: {
        dailyLoads: generateSteppedRamp(estimatedDailySrpe, 7),
      },
    });
  } else {
    // ---- Sweet spot: maintenance plans ----
    suggestions.push({
      name: "Maintain Current Load",
      description:
        `ACWR is in the sweet spot (${acwr.toFixed(2)}). ` +
        "Continue current training plan with minor variations.",
      confidence: 0.9,
      scenarioPreset: {
        dailyLoads: generateDailyLoads(estimatedDailySrpe, 1.0, 7, "normal"),
      },
    });

    suggestions.push({
      name: "Slight Progressive Overload",
      description:
        "Small 5% load increase to continue building fitness. " +
        "Maintains ACWR within the sweet spot.",
      confidence: 0.75,
      scenarioPreset: {
        dailyLoads: generateDailyLoads(estimatedDailySrpe, 1.05, 7, "normal"),
      },
    });
  }

  // Monotony-specific advice
  if (monotony > MONOTONY_HIGH) {
    suggestions.push({
      name: "Monotony Reduction Plan",
      description:
        `Training monotony is high (${monotony.toFixed(2)}). ` +
        "Introduce greater daily load variation to reduce injury risk.",
      confidence: 0.8,
      scenarioPreset: {
        dailyLoads: generateVariedLoads(estimatedDailySrpe, 7),
      },
    });
  }

  // Limit to 3 suggestions max
  const topSuggestions = suggestions.slice(0, 3);

  const generalAdvice = buildConditioningAdvice(acwr, monotony, strain);

  return { suggestions: topSuggestions, generalAdvice };
}

// ---------------------------------------------------------------------------
// Template-based rehab suggestion generator
// ---------------------------------------------------------------------------

async function generateRehabSuggestions(
  state: CurrentState,
  athleteId: string,
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never
): Promise<{
  suggestions: Suggestion[];
  generalAdvice: string;
}> {
  const phase = state.currentPhase ?? 1;
  const nrs = state.currentNrs ?? 0;
  const daysSinceInjury = state.daysSinceInjury ?? 0;
  const diagnosis = state.diagnosis ?? "unknown";

  // Fetch athlete sport for exercise matching
  const { data: athlete } = await supabase
    .from("athletes")
    .select("sport")
    .eq("id", athleteId)
    .single();

  const sport = (athlete?.sport as string) ?? null;

  // Fetch suitable exercises from rehab_exercises table
  let exerciseQuery = supabase
    .from("rehab_exercises")
    .select(
      "id, name, name_en, category, target_tissue, intensity_level, tissue_load, expected_effect, min_phase, contraindications, sport_tags"
    )
    .lte("min_phase", phase)
    .order("min_phase", { ascending: true })
    .order("intensity_level", { ascending: true })
    .limit(20);

  if (sport) {
    exerciseQuery = exerciseQuery.contains("sport_tags", [sport]);
  }

  const { data: availableExercises } = await exerciseQuery;
  const exercises = availableExercises ?? [];

  const suggestions: Suggestion[] = [];

  if (nrs > 5) {
    // ---- High pain: conservative approach ----
    const lowIntensityExercises = exercises.filter(
      (e) => (e.intensity_level as number) <= 2
    );

    suggestions.push({
      name: "Pain Management Protocol",
      description:
        `NRS is elevated (${nrs}/10). ` +
        "Focus on low-intensity exercises and pain modulation. " +
        "Consider removing high-load exercises temporarily.",
      confidence: 0.85,
      exerciseChanges: buildExerciseChanges(
        lowIntensityExercises,
        exercises,
        "pain_reduction"
      ),
    });

    suggestions.push({
      name: "Active Rest with Gentle Mobility",
      description:
        "Reduce exercise volume by 50%. Maintain gentle ROM exercises only. " +
        "Re-assess pain levels after 48-72 hours.",
      confidence: 0.7,
      exerciseChanges: buildMinimalChanges(exercises, phase),
    });
  } else if (nrs <= 2 && phase < 4) {
    // ---- Low pain: consider phase progression ----
    const nextPhaseExercises = exercises.filter(
      (e) => (e.min_phase as number) === phase + 1
    );

    suggestions.push({
      name: "Phase Progression Recommendation",
      description:
        `Pain is well controlled (NRS ${nrs}/10). ` +
        `Day ${daysSinceInjury} post-injury. ` +
        `Consider advancing from Phase ${phase} to Phase ${phase + 1}.`,
      confidence: calculatePhaseProgressionConfidence(
        nrs,
        daysSinceInjury,
        phase
      ),
      exerciseChanges: buildPhaseProgressionChanges(
        nextPhaseExercises,
        exercises,
        phase
      ),
    });

    suggestions.push({
      name: "Current Phase Optimization",
      description:
        "Maintain current phase with increased intensity/volume. " +
        "Add sport-specific exercises if not already included.",
      confidence: 0.75,
      exerciseChanges: buildOptimizationChanges(exercises, phase, sport),
    });
  } else {
    // ---- Moderate pain / maintenance ----
    suggestions.push({
      name: "Maintain Current Program",
      description:
        `NRS at ${nrs}/10. ` +
        "Continue current exercise prescription with standard progression.",
      confidence: 0.8,
      exerciseChanges: buildMaintenanceChanges(exercises, phase),
    });

    if (exercises.length > 0) {
      suggestions.push({
        name: "Add Complementary Exercises",
        description:
          "Introduce complementary exercises to address secondary tissues. " +
          "Maintains overall tissue balance during rehabilitation.",
        confidence: 0.65,
        exerciseChanges: buildComplementaryChanges(exercises, phase),
      });
    }
  }

  // Diagnosis-specific suggestion
  const diagnosisSuggestion = buildDiagnosisSuggestion(
    diagnosis,
    phase,
    nrs,
    exercises
  );
  if (diagnosisSuggestion) {
    suggestions.push(diagnosisSuggestion);
  }

  const topSuggestions = suggestions.slice(0, 3);

  const generalAdvice = buildRehabAdvice(phase, nrs, daysSinceInjury, diagnosis);

  return { suggestions: topSuggestions, generalAdvice };
}

// ---------------------------------------------------------------------------
// Conditioning load generation helpers
// ---------------------------------------------------------------------------

function generateDailyLoads(
  baseSrpe: number,
  factor: number,
  days: number,
  type: string
): DailyLoadSuggestion[] {
  const loads: DailyLoadSuggestion[] = [];
  for (let day = 1; day <= days; day++) {
    loads.push({
      day,
      srpe: Math.round(clamp(baseSrpe * factor, 0, 1000)),
      type,
    });
  }
  return loads;
}

function generateAlternatingLoads(
  baseSrpe: number,
  factor: number,
  days: number
): DailyLoadSuggestion[] {
  const loads: DailyLoadSuggestion[] = [];
  for (let day = 1; day <= days; day++) {
    const isRestDay = day % 2 === 0;
    loads.push({
      day,
      srpe: isRestDay ? 0 : Math.round(clamp(baseSrpe * factor, 0, 1000)),
      type: isRestDay ? "rest" : "modified",
    });
  }
  return loads;
}

function generateRestThenRamp(
  baseSrpe: number,
  days: number
): DailyLoadSuggestion[] {
  const loads: DailyLoadSuggestion[] = [];
  for (let day = 1; day <= days; day++) {
    if (day <= 3) {
      loads.push({ day, srpe: 0, type: "rest" });
    } else {
      const rampFactor = 0.3 + ((day - 3) / (days - 3)) * 0.4;
      loads.push({
        day,
        srpe: Math.round(clamp(baseSrpe * rampFactor, 0, 1000)),
        type: "modified",
      });
    }
  }
  return loads;
}

function generateVariedLoads(
  baseSrpe: number,
  days: number
): DailyLoadSuggestion[] {
  // High-low pattern to reduce monotony
  const variationPattern = [1.1, 0.6, 1.0, 0.5, 1.2, 0.7, 0.9];
  const loads: DailyLoadSuggestion[] = [];
  for (let day = 1; day <= days; day++) {
    const factor = variationPattern[(day - 1) % variationPattern.length]!;
    loads.push({
      day,
      srpe: Math.round(clamp(baseSrpe * factor, 0, 1000)),
      type: factor < 0.6 ? "modified" : "normal",
    });
  }
  return loads;
}

function generateSteppedRamp(
  baseSrpe: number,
  days: number
): DailyLoadSuggestion[] {
  const loads: DailyLoadSuggestion[] = [];
  for (let day = 1; day <= days; day++) {
    // Step up every 2-3 days
    const step = Math.floor((day - 1) / 3);
    const factor = 1.0 + step * 0.1;
    loads.push({
      day,
      srpe: Math.round(clamp(baseSrpe * factor, 0, 1000)),
      type: "normal",
    });
  }
  return loads;
}

// ---------------------------------------------------------------------------
// Rehab exercise change helpers
// ---------------------------------------------------------------------------

interface RehabExerciseRow {
  id: string;
  name: string;
  name_en?: string;
  category?: string;
  target_tissue?: string;
  intensity_level?: number;
  tissue_load?: number;
  expected_effect?: string;
  min_phase?: number;
  contraindications?: string[];
  sport_tags?: string[];
}

function buildExerciseChanges(
  preferredExercises: RehabExerciseRow[],
  allExercises: RehabExerciseRow[],
  _strategy: string
): ExerciseChange[] {
  const changes: ExerciseChange[] = [];

  // Remove high-intensity exercises
  const highIntensity = allExercises.filter(
    (e) => (e.intensity_level ?? 0) > 3
  );
  for (const ex of highIntensity.slice(0, 2)) {
    changes.push({
      action: "remove",
      exerciseName: (ex.name_en ?? ex.name) as string,
      exerciseId: ex.id as string,
      reason: "Intensity too high for current pain level.",
    });
  }

  // Add low-intensity alternatives
  for (const ex of preferredExercises.slice(0, 2)) {
    changes.push({
      action: "add",
      exerciseName: (ex.name_en ?? ex.name) as string,
      exerciseId: ex.id as string,
      reason: `Low intensity (${ex.intensity_level}) suitable for pain management.`,
    });
  }

  return changes;
}

function buildMinimalChanges(
  exercises: RehabExerciseRow[],
  _phase: number
): ExerciseChange[] {
  const changes: ExerciseChange[] = [];

  // Modify existing exercises to reduce volume
  for (const ex of exercises.slice(0, 2)) {
    if ((ex.intensity_level ?? 0) > 2) {
      changes.push({
        action: "modify",
        exerciseName: (ex.name_en ?? ex.name) as string,
        exerciseId: ex.id as string,
        reason: "Reduce sets/reps by 50% due to elevated pain.",
      });
    }
  }

  return changes;
}

function buildPhaseProgressionChanges(
  nextPhaseExercises: RehabExerciseRow[],
  currentExercises: RehabExerciseRow[],
  currentPhase: number
): ExerciseChange[] {
  const changes: ExerciseChange[] = [];

  // Add next-phase exercises
  for (const ex of nextPhaseExercises.slice(0, 2)) {
    changes.push({
      action: "add",
      exerciseName: (ex.name_en ?? ex.name) as string,
      exerciseId: ex.id as string,
      reason: `Phase ${currentPhase + 1} exercise. Progressive loading for tissue adaptation.`,
    });
  }

  // Remove early-phase low-intensity exercises
  const earlyPhase = currentExercises.filter(
    (e) => (e.min_phase ?? 1) < currentPhase && (e.intensity_level ?? 0) <= 1
  );
  for (const ex of earlyPhase.slice(0, 1)) {
    changes.push({
      action: "remove",
      exerciseName: (ex.name_en ?? ex.name) as string,
      exerciseId: ex.id as string,
      reason: `Phase ${ex.min_phase ?? 1} exercise no longer needed at Phase ${currentPhase + 1}.`,
    });
  }

  return changes;
}

function buildOptimizationChanges(
  exercises: RehabExerciseRow[],
  phase: number,
  sport: string | null
): ExerciseChange[] {
  const changes: ExerciseChange[] = [];

  // Modify existing exercises for increased volume
  const phaseAppropriate = exercises.filter(
    (e) => (e.min_phase ?? 1) === phase
  );
  for (const ex of phaseAppropriate.slice(0, 2)) {
    changes.push({
      action: "modify",
      exerciseName: (ex.name_en ?? ex.name) as string,
      exerciseId: ex.id as string,
      reason: "Increase volume/intensity within current phase tolerance.",
    });
  }

  // Add sport-specific exercise if available
  if (sport) {
    const sportSpecific = exercises.filter((e) =>
      (e.sport_tags ?? []).includes(sport)
    );
    const toAdd = sportSpecific.find(
      (e) => !phaseAppropriate.some((p) => p.id === e.id)
    );
    if (toAdd) {
      changes.push({
        action: "add",
        exerciseName: (toAdd.name_en ?? toAdd.name) as string,
        exerciseId: toAdd.id as string,
        reason: `Sport-specific (${sport}) exercise for functional progression.`,
      });
    }
  }

  return changes;
}

function buildMaintenanceChanges(
  exercises: RehabExerciseRow[],
  phase: number
): ExerciseChange[] {
  const changes: ExerciseChange[] = [];

  const phaseMatch = exercises.filter((e) => (e.min_phase ?? 1) === phase);
  if (phaseMatch.length > 0) {
    changes.push({
      action: "modify",
      exerciseName: (phaseMatch[0]!.name_en ?? phaseMatch[0]!.name) as string,
      exerciseId: phaseMatch[0]!.id as string,
      reason: "Standard weekly progression: increase reps or resistance by 5-10%.",
    });
  }

  return changes;
}

function buildComplementaryChanges(
  exercises: RehabExerciseRow[],
  _phase: number
): ExerciseChange[] {
  const changes: ExerciseChange[] = [];

  // Group by target tissue to find underrepresented areas
  const tissues = new Set(exercises.map((e) => e.target_tissue).filter(Boolean));
  const allTissues = [
    "hamstring",
    "quadriceps",
    "hip",
    "ankle",
    "shoulder",
    "core",
  ];
  const missing = allTissues.filter((t) => !tissues.has(t));

  if (missing.length > 0) {
    // Find exercises that target missing tissues
    const complementary = exercises.filter(
      (e) => e.target_tissue && missing.includes(e.target_tissue as string)
    );
    for (const ex of complementary.slice(0, 2)) {
      changes.push({
        action: "add",
        exerciseName: (ex.name_en ?? ex.name) as string,
        exerciseId: ex.id as string,
        reason: `Addresses underrepresented tissue: ${ex.target_tissue}.`,
      });
    }
  }

  return changes;
}

function buildDiagnosisSuggestion(
  diagnosis: string,
  phase: number,
  nrs: number,
  exercises: RehabExerciseRow[]
): Suggestion | null {
  const diagLower = diagnosis.toLowerCase();

  // Provide diagnosis-specific templates for common conditions
  if (diagLower.includes("acl") || diagLower.includes("anterior cruciate")) {
    const quadExercises = exercises.filter(
      (e) =>
        (e.target_tissue as string)?.includes("quadriceps") ||
        (e.category as string)?.includes("strength")
    );
    if (quadExercises.length > 0) {
      return {
        name: "ACL Protocol: Quad Strengthening Focus",
        description:
          `Phase ${phase} ACL rehabilitation. ` +
          "Prioritize quadriceps strengthening and neuromuscular control. " +
          "Progressive loading based on tissue healing timeline.",
        confidence: 0.8,
        exerciseChanges: quadExercises.slice(0, 2).map((ex) => ({
          action: "add" as const,
          exerciseName: (ex.name_en ?? ex.name) as string,
          exerciseId: ex.id as string,
          reason: "ACL protocol: quadriceps deficit prevention.",
        })),
      };
    }
  }

  if (diagLower.includes("ankle") || diagLower.includes("sprain")) {
    const balanceExercises = exercises.filter(
      (e) =>
        (e.target_tissue as string)?.includes("ankle") ||
        (e.category as string)?.includes("balance")
    );
    if (balanceExercises.length > 0) {
      return {
        name: "Ankle Sprain: Proprioception Protocol",
        description:
          `Phase ${phase} ankle rehabilitation (NRS ${nrs}/10). ` +
          "Focus on proprioceptive training and peroneal strengthening.",
        confidence: 0.75,
        exerciseChanges: balanceExercises.slice(0, 2).map((ex) => ({
          action: "add" as const,
          exerciseName: (ex.name_en ?? ex.name) as string,
          exerciseId: ex.id as string,
          reason: "Ankle protocol: proprioception and stability training.",
        })),
      };
    }
  }

  if (
    diagLower.includes("hamstring") ||
    diagLower.includes("muscle strain")
  ) {
    const hamExercises = exercises.filter(
      (e) =>
        (e.target_tissue as string)?.includes("hamstring") ||
        (e.category as string)?.includes("eccentric")
    );
    if (hamExercises.length > 0) {
      return {
        name: "Hamstring Protocol: Eccentric Loading",
        description:
          `Phase ${phase} hamstring rehabilitation. ` +
          "Nordic hamstring and eccentric-focused progression. " +
          "Key for recurrence prevention.",
        confidence: 0.8,
        exerciseChanges: hamExercises.slice(0, 2).map((ex) => ({
          action: "add" as const,
          exerciseName: (ex.name_en ?? ex.name) as string,
          exerciseId: ex.id as string,
          reason: "Hamstring protocol: eccentric strengthening for recurrence prevention.",
        })),
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Advice builders
// ---------------------------------------------------------------------------

function buildConditioningAdvice(
  acwr: number,
  monotony: number,
  strain: number
): string {
  const parts: string[] = [];

  if (acwr > ACWR_DANGER_ZONE) {
    parts.push(
      `ACWR (${acwr.toFixed(2)}) is above the danger threshold of ${ACWR_DANGER_ZONE}. ` +
        "Prioritize load reduction to minimize injury risk."
    );
  } else if (acwr > ACWR_SWEET_SPOT_HIGH) {
    parts.push(
      `ACWR (${acwr.toFixed(2)}) is above the sweet spot. ` +
        "Moderate adjustments recommended."
    );
  } else if (acwr < ACWR_SWEET_SPOT_LOW) {
    parts.push(
      `ACWR (${acwr.toFixed(2)}) is below optimal. ` +
        "Consider progressive load increases to build chronic fitness."
    );
  } else {
    parts.push(
      `ACWR (${acwr.toFixed(2)}) is within the optimal sweet spot (${ACWR_SWEET_SPOT_LOW}-${ACWR_SWEET_SPOT_HIGH}).`
    );
  }

  if (monotony > MONOTONY_HIGH) {
    parts.push(
      `Monotony index (${monotony.toFixed(2)}) is elevated. ` +
        "Introduce greater day-to-day load variation."
    );
  }

  if (strain > 3000) {
    parts.push(
      `Strain (${strain.toFixed(0)}) is high. ` +
        "Monitor for signs of accumulated fatigue."
    );
  }

  return parts.length > 0
    ? parts.join(" ")
    : "Current conditioning metrics are within normal parameters. Continue monitoring.";
}

function buildRehabAdvice(
  phase: number,
  nrs: number,
  daysSinceInjury: number,
  diagnosis: string
): string {
  const parts: string[] = [];

  parts.push(`Rehabilitation Phase ${phase}, Day ${daysSinceInjury} post-injury.`);

  if (diagnosis !== "unknown") {
    parts.push(`Diagnosis: ${diagnosis}.`);
  }

  if (nrs > 5) {
    parts.push(
      `Pain level (NRS ${nrs}/10) is elevated. ` +
        "Consider reducing exercise intensity and consulting with the medical team."
    );
  } else if (nrs <= 2) {
    parts.push(
      `Pain is well controlled (NRS ${nrs}/10). ` +
        "Phase progression criteria should be evaluated."
    );
  } else {
    parts.push(
      `Pain level (NRS ${nrs}/10) is moderate. ` +
        "Continue current protocol with standard progression."
    );
  }

  // Timeline estimates based on phase
  const phaseTimelines: Record<number, string> = {
    1: "Estimated 1-2 weeks to Phase 2 with favorable NRS trend.",
    2: "Estimated 2-4 weeks to Phase 3 with successful loading progression.",
    3: "Estimated 3-6 weeks to Phase 4 (return-to-sport) depending on functional criteria.",
    4: "Final phase: focus on sport-specific readiness and clearance criteria.",
  };
  if (phaseTimelines[phase]) {
    parts.push(phaseTimelines[phase]!);
  }

  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Phase progression confidence
// ---------------------------------------------------------------------------

function calculatePhaseProgressionConfidence(
  nrs: number,
  daysSinceInjury: number,
  currentPhase: number
): number {
  let confidence = 0.5;

  // Low pain increases confidence
  if (nrs <= 1) confidence += 0.2;
  else if (nrs <= 2) confidence += 0.1;

  // Minimum days per phase (rough guidelines)
  const minDaysPerPhase: Record<number, number> = {
    1: 7,
    2: 14,
    3: 21,
    4: 28,
  };
  const minDays = minDaysPerPhase[currentPhase] ?? 14;
  const cumulativeMinDays = Object.entries(minDaysPerPhase)
    .filter(([p]) => Number(p) <= currentPhase)
    .reduce((sum, [, d]) => sum + d, 0);

  if (daysSinceInjury >= cumulativeMinDays) {
    confidence += 0.15;
  }

  return Math.min(0.95, Math.round(confidence * 100) / 100);
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ---------------------------------------------------------------------------
// POST /api/ai/intervention-suggest
// ---------------------------------------------------------------------------

export async function POST(
  request: Request
): Promise<NextResponse<SuccessResponse | ErrorResponse>> {
  try {
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

    const { athleteId, type, currentState } = body;

    // ----- Validate athleteId -----
    if (!athleteId || !validateUUID(athleteId)) {
      return NextResponse.json(
        { success: false, error: "Invalid athleteId. Must be a valid UUID." },
        { status: 400 }
      );
    }

    // ----- Validate type -----
    if (!type || !VALID_TYPES.has(type)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid type. Must be 'conditioning' or 'rehab'.",
        },
        { status: 400 }
      );
    }

    // ----- Validate currentState -----
    if (!currentState || typeof currentState !== "object") {
      return NextResponse.json(
        { success: false, error: "currentState is required and must be an object." },
        { status: 400 }
      );
    }

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

    // ----- Staff check -----
    const { data: staff, error: staffError } = await supabase
      .from("staff")
      .select("id, org_id, role")
      .eq("id", user.id)
      .single();

    if (staffError || !staff) {
      return NextResponse.json(
        { success: false, error: "Staff profile not found." },
        { status: 403 }
      );
    }

    // ----- Fetch athlete & org for plan gate (with org_id filter) -----
    const { data: athlete, error: athleteError } = await supabase
      .from("athletes")
      .select("id, org_id")
      .eq("id", athleteId)
      .eq("org_id", staff.org_id as string)
      .single();

    if (athleteError || !athlete) {
      return NextResponse.json(
        { success: false, error: "Athlete not found or access denied." },
        { status: 403 }
      );
    }

    // ----- Plan gate: feature_ai_soap (Pro plan only) -----
    const accessResult = await canAccess(
      supabase,
      athlete.org_id as string,
      "feature_ai_soap"
    );

    if (!accessResult.allowed) {
      return NextResponse.json(
        {
          success: false,
          error:
            accessResult.reason ??
            "This feature requires a Pro plan or higher.",
        },
        { status: 403 }
      );
    }

    // ----- Generate suggestions based on type -----
    let suggestions: Suggestion[];
    let generalAdvice: string;

    if (type === "conditioning") {
      const result = generateConditioningSuggestions(currentState);
      suggestions = result.suggestions;
      generalAdvice = result.generalAdvice;
    } else {
      // rehab
      const result = await generateRehabSuggestions(
        currentState,
        athleteId,
        supabase
      );
      suggestions = result.suggestions;
      generalAdvice = result.generalAdvice;
    }

    // ----- Response -----
    return NextResponse.json({
      success: true,
      data: {
        type,
        suggestions,
        generalAdvice,
      },
    });
  } catch (err) {
    console.error("[ai/intervention-suggest] Unexpected error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error." },
      { status: 500 }
    );
  }
}

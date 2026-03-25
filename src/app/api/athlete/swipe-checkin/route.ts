import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { SwipeResponsePayload } from "@/types/swipe-assessment";

/**
 * POST /api/athlete/swipe-checkin
 * Body: { responses: SwipeResponsePayload[] }
 *
 * 1. Store raw swipe responses + telemetry
 * 2. Compute EKF observation noise penalty R_k
 * 3. Forward to condition pipeline
 */

/** EKF R_k penalty sensitivity */
const LAMBDA_HESITATION = 1.5;
/** Default baseline reaction time (ms) */
const DEFAULT_BASELINE_MS = 800;

/**
 * Dynamic R_k penalty based on hesitation time.
 *
 * R_k = R_base × (1 + exp(λ × (current - avg) / avg))
 *
 * When an athlete hesitates significantly longer than their baseline,
 * the EKF will down-weight their subjective report and rely more on
 * objective ODE damage predictions.
 */
function computeRkPenalty(
  hesitationMs: number,
  baselineMs: number,
  lambda: number = LAMBDA_HESITATION
): number {
  const safeBaseline = Math.max(baselineMs, 100); // prevent div by zero
  const ratio = (hesitationMs - safeBaseline) / safeBaseline;
  const penalty = 1 + Math.exp(lambda * ratio);
  // Clamp: minimum 1.0 (no penalty), maximum 20.0 (extreme distrust)
  return Math.max(1.0, Math.min(20.0, penalty));
}

/**
 * Aggregate swipe responses into a subjective condition score.
 * -1 (good) → 10, +1 (bad) → 0, scaled by velocity.
 */
function aggregateSubjectiveScore(responses: SwipeResponsePayload[]): number {
  if (responses.length === 0) return 5;

  let score = 0;
  for (const r of responses) {
    // response: -1 = good (10 pts), +1 = bad (0 pts)
    const base = r.response === -1 ? 10 : 0;
    // Low velocity on bad responses = more severe (they were deliberate)
    // High velocity on good responses = confident wellness
    score += base;
  }

  return Math.round((score / (responses.length * 10)) * 100) / 10; // 0-10 scale
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const responses: SwipeResponsePayload[] = body.responses;

    if (!responses || !Array.isArray(responses) || responses.length === 0) {
      return NextResponse.json(
        { error: "responses array required" },
        { status: 400 }
      );
    }

    const athleteId = responses[0].athlete_id;

    // Fetch athlete's 30-day average reaction time (baseline)
    const { data: historicalData } = await supabase
      .from("swipe_telemetry")
      .select("reaction_latency_ms")
      .eq("athlete_id", athleteId)
      .gte(
        "created_at",
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      )
      .order("created_at", { ascending: false })
      .limit(100);

    const baselineMs =
      historicalData && historicalData.length > 0
        ? historicalData.reduce((s, r) => s + r.reaction_latency_ms, 0) /
          historicalData.length
        : DEFAULT_BASELINE_MS;

    // Compute per-response R_k penalties
    const responsesWithPenalty = responses.map((r) => ({
      ...r,
      rk_penalty: computeRkPenalty(r.hesitation_time_ms, baselineMs),
      baseline_ms: Math.round(baselineMs),
    }));

    // Average R_k penalty across all responses
    const avgRkPenalty =
      responsesWithPenalty.reduce((s, r) => s + r.rk_penalty, 0) /
      responsesWithPenalty.length;

    // Store telemetry data
    const telemetryRows = responsesWithPenalty.map((r) => ({
      athlete_id: athleteId,
      question_id: r.question_id,
      response: r.response,
      reaction_latency_ms: r.reaction_latency_ms,
      hesitation_time_ms: r.hesitation_time_ms,
      swipe_velocity: r.swipe_velocity,
      rk_penalty: Math.round(r.rk_penalty * 100) / 100,
      baseline_reaction_ms: r.baseline_ms,
    }));

    await supabase.from("swipe_telemetry").insert(telemetryRows);

    // Aggregate subjective condition score
    const subjectiveScore = aggregateSubjectiveScore(responses);

    // Determine if hesitation pattern suggests deception
    const highHesitationResponses = responsesWithPenalty.filter(
      (r) => r.rk_penalty > 3.0 && r.response === -1 // said "good" but hesitated
    );
    const potentialDeception = highHesitationResponses.length > 0;

    // Forward subjective penalty to condition cache update
    const { error: cacheError } = await supabase
      .from("athlete_condition_cache")
      .update({
        subjective_penalty: avgRkPenalty > 2.0 ? avgRkPenalty * 0.1 : 0,
        updated_at: new Date().toISOString(),
      })
      .eq("athlete_id", athleteId);

    if (cacheError) {
      console.error("Cache update error:", cacheError);
    }

    return NextResponse.json({
      success: true,
      subjective_score: subjectiveScore,
      avg_rk_penalty: Math.round(avgRkPenalty * 100) / 100,
      potential_deception: potentialDeception,
      deception_flags: highHesitationResponses.map((r) => r.question_id),
      baseline_reaction_ms: Math.round(baselineMs),
      responses_count: responses.length,
    });
  } catch (err) {
    console.error("Swipe checkin error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

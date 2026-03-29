import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/athlete/truth-validation
 * Body: {
 *   athleteId: string,
 *   target: "damage_prediction" | "recovery_rate" | "readiness_score" | "injury_risk",
 *   predictedValue: number,
 *   actualValue: number,
 *   approved: boolean,
 *   predictionDate: string (ISO),
 * }
 *
 * RLHF feedback loop:
 * 1. Store validation record in `ai_validations` table
 * 2. If abs(error) > threshold → flag for recalibration
 * 3. Return recalibration_triggered flag to UI
 */

/** Relative error threshold that triggers model recalibration */
const RECAL_THRESHOLD = 0.15; // 15% relative error

/** Absolute error threshold (for small values) */
const RECAL_ABS_THRESHOLD = 10;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const userRes = await supabase.auth.getUser();
    const user = userRes?.data?.user ?? null;
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      athleteId,
      target,
      predictedValue,
      actualValue,
      approved,
      predictionDate,
    } = body;

    if (!athleteId || !target || predictedValue == null || actualValue == null) {
      return NextResponse.json(
        { error: "athleteId, target, predictedValue, actualValue required" },
        { status: 400 }
      );
    }

    const absError = Math.abs(actualValue - predictedValue);
    const relError =
      Math.abs(predictedValue) > 0.01
        ? absError / Math.abs(predictedValue)
        : absError;

    const recalibrationTriggered =
      !approved &&
      (relError > RECAL_THRESHOLD || absError > RECAL_ABS_THRESHOLD);

    // Store validation record
    const { error: insertError } = await supabase
      .from("ai_validations")
      .insert({
        athlete_id: athleteId,
        validator_user_id: user.id,
        target,
        predicted_value: predictedValue,
        actual_value: actualValue,
        approved,
        abs_error: Math.round(absError * 100) / 100,
        rel_error: Math.round(relError * 10000) / 100, // store as percent
        recalibration_triggered: recalibrationTriggered,
        prediction_date: predictionDate,
      });

    if (insertError) {
      // Table may not exist yet — log but don't fail the UX
      console.error("ai_validations insert error:", insertError.message);
    }

    // If recalibration triggered, update condition cache to flag stale model
    if (recalibrationTriggered) {
      await supabase
        .from("athlete_condition_cache")
        .update({
          model_stale: true,
          updated_at: new Date().toISOString(),
        })
        .eq("athlete_id", athleteId);
    }

    return NextResponse.json({
      success: true,
      approved,
      abs_error: Math.round(absError * 100) / 100,
      rel_error_pct: Math.round(relError * 10000) / 100,
      recalibration_triggered: recalibrationTriggered,
    });
  } catch (err) {
    console.error("Truth validation error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

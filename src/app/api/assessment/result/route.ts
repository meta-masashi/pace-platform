import { NextRequest, NextResponse } from "next/server";
import { mockAssessmentNodes } from "@/lib/mock-data";
import { computeResult, computeSummary } from "@/lib/bayesian-engine";
import { sessionStore } from "@/lib/session-store";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const session_id = searchParams.get("session_id");

    if (!session_id) {
      return NextResponse.json(
        { error: "session_id query parameter is required" },
        { status: 400 }
      );
    }

    const state = sessionStore.get(session_id);
    if (!state) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    // Retrieve nodes cached at session start (real Supabase nodes or mock fallback)
    const cachedNodes = sessionStore.getNodes(session_id);
    const allNodes = cachedNodes ?? mockAssessmentNodes;

    const results = computeResult(state, allNodes);
    const summary = computeSummary(state, allNodes);

    return NextResponse.json({
      session_id,
      athlete_id: state.athleteId,
      staff_id: state.staffId,
      assessment_type: state.assessmentType,
      started_at: state.startedAt,
      completed_at: new Date().toISOString(),
      is_emergency: state.isEmergency,
      // Legacy fields — kept for backward compat
      primary_diagnosis: results[0] ?? null,
      differentials: results.slice(1),
      prescription_tags: summary.allPrescriptionTags,
      contraindication_tags: summary.allContraindicationTags,
      responses: state.responses,
      // New multi-axis summary fields
      results,
      summary,
      interpretation: summary.interpretation,
      riskLevel: summary.riskLevel,
      hasRedFlag: summary.hasRedFlag,
      hasAcuteInjury: summary.hasAcuteInjury,
    });
  } catch (err) {
    console.error("[assessment/result]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

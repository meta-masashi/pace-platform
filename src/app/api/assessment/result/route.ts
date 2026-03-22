import { NextRequest, NextResponse } from "next/server";
import { mockAssessmentNodes } from "@/lib/mock-data";
import { getResults } from "@/lib/bayesian-engine";
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

    const diagnosisResults = getResults(state);
    const primaryDiagnosis = diagnosisResults[0] ?? null;
    const differentials = diagnosisResults.slice(1);

    // Retrieve nodes cached at session start (real Supabase nodes or mock fallback)
    const cachedNodes = sessionStore.getNodes(session_id);
    const allNodes = cachedNodes ?? mockAssessmentNodes;

    // Collect all prescription and contraindication tags from answered nodes
    const prescriptionTags = new Set<string>();
    const contraindicationTags = new Set<string>();

    for (const response of state.responses) {
      const node = allNodes.find((n) => n.node_id === response.node_id);
      if (!node) continue;

      if (response.answer === "yes") {
        node.prescription_tags.forEach((t) => prescriptionTags.add(t));
        node.contraindication_tags.forEach((t) => contraindicationTags.add(t));
      }
    }

    return NextResponse.json({
      session_id,
      athlete_id: state.athleteId,
      staff_id: state.staffId,
      assessment_type: state.assessmentType,
      started_at: state.startedAt,
      completed_at: new Date().toISOString(),
      is_emergency: state.isEmergency,
      primary_diagnosis: primaryDiagnosis,
      differentials,
      prescription_tags: Array.from(prescriptionTags),
      contraindication_tags: Array.from(contraindicationTags),
      responses: state.responses,
    });
  } catch (err) {
    console.error("[assessment/result]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

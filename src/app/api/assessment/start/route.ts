import { NextRequest, NextResponse } from "next/server";
import type { AssessmentType } from "@/types";
import { mockAssessmentNodes } from "@/lib/mock-data";
import {
  initializeSession,
  selectNextNode,
  InferenceState,
} from "@/lib/bayesian-engine";

import { sessionStore } from "@/lib/session-store";

function generateId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { athlete_id, staff_id, assessment_type, injury_region } = body as {
      athlete_id: string;
      staff_id: string;
      assessment_type: AssessmentType;
      injury_region?: string;
    };

    if (!athlete_id || !staff_id || !assessment_type) {
      return NextResponse.json(
        { error: "athlete_id, staff_id, and assessment_type are required" },
        { status: 400 }
      );
    }

    const sessionId = generateId();
    const state = initializeSession(sessionId, athlete_id, staff_id, assessment_type, injury_region ?? "general");

    // Filter nodes to the requested assessment type
    const relevantNodes = mockAssessmentNodes.filter(
      (n) => n.file_type === assessment_type
    );

    const firstQuestion = selectNextNode(state, relevantNodes);

    if (!firstQuestion) {
      return NextResponse.json(
        { error: "No assessment nodes available for the given assessment_type" },
        { status: 422 }
      );
    }

    // Persist initial state (before any answers)
    sessionStore.set(sessionId, state);

    return NextResponse.json({
      session_id: sessionId,
      first_question: firstQuestion,
    });
  } catch (err) {
    console.error("[assessment/start]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import type { AnswerValue } from "@/types";
import { mockAssessmentNodes } from "@/lib/mock-data";
import {
  updatePosterior,
  selectNextNode,
  getResults,
  isSessionComplete,
} from "@/lib/bayesian-engine";
import { sessionStore } from "@/lib/session-store";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { session_id, node_id, answer } = body as {
      session_id: string;
      node_id: string;
      answer: AnswerValue;
    };

    if (!session_id || !node_id || !answer) {
      return NextResponse.json(
        { error: "session_id, node_id, and answer are required" },
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

    if (!["yes", "no", "unclear"].includes(answer)) {
      return NextResponse.json(
        { error: 'answer must be "yes", "no", or "unclear"' },
        { status: 400 }
      );
    }

    // Retrieve nodes cached at session start (real Supabase nodes or mock fallback)
    const cachedNodes = sessionStore.getNodes(session_id);
    const relevantNodes = cachedNodes ?? mockAssessmentNodes.filter(
      (n) => n.file_type === state.assessmentType
    );

    const node = relevantNodes.find((n) => n.node_id === node_id);
    if (!node) {
      return NextResponse.json(
        { error: `Node ${node_id} not found` },
        { status: 404 }
      );
    }

    // Update inference state
    const updatedState = updatePosterior(state, node, answer);
    sessionStore.set(session_id, updatedState);

    const currentResults = getResults(updatedState);
    const complete = isSessionComplete(updatedState);

    // Find next question if not complete
    const nextQuestion = complete
      ? null
      : selectNextNode(updatedState, relevantNodes);

    return NextResponse.json({
      next_question: nextQuestion,
      current_results: currentResults,
      is_complete: complete,
      is_emergency: updatedState.isEmergency,
    });
  } catch (err) {
    console.error("[assessment/answer]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

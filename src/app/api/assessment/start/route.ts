import { NextRequest, NextResponse } from "next/server";
import type { AssessmentType, AssessmentNode } from "@/types";
// import { mockAssessmentNodes } from "@/lib/mock-data"; // removed: no mock fallback
import {
  initializeSession,
  selectNextNode,
} from "@/lib/bayesian-engine";
import { sessionStore } from "@/lib/session-store";
import { createClient } from "@/lib/supabase/server";

function generateId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// Map a raw Supabase row to an AssessmentNode
function rowToAssessmentNode(row: any): AssessmentNode {
  return {
    node_id: row.node_id as string,
    file_type: row.file_type as AssessmentType,
    phase: row.phase as string,
    category: (row.category as string) ?? "",
    question_text: row.question_text as string,
    target_axis: (row.target_axis as string) ?? "lower_body",
    lr_yes: Number(row.lr_yes ?? 1),
    lr_no: Number(row.lr_no ?? 1),
    kappa: Number(row.kappa ?? 0),
    routing_rules: (row.routing_rules as string[]) ?? [],
    prescription_tags: (row.prescription_tags as string[]) ?? [],
    contraindication_tags: (row.contraindication_tags as string[]) ?? [],
    time_decay_lambda: Number(row.time_decay_lambda ?? 0),
    information_gain: undefined,
  };
}

async function fetchNodesFromSupabase(
  assessmentType: AssessmentType
): Promise<AssessmentNode[] | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("assessment_nodes")
      .select(
        "node_id, file_type, phase, category, question_text, target_axis, lr_yes, lr_no, kappa, routing_rules, prescription_tags, contraindication_tags, time_decay_lambda"
      )
      .eq("file_type", assessmentType)
      .order("sort_order", { ascending: true });

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      return null; // signal: table is empty
    }

    return data.map((row: any) => rowToAssessmentNode(row as any));
  } catch (err) {
    console.warn("[assessment/start] Supabase nodes fetch failed:", err);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    // ---- Auth check (High fix: prevent spoofed staff_id) ----
    const supabaseAuth = await createClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    // Enforce that staff_id matches the authenticated user
    if (staff_id !== user.id) {
      return NextResponse.json({ error: "staff_id mismatch" }, { status: 403 });
    }

    // ---- Fetch nodes from Supabase ----
    const relevantNodes = await fetchNodesFromSupabase(assessment_type);

    if (!relevantNodes) {
      console.error(
        "[assessment/start] No nodes found in Supabase for",
        assessment_type
      );
      return NextResponse.json(
        { error: "Assessment nodes not configured. Please contact your administrator." },
        { status: 503 }
      );
    }

    const sessionId = generateId();
    const state = initializeSession(
      sessionId,
      athlete_id,
      staff_id,
      assessment_type,
      injury_region ?? "general"
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
    // Also cache the loaded nodes on the store so answer/result routes can reuse them
    sessionStore.setNodes(sessionId, relevantNodes);

    return NextResponse.json({
      session_id: sessionId,
      first_question: firstQuestion,
    });
  } catch (err) {
    console.error("[assessment/start]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

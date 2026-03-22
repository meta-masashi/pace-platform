import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { athlete_id, subjective, objective, assessment, plan } = body;

    if (!athlete_id) {
      return NextResponse.json(
        { error: "athlete_id is required" },
        { status: 400 }
      );
    }

    const today = new Date().toISOString().split("T")[0];

    const { data, error } = await supabase
      .from("soap_notes")
      .insert({
        athlete_id,
        staff_id: user.id,
        soap_date: today,
        subjective: subjective ?? "",
        objective: objective ?? "",
        assessment: assessment ?? "",
        plan: plan ?? "",
        note_type: "daily",
      })
      .select()
      .single();

    if (error) {
      console.error("[soap-notes POST]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ record: data }, { status: 201 });
  } catch (err) {
    console.error("[soap-notes POST] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

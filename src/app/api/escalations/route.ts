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
    const { athlete_id, severity, reason, recommended_action } = body;

    if (!athlete_id) {
      return NextResponse.json(
        { error: "athlete_id is required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("escalation_records")
      .insert({
        athlete_id,
        from_staff_id: user.id,
        severity: severity ?? "urgent",
        reason: reason ?? "",
        recommended_action: recommended_action ?? "",
      })
      .select()
      .single();

    if (error) {
      console.error("[escalations POST]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ record: data }, { status: 201 });
  } catch (err) {
    console.error("[escalations POST] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

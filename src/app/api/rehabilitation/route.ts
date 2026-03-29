import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// POST /api/rehabilitation
// Creates a new rehab program with approval_status='pending'
// Any authenticated staff can create (AT, PT, S&C, master)
export async function POST(request: NextRequest) {
  try {
    if (
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ) {
      return NextResponse.json(
        { error: "Supabase not configured" },
        { status: 503 }
      );
    }

    const supabase = await createClient();

    // Auth check
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      athlete_id,
      diagnosis_label,
      diagnosis_code,
      doctor_name,
      doctor_institution,
      diagnosis_confirmed_at,
      start_date,
      estimated_rtp_date,
      diagnosis_document_url,
    } = body;

    if (!athlete_id || !diagnosis_label || !doctor_name || !start_date) {
      return NextResponse.json(
        { error: "athlete_id, diagnosis_label, doctor_name, start_date are required" },
        { status: 400 }
      );
    }

    const insertData: any = {
      athlete_id,
      diagnosis_label,
      approval_status: "pending",
      doctor_name,
      current_phase: 1,
      status: "active",
      start_date,
    };

    if (diagnosis_code) insertData.diagnosis_code = diagnosis_code;
    if (doctor_institution) insertData.doctor_institution = doctor_institution;
    if (diagnosis_confirmed_at) insertData.diagnosis_confirmed_at = diagnosis_confirmed_at;
    if (estimated_rtp_date) insertData.estimated_rtp_date = estimated_rtp_date;
    if (diagnosis_document_url) insertData.diagnosis_document_url = diagnosis_document_url;

    const { data, error } = await supabase
      .from("rehab_programs")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error("[rehabilitation POST] Insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ program: data }, { status: 201 });
  } catch (err) {
    console.error("[rehabilitation POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

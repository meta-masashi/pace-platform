import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// POST /api/rehabilitation/approve
// Body: { programId, action: 'approve' | 'reject', rejectionReason?: string }
// Only 'master' role can approve
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

    // Role check: only 'master' can approve
    const { data: staffRow, error: staffError } = await supabase
      .from("staff")
      .select("role")
      .eq("id", user.id)
      .single();

    if (staffError || !staffRow || staffRow.role !== "master") {
      return NextResponse.json(
        { error: "Forbidden: only master role can approve diagnoses" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { programId, action, rejectionReason } = body;

    if (!programId || !action) {
      return NextResponse.json(
        { error: "programId and action are required" },
        { status: 400 }
      );
    }

    if (action !== "approve" && action !== "reject") {
      return NextResponse.json(
        { error: "action must be 'approve' or 'reject'" },
        { status: 400 }
      );
    }

    let updateData: any;

    if (action === "approve") {
      updateData = {
        approval_status: "approved",
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      };
    } else {
      if (!rejectionReason) {
        return NextResponse.json(
          { error: "rejectionReason is required when rejecting" },
          { status: 400 }
        );
      }
      updateData = {
        approval_status: "rejected",
        rejection_reason: rejectionReason,
      };
    }

    const { data, error } = await supabase
      .from("rehab_programs")
      .update(updateData)
      .eq("id", programId)
      .select()
      .single();

    if (error) {
      console.error("[rehabilitation/approve POST] Update error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ program: data }, { status: 200 });
  } catch (err) {
    console.error("[rehabilitation/approve POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

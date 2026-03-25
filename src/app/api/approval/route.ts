import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      athlete_id,
      action,
      approved_menu_json,
      evidence_text_snapshot,
      risk_score,
    } = body;

    if (!athlete_id || !action) {
      return NextResponse.json(
        { error: "athlete_id and action required" },
        { status: 400 }
      );
    }

    if (!["approve", "edit_approve", "reject"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    // Compute data hash for integrity verification
    const payload = JSON.stringify({
      athlete_id,
      action,
      approved_menu_json,
      evidence_text_snapshot,
      risk_score,
      timestamp: new Date().toISOString(),
    });
    const data_hash = crypto
      .createHash("sha256")
      .update(payload)
      .digest("hex");

    // Get staff's org_id
    const { data: staffData } = await supabase
      .from("staff")
      .select("id, organization_id")
      .eq("auth_user_id", user.id)
      .single();

    const orgId = staffData?.organization_id;

    // Insert into WORM audit log (INSERT only — no UPDATE/DELETE allowed by RLS)
    const { data: auditLog, error } = await supabase
      .from("approval_audit_logs")
      .insert({
        staff_id: staffData?.id ?? user.id,
        athlete_id,
        organization_id: orgId,
        action,
        approved_menu_json: approved_menu_json ?? null,
        evidence_text_snapshot: evidence_text_snapshot ?? "",
        nlg_text_snapshot: "",
        risk_score: risk_score ?? 0,
        data_hash,
      })
      .select("id, created_at")
      .single();

    if (error) {
      console.error("Approval audit log insert error:", error);
      return NextResponse.json(
        { error: "Failed to record approval" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      audit_id: auditLog?.id,
      created_at: auditLog?.created_at,
      action,
    });
  } catch (err) {
    console.error("Approval route error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

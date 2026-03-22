import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ============================================================
// PATCH /api/triage/:id
// スタッフがトリアージエントリを「確認済み」にマークする
// Body: { resolved_by_staff_id: string }
// ============================================================
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "triage id is required" },
        { status: 400 }
      );
    }

    // ── Auth check ────────────────────────────────────────────────────────
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    // ── Parse body ────────────────────────────────────────────────────────
    let body: { resolved_by_staff_id?: string } = {};
    try {
      body = await request.json();
    } catch {
      // body is optional — defaults to current authenticated user
    }

    const resolvedByStaffId = body.resolved_by_staff_id ?? user.id;

    // ── Fetch triage entry (RLS ensures org-scoped access) ────────────────
    const { data: entry, error: fetchError } = await supabase
      .from("triage")
      .select("id, resolved_at")
      .eq("id", id)
      .single();

    if (fetchError || !entry) {
      return NextResponse.json(
        { error: "トリアージエントリが見つかりません" },
        { status: 404 }
      );
    }

    if (entry.resolved_at) {
      return NextResponse.json(
        { error: "このエントリはすでに確認済みです", resolved_at: entry.resolved_at },
        { status: 409 }
      );
    }

    // ── Update: mark as resolved ───────────────────────────────────────────
    const resolvedAt = new Date().toISOString();

    const { data: updated, error: updateError } = await supabase
      .from("triage")
      .update({
        resolved_at: resolvedAt,
        resolved_by_staff_id: resolvedByStaffId,
      })
      .eq("id", id)
      .select("id, athlete_id, trigger_type, severity, resolved_at, resolved_by_staff_id")
      .single();

    if (updateError) {
      console.error("[triage/resolve] Update failed:", updateError);
      return NextResponse.json(
        { error: "更新に失敗しました" },
        { status: 500 }
      );
    }

    // ── Audit log ──────────────────────────────────────────────────────────
    const { data: staffRow } = await supabase
      .from("staff")
      .select("org_id")
      .eq("id", user.id)
      .single();

    if (staffRow) {
      await supabase.from("audit_logs").insert({
        org_id: staffRow.org_id,
        staff_id: user.id,
        action: "triage_resolved",
        target_type: "triage",
        target_id: id,
        details: {
          trigger_type: updated?.trigger_type,
          severity: updated?.severity,
          resolved_by_staff_id: resolvedByStaffId,
        },
      });
    }

    return NextResponse.json({
      success: true,
      triage: updated,
    });
  } catch (err) {
    console.error("[triage/resolve]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ============================================================
// GET /api/triage/:id
// 単一トリアージエントリ取得
// ============================================================
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "triage id is required" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("triage")
      .select(
        "id, athlete_id, org_id, trigger_type, severity, metric_value, threshold_value, created_at, resolved_at, resolved_by_staff_id"
      )
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "トリアージエントリが見つかりません" },
        { status: 404 }
      );
    }

    return NextResponse.json({ triage: data });
  } catch (err) {
    console.error("[triage/get]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

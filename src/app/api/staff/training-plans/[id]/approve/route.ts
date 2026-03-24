/**
 * POST /api/staff/training-plans/[id]/approve
 *
 * 週次訓練計画を draft → approved に更新する。
 * master または AT ロールのスタッフのみ実行可能。
 *
 * Phase 6 Sprint 1
 *
 * 認証: スタッフ（master or AT ロールのみ）
 * レスポンス: { plan_id: string, status: 'approved' }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

function getDb() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const ALLOWED_ROLES = ["master", "AT"] as const;
type AllowedRole = (typeof ALLOWED_ROLES)[number];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    // ── スタッフ認証 ──────────────────────────────────────────────────────────
    const supabaseAuth = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getDb();

    const { data: staff, error: staffError } = await db
      .from("staff")
      .select("id, org_id, role")
      .eq("id", user.id)
      .maybeSingle();

    if (staffError || !staff) {
      return NextResponse.json(
        { error: "Staff record not found" },
        { status: 403 }
      );
    }

    // ── ロールチェック（master or AT のみ）────────────────────────────────────
    if (!ALLOWED_ROLES.includes(staff.role as AllowedRole)) {
      return NextResponse.json(
        {
          error: `Forbidden: only ${ALLOWED_ROLES.join(" or ")} role can approve training plans`,
        },
        { status: 403 }
      );
    }

    // ── プランID取得 ──────────────────────────────────────────────────────────
    const { id: planId } = await params;

    if (!planId) {
      return NextResponse.json(
        { error: "Plan ID is required" },
        { status: 400 }
      );
    }

    // ── プラン存在確認 ────────────────────────────────────────────────────────
    const { data: plan, error: fetchError } = await db
      .from("weekly_training_plans")
      .select("id, org_id, status")
      .eq("id", planId)
      .maybeSingle();

    if (fetchError || !plan) {
      return NextResponse.json(
        { error: "Training plan not found" },
        { status: 404 }
      );
    }

    // 同じ組織のプランのみ承認可能
    if (plan.org_id !== staff.org_id) {
      return NextResponse.json(
        { error: "Forbidden: plan belongs to a different organization" },
        { status: 403 }
      );
    }

    // draft 状態のプランのみ承認可能
    if (plan.status !== "draft") {
      return NextResponse.json(
        {
          error: `Cannot approve: plan is already in '${plan.status}' status`,
        },
        { status: 409 }
      );
    }

    // ── status を approved に更新 ─────────────────────────────────────────────
    const { data: updated, error: updateError } = await db
      .from("weekly_training_plans")
      .update({
        status: "approved",
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      })
      .eq("id", planId)
      .select("id, status")
      .single();

    if (updateError || !updated) {
      console.error(
        "[training-plans/approve] DB update error:",
        updateError
      );
      return NextResponse.json(
        { error: "Failed to approve training plan" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      plan_id: updated.id,
      status: "approved",
    });
  } catch (err) {
    console.error("[training-plans/approve] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

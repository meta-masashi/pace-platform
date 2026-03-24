/**
 * GET  /api/billing/claims   — 組織の請求一覧取得（master のみ）
 * POST /api/billing/claims   — 請求レコード作成（draft）
 * PATCH /api/billing/claims  — ステータス更新（submit / approve / reject）
 *
 * P6-030: 請求データ生成 → パートナーAPI送信エンドポイント
 * ADR-031: パートナーAPI は Phase 7 まではモック実装
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

// ---------------------------------------------------------------------------
// モックパートナーAPI送信（Phase 7 で本物に差し替え）
// ---------------------------------------------------------------------------

interface PartnerClaimResponse {
  partner_claim_id: string;
  status: "accepted" | "rejected";
  message: string;
}

async function submitToPartnerApi(claimData: {
  claim_reference_id: string;
  athlete_id: string;
  diagnosis_code: string;
  procedure_codes: unknown[];
  total_points: number;
}): Promise<PartnerClaimResponse> {
  const partnerEndpoint = process.env.BILLING_PARTNER_API_ENDPOINT;

  // Phase 7 以降: 本番パートナーエンドポイントに送信
  if (partnerEndpoint) {
    const res = await fetch(`${partnerEndpoint}/claims`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.BILLING_PARTNER_API_KEY ?? ""}`,
        "X-Idempotency-Key": claimData.claim_reference_id,
      },
      body: JSON.stringify(claimData),
    });
    if (!res.ok) {
      throw new Error(`Partner API error: ${res.status}`);
    }
    return (await res.json()) as PartnerClaimResponse;
  }

  // モック実装（ADR-031: Phase 7 まで）
  console.info("[billing/claims] Using mock partner API (Phase 7 will replace this)");
  return {
    partner_claim_id: `MOCK-${Date.now()}`,
    status: "accepted",
    message: "モック送信完了（本番パートナーAPI未接続）",
  };
}

// ---------------------------------------------------------------------------
// GET: 請求一覧
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest): Promise<NextResponse> {
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const { data: staff } = await db.from("staff").select("id, org_id, role").eq("id", user.id).maybeSingle();
  if (!staff || staff.role !== "master") {
    return NextResponse.json({ error: "master ロールのみアクセス可能です" }, { status: 403 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status");

  let query = db
    .from("billing_claims")
    .select(`
      id, athlete_id, soap_note_id, assessment_id,
      diagnosis_code, diagnosis_label, procedure_codes,
      total_points, claim_amount_yen,
      status, claim_reference_id, partner_claim_id,
      submitted_at, reviewed_at, rejection_reason,
      ai_extracted, notes, created_at,
      athletes(name, position)
    `)
    .eq("org_id", staff.org_id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ claims: data ?? [] });
}

// ---------------------------------------------------------------------------
// POST: 請求レコード作成
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const supabaseAuth = await createClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const db = getDb();
    const { data: staff } = await db.from("staff").select("id, org_id, role").eq("id", user.id).maybeSingle();
    if (!staff || staff.role !== "master") {
      return NextResponse.json({ error: "master ロールのみ請求作成できます" }, { status: 403 });
    }

    let body: {
      athlete_id?: string;
      soap_note_id?: string;
      assessment_id?: string;
      diagnosis_code?: string;
      diagnosis_label?: string;
      procedure_codes?: unknown[];
      total_points?: number;
      notes?: string;
      ai_extracted?: boolean;
    };
    try { body = await req.json(); } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body.athlete_id || !body.diagnosis_code) {
      return NextResponse.json({ error: "athlete_id and diagnosis_code are required" }, { status: 400 });
    }

    // 同組織チェック
    const { data: athlete } = await db.from("athletes").select("id").eq("id", body.athlete_id).eq("org_id", staff.org_id).maybeSingle();
    if (!athlete) return NextResponse.json({ error: "Athlete not found" }, { status: 404 });

    const { data: claim, error: insertError } = await db
      .from("billing_claims")
      .insert({
        org_id: staff.org_id,
        athlete_id: body.athlete_id,
        staff_id: staff.id,
        soap_note_id: body.soap_note_id ?? null,
        assessment_id: body.assessment_id ?? null,
        diagnosis_code: body.diagnosis_code,
        diagnosis_label: body.diagnosis_label ?? null,
        procedure_codes: body.procedure_codes ?? [],
        total_points: body.total_points ?? 0,
        notes: body.notes?.trim() ?? null,
        ai_extracted: body.ai_extracted ?? false,
        status: "draft",
      })
      .select("id, claim_reference_id")
      .single();

    if (insertError || !claim) {
      return NextResponse.json({ error: "Failed to create billing claim" }, { status: 500 });
    }

    return NextResponse.json({ claim_id: claim.id, claim_reference_id: claim.claim_reference_id }, { status: 201 });
  } catch (err) {
    console.error("[billing/claims POST] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// PATCH: ステータス更新（submit / approve / reject）
// ---------------------------------------------------------------------------

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  try {
    const supabaseAuth = await createClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const db = getDb();
    const { data: staff } = await db.from("staff").select("id, org_id, role").eq("id", user.id).maybeSingle();
    if (!staff || staff.role !== "master") {
      return NextResponse.json({ error: "master ロールのみ請求操作できます" }, { status: 403 });
    }

    let body: { claim_id?: string; action?: "submit" | "approve" | "reject"; rejection_reason?: string };
    try { body = await req.json(); } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { claim_id, action, rejection_reason } = body;
    if (!claim_id || !action) {
      return NextResponse.json({ error: "claim_id and action are required" }, { status: 400 });
    }

    // 請求レコード取得
    const { data: claim } = await db
      .from("billing_claims")
      .select("id, status, claim_reference_id, athlete_id, diagnosis_code, procedure_codes, total_points")
      .eq("id", claim_id)
      .eq("org_id", staff.org_id)
      .maybeSingle();

    if (!claim) return NextResponse.json({ error: "Claim not found" }, { status: 404 });

    let updatePayload: Record<string, unknown> = {};
    let partnerResponse: PartnerClaimResponse | undefined;

    if (action === "submit") {
      if (!["draft", "pending_review"].includes(claim.status)) {
        return NextResponse.json({ error: "送信できる状態ではありません" }, { status: 409 });
      }

      // パートナーAPI送信（P6-030）
      try {
        partnerResponse = await submitToPartnerApi({
          claim_reference_id: claim.claim_reference_id,
          athlete_id: claim.athlete_id,
          diagnosis_code: claim.diagnosis_code,
          procedure_codes: claim.procedure_codes ?? [],
          total_points: claim.total_points ?? 0,
        });
      } catch (err) {
        console.error("[billing/claims PATCH] Partner API error:", err);
        return NextResponse.json({ error: "請求送信に失敗しました" }, { status: 502 });
      }

      updatePayload = {
        status: "submitted",
        submitted_at: new Date().toISOString(),
        partner_claim_id: partnerResponse.partner_claim_id,
        partner_response: partnerResponse,
      };
    } else if (action === "approve") {
      if (claim.status !== "submitted") {
        return NextResponse.json({ error: "送信済み請求のみ承認できます" }, { status: 409 });
      }
      updatePayload = {
        status: "paid",
        reviewed_by: staff.id,
        reviewed_at: new Date().toISOString(),
      };
    } else if (action === "reject") {
      updatePayload = {
        status: "rejected",
        reviewed_by: staff.id,
        reviewed_at: new Date().toISOString(),
        rejection_reason: rejection_reason?.trim() ?? "理由未記入",
      };
    }

    const { error: updateError } = await db
      .from("billing_claims")
      .update(updatePayload)
      .eq("id", claim_id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      action,
      partner_response: partnerResponse ?? null,
    });
  } catch (err) {
    console.error("[billing/claims PATCH] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

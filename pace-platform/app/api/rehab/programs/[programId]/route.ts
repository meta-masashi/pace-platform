/**
 * PACE Platform — リハビリプログラム詳細・更新 API
 *
 * GET   /api/rehab/programs/:programId — プログラム詳細（ゲート・エクササイズ含む）
 * PATCH /api/rehab/programs/:programId — プログラム更新（フェーズ進行・ステータス変更）
 *
 * フェーズ進行時はゲート基準の充足を検証する。
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withApiHandler, ApiError } from "@/lib/api/handler";
import { validateUUID } from "@/lib/security/input-validator";
import { logAuditEvent } from "@/lib/security/audit-logger";

// ---------------------------------------------------------------------------
// GET /api/rehab/programs/:programId
// ---------------------------------------------------------------------------

/**
 * リハビリプログラム詳細を取得する。
 * フェーズゲート情報とエクササイズ一覧を含む。
 */
export const GET = withApiHandler(async (_req, ctx) => {
  const programId = ctx.params.programId ?? '';

  // ----- UUID バリデーション -----
  if (!validateUUID(programId)) {
    throw new ApiError(400, "プログラムIDの形式が不正です。");
  }

  const supabase = await createClient();

  // ----- 認証チェック -----
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new ApiError(401, "認証が必要です。ログインしてください。");
  }

  // ----- プログラム取得 -----
  const { data: program, error: programError } = await supabase
    .from("rehab_programs")
    .select(`
      id,
      athlete_id,
      org_id,
      diagnosis_code,
      current_phase,
      start_date,
      estimated_rtp_date,
      status,
      created_at,
      updated_at,
      athletes ( id, name, position, number, sport )
    `)
    .eq("id", programId)
    .single();

  if (programError || !program) {
    throw new ApiError(404, "プログラムが見つからないか、アクセス権がありません。");
  }

  // ----- フェーズゲート取得 -----
  const { data: gates } = await supabase
    .from("rehab_phase_gates")
    .select(`
      id,
      phase,
      gate_criteria_json,
      gate_met_at,
      verified_by_staff_id,
      staff:verified_by_staff_id ( name )
    `)
    .eq("program_id", programId)
    .order("phase", { ascending: true });

  // ----- 現在フェーズのエクササイズ取得 -----
  const { data: exercises } = await supabase
    .from("exercises")
    .select("*")
    .eq("phase", program.current_phase)
    .order("category", { ascending: true });

  // ----- ロック状態取得 -----
  const { data: locks } = await supabase
    .from("athlete_locks")
    .select("id, lock_type, tag, reason, set_at, expires_at")
    .eq("athlete_id", program.athlete_id)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);

  // ----- ワークアウト（生成済みメニュー）取得 -----
  const { data: workouts } = await supabase
    .from("workouts")
    .select("id, menu_json, generated_at, approved_at, distributed_at")
    .eq("athlete_id", program.athlete_id)
    .eq("generated_by_ai", true)
    .order("generated_at", { ascending: false })
    .limit(5);

  return NextResponse.json({
    success: true,
    data: {
      program,
      gates: gates ?? [],
      exercises: exercises ?? [],
      locks: locks ?? [],
      workouts: workouts ?? [],
    },
  });
}, { service: 'rehab' });

// ---------------------------------------------------------------------------
// PATCH /api/rehab/programs/:programId
// ---------------------------------------------------------------------------

/**
 * リハビリプログラムを更新する。
 * フェーズ進行時は対象フェーズのゲート充足を検証する。
 *
 * Body: { action: 'advance_phase' | 'update_status', status?: string }
 */
export const PATCH = withApiHandler(async (req, ctx) => {
  const programId = ctx.params.programId ?? '';

  // ----- UUID バリデーション -----
  if (!validateUUID(programId)) {
    throw new ApiError(400, "プログラムIDの形式が不正です。");
  }

  const supabase = await createClient();

  // ----- 認証チェック -----
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new ApiError(401, "認証が必要です。ログインしてください。");
  }

  // ----- スタッフ権限確認 -----
  const { data: staff, error: staffError } = await supabase
    .from("staff")
    .select("id, org_id, role, is_leader")
    .eq("id", user.id)
    .single();

  if (staffError || !staff) {
    throw new ApiError(403, "スタッフプロファイルが見つかりません。");
  }

  // ----- リクエストボディ -----
  let body: { action: string; status?: string };
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, "リクエストボディのJSONパースに失敗しました。");
  }

  // ----- プログラム取得 -----
  const { data: program, error: programError } = await supabase
    .from("rehab_programs")
    .select("id, athlete_id, org_id, current_phase, status")
    .eq("id", programId)
    .eq("org_id", staff.org_id)
    .single();

  if (programError || !program) {
    throw new ApiError(404, "プログラムが見つからないか、アクセス権がありません。");
  }

  // ----- アクション分岐 -----
  if (body.action === "advance_phase") {
    const currentPhase = program.current_phase as number;

    if (currentPhase >= 4) {
      throw new ApiError(400, "すでに最終フェーズです。ゲート通過確認で RTP を完了してください。");
    }

    // 現在フェーズのゲート充足を確認
    const { data: gate } = await supabase
      .from("rehab_phase_gates")
      .select("id, gate_met_at")
      .eq("program_id", programId)
      .eq("phase", currentPhase)
      .single();

    if (!gate?.gate_met_at) {
      throw new ApiError(
        400,
        `フェーズ${currentPhase}のゲート基準が未充足です。ゲート通過確認を先に行ってください。`
      );
    }

    // フェーズ進行
    const nextPhase = currentPhase + 1;
    const { error: updateError } = await supabase
      .from("rehab_programs")
      .update({ current_phase: nextPhase })
      .eq("id", programId);

    if (updateError) {
      ctx.log.error("フェーズ進行エラー", { detail: updateError });
      throw new ApiError(500, "フェーズの進行に失敗しました。");
    }

    // 監査ログ
    await logAuditEvent(supabase, {
      action: 'rehab_phase_advance',
      targetType: 'rehab_program',
      targetId: programId,
      details: {
        from_phase: currentPhase,
        to_phase: nextPhase,
        athlete_id: program.athlete_id,
      },
    });

    return NextResponse.json({
      success: true,
      data: { programId, previousPhase: currentPhase, currentPhase: nextPhase },
    });
  }

  if (body.action === "update_status") {
    if (!body.status || !["active", "completed", "on_hold"].includes(body.status)) {
      throw new ApiError(400, "有効なステータス（active, completed, on_hold）を指定してください。");
    }

    const { error: updateError } = await supabase
      .from("rehab_programs")
      .update({ status: body.status })
      .eq("id", programId);

    if (updateError) {
      ctx.log.error("ステータス更新エラー", { detail: updateError });
      throw new ApiError(500, "ステータスの更新に失敗しました。");
    }

    // 監査ログ
    await logAuditEvent(supabase, {
      action: 'rehab_status_update',
      targetType: 'rehab_program',
      targetId: programId,
      details: {
        new_status: body.status,
        athlete_id: program.athlete_id,
      },
    });

    return NextResponse.json({
      success: true,
      data: { programId, status: body.status },
    });
  }

  throw new ApiError(400, "不明なアクションです。advance_phase または update_status を指定してください。");
}, { service: 'rehab' });

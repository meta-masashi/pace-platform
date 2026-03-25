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

// ---------------------------------------------------------------------------
// GET /api/rehab/programs/:programId
// ---------------------------------------------------------------------------

/**
 * リハビリプログラム詳細を取得する。
 * フェーズゲート情報とエクササイズ一覧を含む。
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ programId: string }> }
) {
  try {
    const { programId } = await params;
    const supabase = await createClient();

    // ----- 認証チェック -----
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "認証が必要です。ログインしてください。" },
        { status: 401 }
      );
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
      return NextResponse.json(
        { success: false, error: "プログラムが見つからないか、アクセス権がありません。" },
        { status: 404 }
      );
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
  } catch (err) {
    console.error("[rehab:programs:GET] 予期しないエラー:", err);
    return NextResponse.json(
      { success: false, error: "サーバー内部エラーが発生しました。" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/rehab/programs/:programId
// ---------------------------------------------------------------------------

/**
 * リハビリプログラムを更新する。
 * フェーズ進行時は対象フェーズのゲート充足を検証する。
 *
 * Body: { action: 'advance_phase' | 'update_status', status?: string }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ programId: string }> }
) {
  try {
    const { programId } = await params;
    const supabase = await createClient();

    // ----- 認証チェック -----
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "認証が必要です。ログインしてください。" },
        { status: 401 }
      );
    }

    // ----- スタッフ権限確認 -----
    const { data: staff, error: staffError } = await supabase
      .from("staff")
      .select("id, org_id, role, is_leader")
      .eq("id", user.id)
      .single();

    if (staffError || !staff) {
      return NextResponse.json(
        { success: false, error: "スタッフプロファイルが見つかりません。" },
        { status: 403 }
      );
    }

    // ----- リクエストボディ -----
    let body: { action: string; status?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "リクエストボディのJSONパースに失敗しました。" },
        { status: 400 }
      );
    }

    // ----- プログラム取得 -----
    const { data: program, error: programError } = await supabase
      .from("rehab_programs")
      .select("id, athlete_id, org_id, current_phase, status")
      .eq("id", programId)
      .eq("org_id", staff.org_id)
      .single();

    if (programError || !program) {
      return NextResponse.json(
        { success: false, error: "プログラムが見つからないか、アクセス権がありません。" },
        { status: 404 }
      );
    }

    // ----- アクション分岐 -----
    if (body.action === "advance_phase") {
      const currentPhase = program.current_phase as number;

      if (currentPhase >= 4) {
        return NextResponse.json(
          { success: false, error: "すでに最終フェーズです。ゲート通過確認で RTP を完了してください。" },
          { status: 400 }
        );
      }

      // 現在フェーズのゲート充足を確認
      const { data: gate } = await supabase
        .from("rehab_phase_gates")
        .select("id, gate_met_at")
        .eq("program_id", programId)
        .eq("phase", currentPhase)
        .single();

      if (!gate?.gate_met_at) {
        return NextResponse.json(
          {
            success: false,
            error: `フェーズ${currentPhase}のゲート基準が未充足です。ゲート通過確認を先に行ってください。`,
          },
          { status: 400 }
        );
      }

      // フェーズ進行
      const nextPhase = currentPhase + 1;
      const { error: updateError } = await supabase
        .from("rehab_programs")
        .update({ current_phase: nextPhase })
        .eq("id", programId);

      if (updateError) {
        console.error("[rehab:programs:PATCH] フェーズ進行エラー:", updateError);
        return NextResponse.json(
          { success: false, error: "フェーズの進行に失敗しました。" },
          { status: 500 }
        );
      }

      // 監査ログ
      await supabase
        .from("audit_logs")
        .insert({
          user_id: user.id,
          action: "rehab_phase_advance",
          resource_type: "rehab_program",
          resource_id: programId,
          details: {
            from_phase: currentPhase,
            to_phase: nextPhase,
            athlete_id: program.athlete_id,
          },
        })
        .then(({ error }) => {
          if (error) console.warn("[rehab:programs:PATCH] 監査ログ記録失敗:", error);
        });

      return NextResponse.json({
        success: true,
        data: { programId, previousPhase: currentPhase, currentPhase: nextPhase },
      });
    }

    if (body.action === "update_status") {
      if (!body.status || !["active", "completed", "on_hold"].includes(body.status)) {
        return NextResponse.json(
          { success: false, error: "有効なステータス（active, completed, on_hold）を指定してください。" },
          { status: 400 }
        );
      }

      const { error: updateError } = await supabase
        .from("rehab_programs")
        .update({ status: body.status })
        .eq("id", programId);

      if (updateError) {
        console.error("[rehab:programs:PATCH] ステータス更新エラー:", updateError);
        return NextResponse.json(
          { success: false, error: "ステータスの更新に失敗しました。" },
          { status: 500 }
        );
      }

      // 監査ログ
      await supabase
        .from("audit_logs")
        .insert({
          user_id: user.id,
          action: "rehab_status_update",
          resource_type: "rehab_program",
          resource_id: programId,
          details: {
            new_status: body.status,
            athlete_id: program.athlete_id,
          },
        })
        .then(({ error }) => {
          if (error) console.warn("[rehab:programs:PATCH] 監査ログ記録失敗:", error);
        });

      return NextResponse.json({
        success: true,
        data: { programId, status: body.status },
      });
    }

    return NextResponse.json(
      { success: false, error: "不明なアクションです。advance_phase または update_status を指定してください。" },
      { status: 400 }
    );
  } catch (err) {
    console.error("[rehab:programs:PATCH] 予期しないエラー:", err);
    return NextResponse.json(
      { success: false, error: "サーバー内部エラーが発生しました。" },
      { status: 500 }
    );
  }
}

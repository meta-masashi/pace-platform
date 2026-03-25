/**
 * PACE Platform — リハビリゲート通過確認 API
 *
 * POST /api/rehab/programs/:programId/gate
 *
 * フェーズゲートの通過を確認・記録する。
 * Leader フラグまたは master ロールが必要。
 * フェーズ4のゲート通過時はプログラムを完了（RTP クリアランス）とする。
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface GateVerifyBody {
  phase: number;
  verified: boolean;
}

// ---------------------------------------------------------------------------
// POST /api/rehab/programs/:programId/gate
// ---------------------------------------------------------------------------

/**
 * フェーズゲート通過を確認する。
 *
 * 権限: AT Leader, PT Leader, または master のみ
 *
 * フェーズ4ゲート通過時:
 *   - プログラムステータスを 'completed' に更新
 *   - RTP クリアランスとして記録
 */
export async function POST(
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

    // ----- スタッフ権限確認（Leader または master） -----
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

    const isMaster = (staff.role as string) === "master";
    const isLeader = staff.is_leader as boolean;
    const isATorPT = ["AT", "PT"].includes(staff.role as string);

    if (!isMaster && !(isLeader && isATorPT)) {
      return NextResponse.json(
        {
          success: false,
          error: "ゲート通過確認にはAT Leader、PT Leader、またはmaster権限が必要です。",
        },
        { status: 403 }
      );
    }

    // ----- リクエストボディ -----
    let body: GateVerifyBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "リクエストボディのJSONパースに失敗しました。" },
        { status: 400 }
      );
    }

    if (typeof body.phase !== "number" || body.phase < 1 || body.phase > 4) {
      return NextResponse.json(
        { success: false, error: "phase は 1〜4 の整数で指定してください。" },
        { status: 400 }
      );
    }

    if (body.verified !== true) {
      return NextResponse.json(
        { success: false, error: "verified は true を指定してください。" },
        { status: 400 }
      );
    }

    // ----- プログラム確認 -----
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

    if ((program.status as string) === "completed") {
      return NextResponse.json(
        { success: false, error: "すでに完了したプログラムです。" },
        { status: 400 }
      );
    }

    // ----- ゲート更新 -----
    const { data: gate, error: gateError } = await supabase
      .from("rehab_phase_gates")
      .update({
        gate_met_at: new Date().toISOString(),
        verified_by_staff_id: staff.id,
      })
      .eq("program_id", programId)
      .eq("phase", body.phase)
      .select("id, phase, gate_met_at")
      .single();

    if (gateError || !gate) {
      console.error("[rehab:gate:POST] ゲート更新エラー:", gateError);
      return NextResponse.json(
        { success: false, error: "ゲートの更新に失敗しました。" },
        { status: 500 }
      );
    }

    // ----- フェーズ4ゲート通過 → RTP 完了 -----
    let rtpCompleted = false;
    if (body.phase === 4) {
      const { error: completeError } = await supabase
        .from("rehab_programs")
        .update({ status: "completed" })
        .eq("id", programId);

      if (completeError) {
        console.error("[rehab:gate:POST] RTP 完了エラー:", completeError);
      } else {
        rtpCompleted = true;
      }
    }

    // ----- 監査ログ -----
    await supabase
      .from("audit_logs")
      .insert({
        user_id: user.id,
        action: rtpCompleted ? "rehab_rtp_clearance" : "rehab_gate_verify",
        resource_type: "rehab_phase_gate",
        resource_id: gate.id as string,
        details: {
          program_id: programId,
          phase: body.phase,
          athlete_id: program.athlete_id,
          verified_by: staff.id,
          rtp_completed: rtpCompleted,
        },
      })
      .then(({ error }) => {
        if (error) console.warn("[rehab:gate:POST] 監査ログ記録失敗:", error);
      });

    return NextResponse.json({
      success: true,
      data: {
        gateId: gate.id,
        phase: body.phase,
        gateMetAt: gate.gate_met_at,
        rtpCompleted,
      },
    });
  } catch (err) {
    console.error("[rehab:gate:POST] 予期しないエラー:", err);
    return NextResponse.json(
      { success: false, error: "サーバー内部エラーが発生しました。" },
      { status: 500 }
    );
  }
}

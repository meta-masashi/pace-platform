/**
 * PACE Platform — リハビリプログラム一覧・作成 API
 *
 * GET  /api/rehab/programs?athleteId=xxx  — プログラム一覧取得
 * POST /api/rehab/programs              — 新規プログラム作成
 *
 * POST では rtp_injury_nodes から該当する診断コードのゲート基準を取得し、
 * rehab_phase_gates を自動生成する。
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withApiHandler, ApiError } from "@/lib/api/handler";
import { validateUUID } from "@/lib/security/input-validator";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface CreateProgramBody {
  athleteId: string;
  diagnosisCode: string;
  estimatedRtpDate?: string;
}

// ---------------------------------------------------------------------------
// GET /api/rehab/programs
// ---------------------------------------------------------------------------

/**
 * リハビリプログラム一覧を取得する。
 * クエリパラメータ athleteId が指定された場合はそのアスリートのプログラムのみ返す。
 */
export const GET = withApiHandler(async (req, ctx) => {
  const supabase = await createClient();

  // ----- 認証チェック -----
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new ApiError(401, "認証が必要です。ログインしてください。");
  }

  // ----- スタッフ確認 -----
  const { data: staff, error: staffError } = await supabase
    .from("staff")
    .select("id, org_id, role")
    .eq("id", user.id)
    .single();

  if (staffError || !staff) {
    throw new ApiError(403, "スタッフプロファイルが見つかりません。");
  }

  // ----- クエリパラメータ -----
  const { searchParams } = new URL(req.url);
  const athleteId = searchParams.get("athleteId");
  const statusFilter = searchParams.get("status"); // active, completed, on_hold

  // UUID 形式バリデーション
  if (athleteId && !validateUUID(athleteId)) {
    throw new ApiError(400, "athleteId の形式が不正です。");
  }

  // ----- プログラム取得 -----
  let query = supabase
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
      athletes!inner ( id, name, position, number )
    `)
    .eq("org_id", staff.org_id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (athleteId) {
    query = query.eq("athlete_id", athleteId);
  }

  if (statusFilter && ["active", "completed", "on_hold"].includes(statusFilter)) {
    query = query.eq("status", statusFilter);
  }

  const { data: programs, error: programsError } = await query;

  if (programsError) {
    ctx.log.error("クエリエラー", { detail: programsError });
    throw new ApiError(500, "プログラム一覧の取得に失敗しました。");
  }

  return NextResponse.json({ success: true, data: programs ?? [] });
}, { service: 'rehab' });

// ---------------------------------------------------------------------------
// POST /api/rehab/programs
// ---------------------------------------------------------------------------

/**
 * 新規リハビリプログラムを作成する。
 * rtp_injury_nodes から該当する傷害タイプのフェーズゲート基準を取得し、
 * rehab_phase_gates を自動生成する。
 *
 * 権限: AT, PT, master のみ
 */
export const POST = withApiHandler(async (req, ctx) => {
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

  const allowedRoles = ["AT", "PT", "master"];
  if (!allowedRoles.includes(staff.role as string)) {
    throw new ApiError(403, "プログラム作成にはAT、PT、またはmaster権限が必要です。");
  }

  // ----- リクエストボディ -----
  let body: CreateProgramBody;
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, "リクエストボディのJSONパースに失敗しました。");
  }

  if (!body.athleteId || !body.diagnosisCode) {
    throw new ApiError(400, "athleteId と diagnosisCode は必須です。");
  }

  // ----- アスリート存在確認 -----
  const { data: athlete, error: athleteError } = await supabase
    .from("athletes")
    .select("id, org_id")
    .eq("id", body.athleteId)
    .eq("org_id", staff.org_id)
    .single();

  if (athleteError || !athlete) {
    throw new ApiError(404, "指定されたアスリートが見つからないか、アクセス権がありません。");
  }

  // ----- rtp_injury_nodes から該当する傷害タイプのゲート基準を取得 -----
  const { data: rtpNodes } = await supabase
    .from("rtp_injury_nodes")
    .select("node_id, injury_type, phase, gate_criteria_json, lsi_target, test_battery_json")
    .eq("injury_type", body.diagnosisCode)
    .order("phase", { ascending: true });

  // ----- プログラム作成 -----
  const { data: program, error: programError } = await supabase
    .from("rehab_programs")
    .insert({
      athlete_id: body.athleteId,
      org_id: staff.org_id,
      diagnosis_code: body.diagnosisCode,
      current_phase: 1,
      start_date: new Date().toISOString().split("T")[0],
      estimated_rtp_date: body.estimatedRtpDate ?? null,
      status: "active",
    })
    .select("id")
    .single();

  if (programError || !program) {
    ctx.log.error("プログラム作成エラー", { detail: programError });
    throw new ApiError(500, "プログラムの作成に失敗しました。");
  }

  // ----- フェーズゲートの自動生成（1〜4） -----
  const gates = [];
  for (let phase = 1; phase <= 4; phase++) {
    const matchingNode = (rtpNodes ?? []).find(
      (n) => (n.phase as number) === phase
    );
    gates.push({
      program_id: program.id,
      org_id: staff.org_id,
      phase,
      gate_criteria_json: matchingNode?.gate_criteria_json ?? {
        criteria: [`フェーズ${phase}のゲート基準（未定義）`],
      },
    });
  }

  const { error: gatesError } = await supabase
    .from("rehab_phase_gates")
    .insert(gates);

  if (gatesError) {
    ctx.log.error("ゲート作成エラー", { detail: gatesError });
    // プログラムは作成済みなのでエラーはログのみ
  }

  // ----- 監査ログ -----
  await supabase
    .from("audit_logs")
    .insert({
      user_id: user.id,
      action: "rehab_program_create",
      resource_type: "rehab_program",
      resource_id: program.id as string,
      details: {
        athlete_id: body.athleteId,
        diagnosis_code: body.diagnosisCode,
        gates_created: gates.length,
        rtp_nodes_matched: (rtpNodes ?? []).length,
      },
    })
    .then(({ error }) => {
      if (error) ctx.log.warn("監査ログ記録失敗", { detail: error });
    });

  return NextResponse.json(
    {
      success: true,
      data: {
        programId: program.id,
        gatesCreated: gates.length,
      },
    },
    { status: 201 }
  );
}, { service: 'rehab' });

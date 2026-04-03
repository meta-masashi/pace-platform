/**
 * PACE Platform — チーム管理 API（master 限定）
 *
 * GET   /api/admin/teams         — チーム一覧（所属スタッフ数・選手数付き）
 * POST  /api/admin/teams         — チーム作成
 * PATCH /api/admin/teams         — チーム更新
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withApiHandler, ApiError } from "@/lib/api/handler";

// ---------------------------------------------------------------------------
// 共通: master 権限チェック
// ---------------------------------------------------------------------------
async function requireMaster(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "認証が必要です。ログインしてください。", status: 401 } as const;
  }

  const { data: staff, error: staffError } = await supabase
    .from("staff")
    .select("id, org_id, role")
    .eq("id", user.id)
    .single();

  if (staffError || !staff) {
    return { error: "スタッフプロファイルが見つかりません。", status: 403 } as const;
  }

  if (staff.role !== "master") {
    return { error: "この操作には master 権限が必要です。", status: 403 } as const;
  }

  return { user, staff } as const;
}

// ---------------------------------------------------------------------------
// GET /api/admin/teams
// ---------------------------------------------------------------------------
export const GET = withApiHandler(async (_req, ctx) => {
  const supabase = await createClient();
  const result = await requireMaster(supabase);
  if ("error" in result) {
    throw new ApiError(result.status as number, result.error);
  }
  const { staff } = result;

  // チーム一覧取得
  const { data: teams, error: teamsError } = await supabase
    .from("teams")
    .select("id, name, created_at, updated_at")
    .eq("org_id", staff.org_id)
    .order("created_at", { ascending: true });

  if (teamsError) {
    ctx.log.error("クエリエラー", { detail: teamsError });
    throw new ApiError(500, "チーム一覧の取得に失敗しました。");
  }

  // 各チームのスタッフ数・選手数を取得
  const teamIds = (teams ?? []).map((t) => t.id);

  const [staffCounts, athleteCounts] = await Promise.all([
    supabase
      .from("staff")
      .select("team_id")
      .eq("org_id", staff.org_id)
      .in("team_id", teamIds.length > 0 ? teamIds : ["__none__"]),
    supabase
      .from("athletes")
      .select("team_id")
      .eq("org_id", staff.org_id)
      .in("team_id", teamIds.length > 0 ? teamIds : ["__none__"]),
  ]);

  const staffCountMap: Record<string, number> = {};
  const athleteCountMap: Record<string, number> = {};

  (staffCounts.data ?? []).forEach((s) => {
    if (s.team_id) {
      staffCountMap[s.team_id] = (staffCountMap[s.team_id] ?? 0) + 1;
    }
  });

  (athleteCounts.data ?? []).forEach((a) => {
    if (a.team_id) {
      athleteCountMap[a.team_id] = (athleteCountMap[a.team_id] ?? 0) + 1;
    }
  });

  const teamsWithCounts = (teams ?? []).map((t) => ({
    ...t,
    staff_count: staffCountMap[t.id] ?? 0,
    athlete_count: athleteCountMap[t.id] ?? 0,
  }));

  return NextResponse.json({ success: true, data: teamsWithCounts });
}, { service: 'admin' });

// ---------------------------------------------------------------------------
// POST /api/admin/teams — チーム作成
// ---------------------------------------------------------------------------
export const POST = withApiHandler(async (req, ctx) => {
  const supabase = await createClient();
  const result = await requireMaster(supabase);
  if ("error" in result) {
    throw new ApiError(result.status as number, result.error);
  }
  const { staff } = result;

  let body: { name: string };
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, "リクエストボディのJSONパースに失敗しました。");
  }

  if (!body.name || body.name.trim().length === 0) {
    throw new ApiError(400, "チーム名は必須です。");
  }

  const { data: team, error: insertError } = await supabase
    .from("teams")
    .insert({
      org_id: staff.org_id,
      name: body.name.trim(),
    })
    .select("id, name, created_at")
    .single();

  if (insertError) {
    ctx.log.error("作成エラー", { detail: insertError });
    throw new ApiError(500, "チームの作成に失敗しました。");
  }

  return NextResponse.json(
    { success: true, data: { ...team, staff_count: 0, athlete_count: 0 } },
    { status: 201 }
  );
}, { service: 'admin' });

// ---------------------------------------------------------------------------
// PATCH /api/admin/teams — チーム更新
// ---------------------------------------------------------------------------
export const PATCH = withApiHandler(async (req, ctx) => {
  const supabase = await createClient();
  const result = await requireMaster(supabase);
  if ("error" in result) {
    throw new ApiError(result.status as number, result.error);
  }
  const { staff } = result;

  let body: { teamId: string; name?: string };
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, "リクエストボディのJSONパースに失敗しました。");
  }

  if (!body.teamId) {
    throw new ApiError(400, "teamId は必須です。");
  }

  const updateFields: Record<string, unknown> = {};
  if (body.name !== undefined) updateFields.name = body.name.trim();

  if (Object.keys(updateFields).length === 0) {
    throw new ApiError(400, "更新するフィールドが指定されていません。");
  }

  const { data: updated, error: updateError } = await supabase
    .from("teams")
    .update(updateFields)
    .eq("id", body.teamId)
    .eq("org_id", staff.org_id)
    .select("id, name, updated_at")
    .single();

  if (updateError) {
    ctx.log.error("更新エラー", { detail: updateError });
    throw new ApiError(500, "チーム情報の更新に失敗しました。");
  }

  return NextResponse.json({ success: true, data: updated });
}, { service: 'admin' });

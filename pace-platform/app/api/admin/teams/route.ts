/**
 * PACE Platform — チーム管理 API（master 限定）
 *
 * GET   /api/admin/teams         — チーム一覧（所属スタッフ数・選手数付き）
 * POST  /api/admin/teams         — チーム作成
 * PATCH /api/admin/teams         — チーム更新
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
export async function GET() {
  try {
    const supabase = await createClient();
    const result = await requireMaster(supabase);
    if ("error" in result) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status as number });
    }
    const { staff } = result;

    // チーム一覧取得
    const { data: teams, error: teamsError } = await supabase
      .from("teams")
      .select("id, name, created_at, updated_at")
      .eq("org_id", staff.org_id)
      .order("created_at", { ascending: true });

    if (teamsError) {
      console.error("[admin/teams:GET] クエリエラー:", teamsError);
      return NextResponse.json(
        { success: false, error: "チーム一覧の取得に失敗しました。" },
        { status: 500 }
      );
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
  } catch (err) {
    console.error("[admin/teams:GET] 予期しないエラー:", err);
    return NextResponse.json(
      { success: false, error: "サーバー内部エラーが発生しました。" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/admin/teams — チーム作成
// ---------------------------------------------------------------------------
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const result = await requireMaster(supabase);
    if ("error" in result) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status as number });
    }
    const { staff } = result;

    let body: { name: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "リクエストボディのJSONパースに失敗しました。" },
        { status: 400 }
      );
    }

    if (!body.name || body.name.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "チーム名は必須です。" },
        { status: 400 }
      );
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
      console.error("[admin/teams:POST] 作成エラー:", insertError);
      return NextResponse.json(
        { success: false, error: "チームの作成に失敗しました。" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, data: { ...team, staff_count: 0, athlete_count: 0 } },
      { status: 201 }
    );
  } catch (err) {
    console.error("[admin/teams:POST] 予期しないエラー:", err);
    return NextResponse.json(
      { success: false, error: "サーバー内部エラーが発生しました。" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/admin/teams — チーム更新
// ---------------------------------------------------------------------------
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const result = await requireMaster(supabase);
    if ("error" in result) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status as number });
    }
    const { staff } = result;

    let body: { teamId: string; name?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "リクエストボディのJSONパースに失敗しました。" },
        { status: 400 }
      );
    }

    if (!body.teamId) {
      return NextResponse.json(
        { success: false, error: "teamId は必須です。" },
        { status: 400 }
      );
    }

    const updateFields: Record<string, unknown> = {};
    if (body.name !== undefined) updateFields.name = body.name.trim();

    if (Object.keys(updateFields).length === 0) {
      return NextResponse.json(
        { success: false, error: "更新するフィールドが指定されていません。" },
        { status: 400 }
      );
    }

    const { data: updated, error: updateError } = await supabase
      .from("teams")
      .update(updateFields)
      .eq("id", body.teamId)
      .eq("org_id", staff.org_id)
      .select("id, name, updated_at")
      .single();

    if (updateError) {
      console.error("[admin/teams:PATCH] 更新エラー:", updateError);
      return NextResponse.json(
        { success: false, error: "チーム情報の更新に失敗しました。" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    console.error("[admin/teams:PATCH] 予期しないエラー:", err);
    return NextResponse.json(
      { success: false, error: "サーバー内部エラーが発生しました。" },
      { status: 500 }
    );
  }
}

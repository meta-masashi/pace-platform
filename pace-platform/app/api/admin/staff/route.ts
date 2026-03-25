/**
 * PACE Platform — スタッフ管理 API（master 限定）
 *
 * GET   /api/admin/staff         — 組織内スタッフ一覧
 * POST  /api/admin/staff         — 新規スタッフ招待
 * PATCH /api/admin/staff         — スタッフ情報更新（ロール・リーダー・有効状態）
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
    return { error: "認証が必要です。ログインしてください。", status: 401 };
  }

  const { data: staff, error: staffError } = await supabase
    .from("staff")
    .select("id, org_id, role, is_active")
    .eq("id", user.id)
    .single();

  if (staffError || !staff) {
    return { error: "スタッフプロファイルが見つかりません。", status: 403 };
  }

  if (staff.role !== "master") {
    return { error: "この操作には master 権限が必要です。", status: 403 };
  }

  return { user, staff: staff as { id: string; org_id: string; role: string; is_active: boolean } };
}

// ---------------------------------------------------------------------------
// GET /api/admin/staff
// ---------------------------------------------------------------------------
export async function GET() {
  try {
    const supabase = await createClient();
    const result = await requireMaster(supabase);
    if ("error" in result) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status as number });
    }
    const { staff } = result;

    const { data: staffList, error } = await supabase
      .from("staff")
      .select("id, name, email, role, is_leader, is_active, team_id, created_at, updated_at")
      .eq("org_id", staff.org_id)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[admin/staff:GET] クエリエラー:", error);
      return NextResponse.json(
        { success: false, error: "スタッフ一覧の取得に失敗しました。" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: staffList ?? [] });
  } catch (err) {
    console.error("[admin/staff:GET] 予期しないエラー:", err);
    return NextResponse.json(
      { success: false, error: "サーバー内部エラーが発生しました。" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/admin/staff — 新規スタッフ招待
// ---------------------------------------------------------------------------
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const result = await requireMaster(supabase);
    if ("error" in result) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status as number });
    }
    const { staff } = result;

    let body: { email: string; role: string; name?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "リクエストボディのJSONパースに失敗しました。" },
        { status: 400 }
      );
    }

    if (!body.email || !body.role) {
      return NextResponse.json(
        { success: false, error: "email と role は必須です。" },
        { status: 400 }
      );
    }

    const validRoles = ["master", "AT", "PT", "S&C"];
    if (!validRoles.includes(body.role)) {
      return NextResponse.json(
        { success: false, error: `role は ${validRoles.join(", ")} のいずれかを指定してください。` },
        { status: 400 }
      );
    }

    // 既存スタッフの重複チェック
    const { data: existing } = await supabase
      .from("staff")
      .select("id")
      .eq("email", body.email)
      .eq("org_id", staff.org_id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { success: false, error: "このメールアドレスは既に登録されています。" },
        { status: 409 }
      );
    }

    // Supabase Auth の招待メール送信
    const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
      body.email,
      {
        data: {
          role: body.role,
          org_id: staff.org_id,
        },
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/api/auth/callback`,
      }
    );

    if (inviteError) {
      console.error("[admin/staff:POST] 招待エラー:", inviteError);
      // Service role が無い場合のフォールバック: スタッフレコードのみ作成
      const { data: newStaff, error: insertError } = await supabase
        .from("staff")
        .insert({
          org_id: staff.org_id,
          name: body.name ?? body.email.split("@")[0],
          email: body.email,
          role: body.role,
          is_leader: false,
          is_active: true,
        })
        .select("id, name, email, role")
        .single();

      if (insertError) {
        console.error("[admin/staff:POST] スタッフ作成エラー:", insertError);
        return NextResponse.json(
          { success: false, error: "スタッフの招待に失敗しました。" },
          { status: 500 }
        );
      }

      return NextResponse.json(
        { success: true, data: newStaff, invited: false },
        { status: 201 }
      );
    }

    // 招待成功 → スタッフレコード作成
    if (inviteData?.user) {
      await supabase.from("staff").insert({
        id: inviteData.user.id,
        org_id: staff.org_id,
        name: body.name ?? body.email.split("@")[0],
        email: body.email,
        role: body.role,
        is_leader: false,
        is_active: true,
      });
    }

    return NextResponse.json(
      { success: true, data: { email: body.email, role: body.role }, invited: true },
      { status: 201 }
    );
  } catch (err) {
    console.error("[admin/staff:POST] 予期しないエラー:", err);
    return NextResponse.json(
      { success: false, error: "サーバー内部エラーが発生しました。" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/admin/staff — スタッフ情報更新
// ---------------------------------------------------------------------------
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const result = await requireMaster(supabase);
    if ("error" in result) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status as number });
    }
    const { staff } = result;

    let body: {
      staffId: string;
      role?: string;
      is_leader?: boolean;
      is_active?: boolean;
      team_id?: string | null;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "リクエストボディのJSONパースに失敗しました。" },
        { status: 400 }
      );
    }

    if (!body.staffId) {
      return NextResponse.json(
        { success: false, error: "staffId は必須です。" },
        { status: 400 }
      );
    }

    if (body.role) {
      const validRoles = ["master", "AT", "PT", "S&C"];
      if (!validRoles.includes(body.role)) {
        return NextResponse.json(
          { success: false, error: `role は ${validRoles.join(", ")} のいずれかを指定してください。` },
          { status: 400 }
        );
      }
    }

    // 更新対象のスタッフが同一組織か確認
    const { data: target, error: targetError } = await supabase
      .from("staff")
      .select("id, org_id")
      .eq("id", body.staffId)
      .eq("org_id", staff.org_id)
      .single();

    if (targetError || !target) {
      return NextResponse.json(
        { success: false, error: "指定されたスタッフが見つかりません。" },
        { status: 404 }
      );
    }

    // 更新フィールドの構築
    const updateFields: Record<string, unknown> = {};
    if (body.role !== undefined) updateFields.role = body.role;
    if (body.is_leader !== undefined) updateFields.is_leader = body.is_leader;
    if (body.is_active !== undefined) updateFields.is_active = body.is_active;
    if (body.team_id !== undefined) updateFields.team_id = body.team_id;

    if (Object.keys(updateFields).length === 0) {
      return NextResponse.json(
        { success: false, error: "更新するフィールドが指定されていません。" },
        { status: 400 }
      );
    }

    const { data: updated, error: updateError } = await supabase
      .from("staff")
      .update(updateFields)
      .eq("id", body.staffId)
      .select("id, name, email, role, is_leader, is_active, team_id")
      .single();

    if (updateError) {
      console.error("[admin/staff:PATCH] 更新エラー:", updateError);
      return NextResponse.json(
        { success: false, error: "スタッフ情報の更新に失敗しました。" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    console.error("[admin/staff:PATCH] 予期しないエラー:", err);
    return NextResponse.json(
      { success: false, error: "サーバー内部エラーが発生しました。" },
      { status: 500 }
    );
  }
}

/**
 * PACE Platform — コミュニティチャンネル API
 *
 * GET  /api/community/channels — チャンネル一覧取得
 * POST /api/community/channels — チャンネル作成（master/leader のみ）
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// 共通: スタッフ認証チェック
// ---------------------------------------------------------------------------
async function requireStaff(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "認証が必要です。ログインしてください。", status: 401 } as const;
  }

  const { data: staff, error: staffError } = await supabase
    .from("staff")
    .select("id, org_id, role, team_id, is_leader, is_active")
    .eq("id", user.id)
    .single();

  if (staffError || !staff) {
    return { error: "スタッフプロファイルが見つかりません。", status: 403 } as const;
  }

  if (!staff.is_active) {
    return { error: "アカウントが無効化されています。", status: 403 } as const;
  }

  return { user, staff } as const;
}

// ---------------------------------------------------------------------------
// GET /api/community/channels
// ---------------------------------------------------------------------------
export async function GET() {
  try {
    const supabase = await createClient();
    const result = await requireStaff(supabase);
    if ("error" in result) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status as number });
    }
    const { staff } = result;

    const { data: channels, error } = await supabase
      .from("channels")
      .select("id, name, type, team_id, created_at")
      .eq("org_id", staff.org_id)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[community/channels:GET] クエリエラー:", error);
      return NextResponse.json(
        { success: false, error: "チャンネル一覧の取得に失敗しました。" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: channels ?? [] });
  } catch (err) {
    console.error("[community/channels:GET] 予期しないエラー:", err);
    return NextResponse.json(
      { success: false, error: "サーバー内部エラーが発生しました。" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/community/channels — チャンネル作成
// ---------------------------------------------------------------------------
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const result = await requireStaff(supabase);
    if ("error" in result) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status as number });
    }
    const { staff } = result;

    // master または is_leader のみ作成可能
    if (staff.role !== "master" && !staff.is_leader) {
      return NextResponse.json(
        { success: false, error: "チャンネル作成には master またはリーダー権限が必要です。" },
        { status: 403 }
      );
    }

    let body: { name: string; type?: string; team_id?: string };
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
        { success: false, error: "チャンネル名は必須です。" },
        { status: 400 }
      );
    }

    const validTypes = ["medical", "team", "s_and_c", "rehab", "general"];
    const channelType = body.type ?? "general";
    if (!validTypes.includes(channelType)) {
      return NextResponse.json(
        { success: false, error: `type は ${validTypes.join(", ")} のいずれかを指定してください。` },
        { status: 400 }
      );
    }

    const { data: channel, error: insertError } = await supabase
      .from("channels")
      .insert({
        org_id: staff.org_id,
        name: body.name.trim(),
        type: channelType,
        team_id: body.team_id ?? staff.team_id ?? null,
      })
      .select("id, name, type, team_id, created_at")
      .single();

    if (insertError) {
      console.error("[community/channels:POST] 作成エラー:", insertError);
      return NextResponse.json(
        { success: false, error: "チャンネルの作成に失敗しました。" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, data: channel },
      { status: 201 }
    );
  } catch (err) {
    console.error("[community/channels:POST] 予期しないエラー:", err);
    return NextResponse.json(
      { success: false, error: "サーバー内部エラーが発生しました。" },
      { status: 500 }
    );
  }
}

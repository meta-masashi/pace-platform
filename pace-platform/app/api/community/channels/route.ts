/**
 * PACE Platform — コミュニティチャンネル API
 *
 * GET  /api/community/channels — チャンネル一覧取得
 * POST /api/community/channels — チャンネル作成（master/leader のみ）
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withApiHandler, ApiError } from "@/lib/api/handler";

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
export const GET = withApiHandler(async (_req, ctx) => {
  const supabase = await createClient();
  const result = await requireStaff(supabase);
  if ("error" in result) {
    throw new ApiError(result.status as number, result.error);
  }
  const { staff } = result;

  const { data: channels, error } = await supabase
    .from("channels")
    .select("id, name, type, team_id, created_at")
    .eq("org_id", staff.org_id)
    .order("created_at", { ascending: true });

  if (error) {
    ctx.log.error("クエリエラー", { detail: error });
    throw new ApiError(500, "チャンネル一覧の取得に失敗しました。");
  }

  return NextResponse.json({ success: true, data: channels ?? [] });
}, { service: 'community' });

// ---------------------------------------------------------------------------
// POST /api/community/channels — チャンネル作成
// ---------------------------------------------------------------------------
export const POST = withApiHandler(async (req, ctx) => {
  const supabase = await createClient();
  const result = await requireStaff(supabase);
  if ("error" in result) {
    throw new ApiError(result.status as number, result.error);
  }
  const { staff } = result;

  // master または is_leader のみ作成可能
  if (staff.role !== "master" && !staff.is_leader) {
    throw new ApiError(403, "チャンネル作成には master またはリーダー権限が必要です。");
  }

  let body: { name: string; type?: string; team_id?: string };
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, "リクエストボディのJSONパースに失敗しました。");
  }

  if (!body.name || body.name.trim().length === 0) {
    throw new ApiError(400, "チャンネル名は必須です。");
  }

  const validTypes = ["medical", "team", "s_and_c", "rehab", "general"];
  const channelType = body.type ?? "general";
  if (!validTypes.includes(channelType)) {
    throw new ApiError(400, `type は ${validTypes.join(", ")} のいずれかを指定してください。`);
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
    ctx.log.error("作成エラー", { detail: insertError });
    throw new ApiError(500, "チャンネルの作成に失敗しました。");
  }

  return NextResponse.json(
    { success: true, data: channel },
    { status: 201 }
  );
}, { service: 'community' });

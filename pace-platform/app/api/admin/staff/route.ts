/**
 * PACE Platform — スタッフ管理 API（master 限定）
 *
 * GET   /api/admin/staff         — 組織内スタッフ一覧
 * POST  /api/admin/staff         — 新規スタッフ招待
 * PATCH /api/admin/staff         — スタッフ情報更新（ロール・リーダー・有効状態）
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { staffInviteSchema, staffUpdateSchema, parseBody } from "@/lib/security/api-schemas";
import { rateLimit, rateLimitResponse } from "@/lib/security/rate-limit";
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
export const GET = withApiHandler(async (_req, ctx) => {
  const supabase = await createClient();
  const result = await requireMaster(supabase);
  if ("error" in result) {
    throw new ApiError(result.status as number, result.error);
  }
  const { staff } = result;

  // レート制限チェック
  const rl = await rateLimit(staff.id, "admin/staff:GET", { maxRequests: 60, windowMs: 60_000 });
  if (!rl.allowed) return rateLimitResponse(rl);

  const { data: staffList, error } = await supabase
    .from("staff")
    .select("id, name, email, role, is_leader, is_active, team_id, created_at, updated_at")
    .eq("org_id", staff.org_id)
    .order("created_at", { ascending: true });

  if (error) {
    ctx.log.error("クエリエラー", { detail: error });
    throw new ApiError(500, "スタッフ一覧の取得に失敗しました。");
  }

  return NextResponse.json({ success: true, data: staffList ?? [] });
}, { service: 'admin' });

// ---------------------------------------------------------------------------
// POST /api/admin/staff — 新規スタッフ招待
// ---------------------------------------------------------------------------
export const POST = withApiHandler(async (req, ctx) => {
  const supabase = await createClient();
  const result = await requireMaster(supabase);
  if ("error" in result) {
    throw new ApiError(result.status as number, result.error);
  }
  const { staff } = result;

  // レート制限チェック（招待は厳しめ: 10回/分）
  const rl = await rateLimit(staff.id, "admin/staff:POST", { maxRequests: 10, windowMs: 60_000 });
  if (!rl.allowed) return rateLimitResponse(rl);

  // Zod バリデーション
  const parsed = await parseBody(req, staffInviteSchema);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data;

  // 既存スタッフの重複チェック
  const { data: existing } = await supabase
    .from("staff")
    .select("id")
    .eq("email", body.email)
    .eq("org_id", staff.org_id)
    .maybeSingle();

  if (existing) {
    throw new ApiError(409, "このメールアドレスは既に登録されています。");
  }

  // 招待コード生成 + スタッフレコード作成（非アクティブ）
  // セキュリティ: 招待コードに十分なエントロピーを確保（128ビット）
  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);
  const inviteCode = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();

  const { data: newStaff, error: insertError } = await supabase
    .from("staff")
    .insert({
      org_id: staff.org_id,
      name: body.name ?? body.email.split("@")[0],
      email: body.email,
      role: body.role,
      is_leader: false,
      is_active: false,
    })
    .select("id, name, email, role")
    .single();

  if (insertError) {
    ctx.log.error("スタッフ作成エラー", { detail: insertError });
    throw new ApiError(500, "スタッフの招待に失敗しました。");
  }

  return NextResponse.json(
    { success: true, data: { ...newStaff, inviteCode }, invited: false },
    { status: 201 }
  );
}, { service: 'admin' });

// ---------------------------------------------------------------------------
// PATCH /api/admin/staff — スタッフ情報更新
// ---------------------------------------------------------------------------
export const PATCH = withApiHandler(async (req, ctx) => {
  const supabase = await createClient();
  const result = await requireMaster(supabase);
  if ("error" in result) {
    throw new ApiError(result.status as number, result.error);
  }
  const { staff } = result;

  // レート制限チェック
  const rl = await rateLimit(staff.id, "admin/staff:PATCH", { maxRequests: 30, windowMs: 60_000 });
  if (!rl.allowed) return rateLimitResponse(rl);

  // Zod バリデーション
  const parsed = await parseBody(req, staffUpdateSchema);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data;

  // 更新対象のスタッフが同一組織か確認
  const { data: target, error: targetError } = await supabase
    .from("staff")
    .select("id, org_id")
    .eq("id", body.staffId)
    .eq("org_id", staff.org_id)
    .single();

  if (targetError || !target) {
    throw new ApiError(404, "指定されたスタッフが見つかりません。");
  }

  // 更新フィールドの構築
  const updateFields: Record<string, unknown> = {};
  if (body.role !== undefined) updateFields.role = body.role;
  if (body.is_leader !== undefined) updateFields.is_leader = body.is_leader;
  if (body.is_active !== undefined) updateFields.is_active = body.is_active;
  if (body.team_id !== undefined) updateFields.team_id = body.team_id;

  if (Object.keys(updateFields).length === 0) {
    throw new ApiError(400, "更新するフィールドが指定されていません。");
  }

  const { data: updated, error: updateError } = await supabase
    .from("staff")
    .update(updateFields)
    .eq("id", body.staffId)
    .select("id, name, email, role, is_leader, is_active, team_id")
    .single();

  if (updateError) {
    ctx.log.error("更新エラー", { detail: updateError });
    throw new ApiError(500, "スタッフ情報の更新に失敗しました。");
  }

  return NextResponse.json({ success: true, data: updated });
}, { service: 'admin' });

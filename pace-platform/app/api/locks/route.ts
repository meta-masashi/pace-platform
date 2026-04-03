/**
 * PACE Platform — アスリートロック管理 API
 *
 * GET    /api/locks?athleteId=xxx  — ロック一覧取得
 * POST   /api/locks               — ロック作成
 * DELETE /api/locks               — ロック削除
 *
 * Hard Lock: master のみ作成・削除可
 * Soft Lock: AT, PT, master が作成可、master のみ削除可
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateUUID, sanitizeString } from "@/lib/security/input-validator";
import { logAuditEvent } from "@/lib/security/audit-logger";
import { withApiHandler, ApiError } from "@/lib/api/handler";

// ---------------------------------------------------------------------------
// GET /api/locks
// ---------------------------------------------------------------------------

/**
 * アスリートまたはチームのアクティブなロック一覧を取得する。
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
  const teamId = searchParams.get("teamId");

  // UUID 形式バリデーション
  if (athleteId && !validateUUID(athleteId)) {
    throw new ApiError(400, "athleteId の形式が不正です。");
  }
  if (teamId && !validateUUID(teamId)) {
    throw new ApiError(400, "teamId の形式が不正です。");
  }

  // ----- ロック取得 -----
  let query = supabase
    .from("athlete_locks")
    .select(`
      id,
      athlete_id,
      set_by_staff_id,
      lock_type,
      tag,
      reason,
      set_at,
      expires_at,
      athletes!inner ( id, name, org_id ),
      staff:set_by_staff_id ( name )
    `)
    .eq("athletes.org_id", staff.org_id)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order("set_at", { ascending: false })
    .limit(500);

  if (athleteId) {
    query = query.eq("athlete_id", athleteId);
  }

  if (teamId) {
    query = query.eq("athletes.team_id", teamId);
  }

  const { data: locks, error: locksError } = await query;

  if (locksError) {
    ctx.log.error("クエリエラー", { detail: locksError });
    throw new ApiError(500, "ロック一覧の取得に失敗しました。");
  }

  return NextResponse.json({ success: true, data: locks ?? [] });
}, { service: 'locks' });

// ---------------------------------------------------------------------------
// POST /api/locks
// ---------------------------------------------------------------------------

/**
 * ロックを作成する。
 *
 * Hard Lock: master のみ
 * Soft Lock: AT, PT, master
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
    .select("id, org_id, role")
    .eq("id", user.id)
    .single();

  if (staffError || !staff) {
    throw new ApiError(403, "スタッフプロファイルが見つかりません。");
  }

  // ----- リクエストボディ -----
  let body: {
    athleteId: string;
    lockType: "hard" | "soft";
    tag: string;
    reason?: string;
    expiresAt?: string;
  };
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, "リクエストボディのJSONパースに失敗しました。");
  }

  if (!body.athleteId || !body.lockType || !body.tag) {
    throw new ApiError(400, "athleteId、lockType、tag は必須です。");
  }

  if (!validateUUID(body.athleteId)) {
    throw new ApiError(400, "athleteId の形式が不正です。");
  }

  // 文字列入力をサニタイズ
  body.tag = sanitizeString(body.tag, 100);
  if (body.reason) {
    body.reason = sanitizeString(body.reason, 500);
  }

  if (!["hard", "soft"].includes(body.lockType)) {
    throw new ApiError(400, "lockType は 'hard' または 'soft' を指定してください。");
  }

  // Hard Lock は master のみ
  if (body.lockType === "hard" && (staff.role as string) !== "master") {
    throw new ApiError(403, "Hard Lock の作成には master 権限が必要です。");
  }

  // Soft Lock は AT, PT, master
  const softAllowed = ["AT", "PT", "master"];
  if (body.lockType === "soft" && !softAllowed.includes(staff.role as string)) {
    throw new ApiError(403, "Soft Lock の作成には AT、PT、または master 権限が必要です。");
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

  // ----- ロック作成 -----
  const { data: lock, error: lockError } = await supabase
    .from("athlete_locks")
    .insert({
      athlete_id: body.athleteId,
      set_by_staff_id: staff.id,
      lock_type: body.lockType,
      tag: body.tag,
      reason: body.reason ?? null,
      expires_at: body.expiresAt ?? null,
    })
    .select("id, set_at")
    .single();

  if (lockError || !lock) {
    ctx.log.error("ロック作成エラー", { detail: lockError });
    throw new ApiError(500, "ロックの作成に失敗しました。");
  }

  // ----- 監査ログ -----
  await logAuditEvent(supabase, {
    action: 'lock_create',
    targetType: 'athlete_lock',
    targetId: lock.id as string,
    details: {
      athlete_id: body.athleteId,
      lock_type: body.lockType,
      tag: body.tag,
      reason: body.reason,
    },
  });

  return NextResponse.json(
    { success: true, data: { lockId: lock.id, setAt: lock.set_at } },
    { status: 201 }
  );
}, { service: 'locks' });

// ---------------------------------------------------------------------------
// DELETE /api/locks
// ---------------------------------------------------------------------------

/**
 * ロックを削除する。
 *
 * Hard Lock 削除: master のみ
 */
export const DELETE = withApiHandler(async (req, ctx) => {
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
    .select("id, org_id, role")
    .eq("id", user.id)
    .single();

  if (staffError || !staff) {
    throw new ApiError(403, "スタッフプロファイルが見つかりません。");
  }

  // ----- リクエストボディ -----
  let body: { lockId: string };
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, "リクエストボディのJSONパースに失敗しました。");
  }

  if (!body.lockId || !validateUUID(body.lockId)) {
    throw new ApiError(400, "有効な lockId を指定してください。");
  }

  // ----- ロック取得 -----
  const { data: lock, error: lockFetchError } = await supabase
    .from("athlete_locks")
    .select("id, lock_type, athlete_id")
    .eq("id", body.lockId)
    .single();

  if (lockFetchError || !lock) {
    throw new ApiError(404, "指定されたロックが見つかりません。");
  }

  // ロックの対象選手が自組織に属するか検証（IDOR防止）
  const { data: lockAthlete } = await supabase
    .from("athletes")
    .select("org_id")
    .eq("id", lock.athlete_id)
    .single();

  if (!lockAthlete || (lockAthlete.org_id as string) !== (staff.org_id as string)) {
    throw new ApiError(403, "このロックを削除する権限がありません。");
  }

  // Hard Lock 削除は master のみ
  if ((lock.lock_type as string) === "hard" && (staff.role as string) !== "master") {
    throw new ApiError(403, "Hard Lock の削除には master 権限が必要です。");
  }

  // ----- ロック削除 -----
  const { error: deleteError } = await supabase
    .from("athlete_locks")
    .delete()
    .eq("id", body.lockId);

  if (deleteError) {
    ctx.log.error("ロック削除エラー", { detail: deleteError });
    throw new ApiError(500, "ロックの削除に失敗しました。");
  }

  // ----- 監査ログ -----
  await logAuditEvent(supabase, {
    action: 'lock_delete',
    targetType: 'athlete_lock',
    targetId: body.lockId,
    details: {
      athlete_id: lock.athlete_id,
      lock_type: lock.lock_type,
    },
  });

  return NextResponse.json({
    success: true,
    data: { lockId: body.lockId, deleted: true },
  });
}, { service: 'locks' });

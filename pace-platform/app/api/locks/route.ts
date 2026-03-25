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

// ---------------------------------------------------------------------------
// GET /api/locks
// ---------------------------------------------------------------------------

/**
 * アスリートまたはチームのアクティブなロック一覧を取得する。
 */
export async function GET(request: Request) {
  try {
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

    // ----- スタッフ確認 -----
    const { data: staff, error: staffError } = await supabase
      .from("staff")
      .select("id, org_id, role")
      .eq("id", user.id)
      .single();

    if (staffError || !staff) {
      return NextResponse.json(
        { success: false, error: "スタッフプロファイルが見つかりません。" },
        { status: 403 }
      );
    }

    // ----- クエリパラメータ -----
    const { searchParams } = new URL(request.url);
    const athleteId = searchParams.get("athleteId");
    const teamId = searchParams.get("teamId");

    // UUID 形式バリデーション
    if (athleteId && !validateUUID(athleteId)) {
      return NextResponse.json(
        { success: false, error: "athleteId の形式が不正です。" },
        { status: 400 }
      );
    }
    if (teamId && !validateUUID(teamId)) {
      return NextResponse.json(
        { success: false, error: "teamId の形式が不正です。" },
        { status: 400 }
      );
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
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order("set_at", { ascending: false });

    if (athleteId) {
      query = query.eq("athlete_id", athleteId);
    }

    if (teamId) {
      query = query.eq("athletes.team_id", teamId);
    }

    const { data: locks, error: locksError } = await query;

    if (locksError) {
      console.error("[locks:GET] クエリエラー:", locksError);
      return NextResponse.json(
        { success: false, error: "ロック一覧の取得に失敗しました。" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: locks ?? [] });
  } catch (err) {
    console.error("[locks:GET] 予期しないエラー:", err);
    return NextResponse.json(
      { success: false, error: "サーバー内部エラーが発生しました。" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/locks
// ---------------------------------------------------------------------------

/**
 * ロックを作成する。
 *
 * Hard Lock: master のみ
 * Soft Lock: AT, PT, master
 */
export async function POST(request: Request) {
  try {
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
      .select("id, org_id, role")
      .eq("id", user.id)
      .single();

    if (staffError || !staff) {
      return NextResponse.json(
        { success: false, error: "スタッフプロファイルが見つかりません。" },
        { status: 403 }
      );
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
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "リクエストボディのJSONパースに失敗しました。" },
        { status: 400 }
      );
    }

    if (!body.athleteId || !body.lockType || !body.tag) {
      return NextResponse.json(
        { success: false, error: "athleteId、lockType、tag は必須です。" },
        { status: 400 }
      );
    }

    if (!validateUUID(body.athleteId)) {
      return NextResponse.json(
        { success: false, error: "athleteId の形式が不正です。" },
        { status: 400 }
      );
    }

    // 文字列入力をサニタイズ
    body.tag = sanitizeString(body.tag, 100);
    if (body.reason) {
      body.reason = sanitizeString(body.reason, 500);
    }

    if (!["hard", "soft"].includes(body.lockType)) {
      return NextResponse.json(
        { success: false, error: "lockType は 'hard' または 'soft' を指定してください。" },
        { status: 400 }
      );
    }

    // Hard Lock は master のみ
    if (body.lockType === "hard" && (staff.role as string) !== "master") {
      return NextResponse.json(
        { success: false, error: "Hard Lock の作成には master 権限が必要です。" },
        { status: 403 }
      );
    }

    // Soft Lock は AT, PT, master
    const softAllowed = ["AT", "PT", "master"];
    if (body.lockType === "soft" && !softAllowed.includes(staff.role as string)) {
      return NextResponse.json(
        { success: false, error: "Soft Lock の作成には AT、PT、または master 権限が必要です。" },
        { status: 403 }
      );
    }

    // ----- アスリート存在確認 -----
    const { data: athlete, error: athleteError } = await supabase
      .from("athletes")
      .select("id, org_id")
      .eq("id", body.athleteId)
      .eq("org_id", staff.org_id)
      .single();

    if (athleteError || !athlete) {
      return NextResponse.json(
        { success: false, error: "指定されたアスリートが見つからないか、アクセス権がありません。" },
        { status: 404 }
      );
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
      console.error("[locks:POST] ロック作成エラー:", lockError);
      return NextResponse.json(
        { success: false, error: "ロックの作成に失敗しました。" },
        { status: 500 }
      );
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
  } catch (err) {
    console.error("[locks:POST] 予期しないエラー:", err);
    return NextResponse.json(
      { success: false, error: "サーバー内部エラーが発生しました。" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/locks
// ---------------------------------------------------------------------------

/**
 * ロックを削除する。
 *
 * Hard Lock 削除: master のみ
 */
export async function DELETE(request: Request) {
  try {
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
      .select("id, org_id, role")
      .eq("id", user.id)
      .single();

    if (staffError || !staff) {
      return NextResponse.json(
        { success: false, error: "スタッフプロファイルが見つかりません。" },
        { status: 403 }
      );
    }

    // ----- リクエストボディ -----
    let body: { lockId: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "リクエストボディのJSONパースに失敗しました。" },
        { status: 400 }
      );
    }

    if (!body.lockId || !validateUUID(body.lockId)) {
      return NextResponse.json(
        { success: false, error: "有効な lockId を指定してください。" },
        { status: 400 }
      );
    }

    // ----- ロック取得 -----
    const { data: lock, error: lockFetchError } = await supabase
      .from("athlete_locks")
      .select("id, lock_type, athlete_id")
      .eq("id", body.lockId)
      .single();

    if (lockFetchError || !lock) {
      return NextResponse.json(
        { success: false, error: "指定されたロックが見つかりません。" },
        { status: 404 }
      );
    }

    // Hard Lock 削除は master のみ
    if ((lock.lock_type as string) === "hard" && (staff.role as string) !== "master") {
      return NextResponse.json(
        { success: false, error: "Hard Lock の削除には master 権限が必要です。" },
        { status: 403 }
      );
    }

    // ----- ロック削除 -----
    const { error: deleteError } = await supabase
      .from("athlete_locks")
      .delete()
      .eq("id", body.lockId);

    if (deleteError) {
      console.error("[locks:DELETE] ロック削除エラー:", deleteError);
      return NextResponse.json(
        { success: false, error: "ロックの削除に失敗しました。" },
        { status: 500 }
      );
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
  } catch (err) {
    console.error("[locks:DELETE] 予期しないエラー:", err);
    return NextResponse.json(
      { success: false, error: "サーバー内部エラーが発生しました。" },
      { status: 500 }
    );
  }
}

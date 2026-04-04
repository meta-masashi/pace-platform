/**
 * PACE Platform — 通知プリファレンス API
 *
 * GET  /api/notifications/preferences — 現在のユーザーの通知設定を取得
 * PUT  /api/notifications/preferences — 通知設定を更新（チャネル単位）
 *
 * 認可: 認証済みスタッフのみ
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withApiHandler, ApiError } from "@/lib/api/handler";

// ---------------------------------------------------------------------------
// GET /api/notifications/preferences
// ---------------------------------------------------------------------------

export const GET = withApiHandler(async (_req, _ctx) => {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new ApiError(401, "認証が必要です。");
  }

  // スタッフ確認
  const { data: staff } = await supabase
    .from("staff")
    .select("id, org_id, email")
    .eq("id", user.id)
    .single();

  if (!staff) {
    throw new ApiError(403, "スタッフ情報が見つかりません。");
  }

  // 通知プリファレンス取得
  const { data: preferences, error: prefError } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("staff_id", user.id);

  if (prefError) {
    throw new ApiError(500, "通知設定の取得に失敗しました。");
  }

  return NextResponse.json({
    email: staff.email,
    preferences: preferences ?? [],
  });
}, { service: 'notifications' });

// ---------------------------------------------------------------------------
// PUT /api/notifications/preferences
// ---------------------------------------------------------------------------

interface PutRequestBody {
  channel: "email" | "slack" | "web_push";
  enabled: boolean;
  config?: Record<string, unknown>;
}

export const PUT = withApiHandler(async (req, _ctx) => {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new ApiError(401, "認証が必要です。");
  }

  // スタッフ確認
  const { data: staff } = await supabase
    .from("staff")
    .select("id, org_id")
    .eq("id", user.id)
    .single();

  if (!staff) {
    throw new ApiError(403, "スタッフ情報が見つかりません。");
  }

  const body: PutRequestBody = await req.json();

  // バリデーション
  if (!["email", "slack", "web_push"].includes(body.channel)) {
    throw new ApiError(400, "無効なチャネルです。");
  }

  if (typeof body.enabled !== "boolean") {
    throw new ApiError(400, "enabled は boolean 値である必要があります。");
  }

  // upsert（存在しない場合は作成、存在する場合は更新）
  const { data: result, error: upsertError } = await supabase
    .from("notification_preferences")
    .upsert(
      {
        staff_id: user.id,
        org_id: staff.org_id,
        channel: body.channel,
        enabled: body.enabled,
        config: body.config ?? {},
      },
      {
        onConflict: "staff_id,channel",
      }
    )
    .select()
    .single();

  if (upsertError) {
    throw new ApiError(500, "通知設定の更新に失敗しました。");
  }

  return NextResponse.json({ preference: result });
}, { service: 'notifications' });

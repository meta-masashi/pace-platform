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

// ---------------------------------------------------------------------------
// GET /api/notifications/preferences
// ---------------------------------------------------------------------------

export async function GET(): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "認証が必要です。" },
        { status: 401 }
      );
    }

    // スタッフ確認
    const { data: staff } = await supabase
      .from("staff")
      .select("id, org_id, email")
      .eq("id", user.id)
      .single();

    if (!staff) {
      return NextResponse.json(
        { error: "スタッフ情報が見つかりません。" },
        { status: 403 }
      );
    }

    // 通知プリファレンス取得
    const { data: preferences, error: prefError } = await supabase
      .from("notification_preferences")
      .select("*")
      .eq("staff_id", user.id);

    if (prefError) {
      console.error("[api/notifications/preferences] 取得エラー:", prefError);
      return NextResponse.json(
        { error: "通知設定の取得に失敗しました。" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      email: staff.email,
      preferences: preferences ?? [],
    });
  } catch (err) {
    console.error("[api/notifications/preferences] GET エラー:", err);
    return NextResponse.json(
      { error: "サーバー内部エラーが発生しました。" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// PUT /api/notifications/preferences
// ---------------------------------------------------------------------------

interface PutRequestBody {
  channel: "email" | "slack" | "web_push";
  enabled: boolean;
  config?: Record<string, unknown>;
}

export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "認証が必要です。" },
        { status: 401 }
      );
    }

    // スタッフ確認
    const { data: staff } = await supabase
      .from("staff")
      .select("id, org_id")
      .eq("id", user.id)
      .single();

    if (!staff) {
      return NextResponse.json(
        { error: "スタッフ情報が見つかりません。" },
        { status: 403 }
      );
    }

    const body: PutRequestBody = await request.json();

    // バリデーション
    if (!["email", "slack", "web_push"].includes(body.channel)) {
      return NextResponse.json(
        { error: "無効なチャネルです。" },
        { status: 400 }
      );
    }

    if (typeof body.enabled !== "boolean") {
      return NextResponse.json(
        { error: "enabled は boolean 値である必要があります。" },
        { status: 400 }
      );
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
      console.error("[api/notifications/preferences] 更新エラー:", upsertError);
      return NextResponse.json(
        { error: "通知設定の更新に失敗しました。" },
        { status: 500 }
      );
    }

    return NextResponse.json({ preference: result });
  } catch (err) {
    console.error("[api/notifications/preferences] PUT エラー:", err);
    return NextResponse.json(
      { error: "サーバー内部エラーが発生しました。" },
      { status: 500 }
    );
  }
}

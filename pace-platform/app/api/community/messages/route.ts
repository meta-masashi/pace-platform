/**
 * PACE Platform — コミュニティメッセージ API
 *
 * GET  /api/community/messages?channelId=xxx — メッセージ一覧（ページネーション対応）
 * POST /api/community/messages               — メッセージ送信
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
    .select("id, org_id, role, team_id, is_active")
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
// GET /api/community/messages
// ---------------------------------------------------------------------------
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const result = await requireStaff(supabase);
    if ("error" in result) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status as number });
    }

    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get("channelId");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 100);
    const before = searchParams.get("before"); // ISO timestamp for pagination

    if (!channelId) {
      return NextResponse.json(
        { success: false, error: "channelId は必須です。" },
        { status: 400 }
      );
    }

    let query = supabase
      .from("messages")
      .select(`
        id,
        content,
        attachments_json,
        created_at,
        updated_at,
        staff_id,
        staff:staff_id ( id, name, role )
      `)
      .eq("channel_id", channelId)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (before) {
      query = query.lt("created_at", before);
    }

    const { data: messages, error } = await query;

    if (error) {
      console.error("[community/messages:GET] クエリエラー:", error);
      return NextResponse.json(
        { success: false, error: "メッセージの取得に失敗しました。" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: messages ?? [] });
  } catch (err) {
    console.error("[community/messages:GET] 予期しないエラー:", err);
    return NextResponse.json(
      { success: false, error: "サーバー内部エラーが発生しました。" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/community/messages — メッセージ送信
// ---------------------------------------------------------------------------
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const result = await requireStaff(supabase);
    if ("error" in result) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status as number });
    }
    const { staff } = result;

    let body: { channelId: string; content: string; attachments?: unknown[] };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "リクエストボディのJSONパースに失敗しました。" },
        { status: 400 }
      );
    }

    if (!body.channelId || !body.content?.trim()) {
      return NextResponse.json(
        { success: false, error: "channelId と content は必須です。" },
        { status: 400 }
      );
    }

    // チャンネル存在確認（同一 org チェックは RLS で実施）
    const { data: channel, error: channelError } = await supabase
      .from("channels")
      .select("id, org_id")
      .eq("id", body.channelId)
      .single();

    if (channelError || !channel) {
      return NextResponse.json(
        { success: false, error: "指定されたチャンネルが見つかりません。" },
        { status: 404 }
      );
    }

    const { data: message, error: insertError } = await supabase
      .from("messages")
      .insert({
        channel_id: body.channelId,
        org_id: staff.org_id,
        staff_id: staff.id,
        content: body.content.trim(),
        attachments_json: body.attachments ?? [],
      })
      .select(`
        id,
        content,
        attachments_json,
        created_at,
        staff_id,
        staff:staff_id ( id, name, role )
      `)
      .single();

    if (insertError) {
      console.error("[community/messages:POST] 作成エラー:", insertError);
      return NextResponse.json(
        { success: false, error: "メッセージの送信に失敗しました。" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, data: message },
      { status: 201 }
    );
  } catch (err) {
    console.error("[community/messages:POST] 予期しないエラー:", err);
    return NextResponse.json(
      { success: false, error: "サーバー内部エラーが発生しました。" },
      { status: 500 }
    );
  }
}

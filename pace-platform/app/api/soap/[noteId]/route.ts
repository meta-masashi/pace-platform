/**
 * PACE Platform — SOAPノート個別操作 API
 *
 * GET    /api/soap/:noteId — 個別取得
 * PATCH  /api/soap/:noteId — 更新（作成者または master のみ）
 * DELETE /api/soap/:noteId — 削除（master のみ）
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sanitizeString } from "@/lib/security/input-validator";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface SoapNoteRow {
  id: string;
  athlete_id: string;
  staff_id: string;
  s_text: string;
  o_text: string;
  a_text: string;
  p_text: string;
  created_at: string;
  ai_assisted: boolean;
}

interface SuccessResponse {
  success: true;
  data: SoapNoteRow;
}

interface DeleteSuccessResponse {
  success: true;
  message: string;
}

interface ErrorResponse {
  success: false;
  error: string;
}

// ---------------------------------------------------------------------------
// ユーザーロール取得ヘルパー
// ---------------------------------------------------------------------------

async function getUserRole(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("staff_profiles")
    .select("role")
    .eq("user_id", userId)
    .single();

  return (data?.role as string) ?? null;
}

// ---------------------------------------------------------------------------
// GET /api/soap/:noteId
// ---------------------------------------------------------------------------

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ noteId: string }> }
): Promise<NextResponse<SuccessResponse | ErrorResponse>> {
  try {
    const { noteId } = await params;

    if (!noteId) {
      return NextResponse.json(
        { success: false, error: "ノートIDが指定されていません。" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
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

    const { data: note, error: fetchError } = await supabase
      .from("soap_notes")
      .select("*")
      .eq("id", noteId)
      .single();

    if (fetchError || !note) {
      return NextResponse.json(
        { success: false, error: "SOAPノートが見つからないか、アクセス権がありません。" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: note as SoapNoteRow,
    });
  } catch (err) {
    console.error("[soap:get] 予期しないエラー:", err);
    return NextResponse.json(
      { success: false, error: "サーバー内部エラーが発生しました。" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/soap/:noteId — 更新（作成者または master のみ）
// ---------------------------------------------------------------------------

interface UpdateSoapBody {
  sText?: string;
  oText?: string;
  aText?: string;
  pText?: string;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ noteId: string }> }
): Promise<NextResponse<SuccessResponse | ErrorResponse>> {
  try {
    const { noteId } = await params;

    if (!noteId) {
      return NextResponse.json(
        { success: false, error: "ノートIDが指定されていません。" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
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

    // ----- 既存ノート取得 -----
    const { data: existingNote, error: fetchError } = await supabase
      .from("soap_notes")
      .select("*")
      .eq("id", noteId)
      .single();

    if (fetchError || !existingNote) {
      return NextResponse.json(
        { success: false, error: "SOAPノートが見つからないか、アクセス権がありません。" },
        { status: 404 }
      );
    }

    // ----- 権限チェック: 作成者または master のみ編集可 -----
    const role = await getUserRole(supabase, user.id);
    const isCreator = existingNote.staff_id === user.id;
    const isMaster = role === "master";

    if (!isCreator && !isMaster) {
      return NextResponse.json(
        { success: false, error: "このノートを編集する権限がありません。作成者またはマスター管理者のみ編集できます。" },
        { status: 403 }
      );
    }

    // ----- リクエストボディパース -----
    let body: UpdateSoapBody;
    try {
      body = (await request.json()) as UpdateSoapBody;
    } catch {
      return NextResponse.json(
        { success: false, error: "リクエストボディのJSONパースに失敗しました。" },
        { status: 400 }
      );
    }

    // ----- バリデーション -----
    const updateFields: Record<string, string> = {};

    if (body.sText !== undefined) {
      if (body.sText.length < 10) {
        return NextResponse.json(
          { success: false, error: "主観的所見（S）は10文字以上必要です。" },
          { status: 400 }
        );
      }
      updateFields.s_text = sanitizeString(body.sText, 5000);
    }
    if (body.oText !== undefined) {
      if (body.oText.length < 10) {
        return NextResponse.json(
          { success: false, error: "客観的所見（O）は10文字以上必要です。" },
          { status: 400 }
        );
      }
      updateFields.o_text = sanitizeString(body.oText, 5000);
    }
    if (body.aText !== undefined) {
      if (body.aText.length < 10) {
        return NextResponse.json(
          { success: false, error: "評価（A）は10文字以上必要です。" },
          { status: 400 }
        );
      }
      updateFields.a_text = sanitizeString(body.aText, 5000);
    }
    if (body.pText !== undefined) {
      if (body.pText.length < 10) {
        return NextResponse.json(
          { success: false, error: "計画（P）は10文字以上必要です。" },
          { status: 400 }
        );
      }
      updateFields.p_text = sanitizeString(body.pText, 5000);
    }

    if (Object.keys(updateFields).length === 0) {
      return NextResponse.json(
        { success: false, error: "更新するフィールドが指定されていません。" },
        { status: 400 }
      );
    }

    // ----- 更新実行 -----
    const { data: updated, error: updateError } = await supabase
      .from("soap_notes")
      .update(updateFields)
      .eq("id", noteId)
      .select("*")
      .single();

    if (updateError || !updated) {
      console.error("[soap:update] 更新エラー:", updateError);
      return NextResponse.json(
        { success: false, error: "SOAPノートの更新に失敗しました。" },
        { status: 500 }
      );
    }

    // ----- 監査ログ記録 -----
    await supabase
      .from("audit_logs")
      .insert({
        user_id: user.id,
        action: "soap_note_update",
        resource_type: "soap_note",
        resource_id: noteId,
        details: {
          updated_fields: Object.keys(updateFields),
        },
      })
      .then(({ error }) => {
        if (error) console.warn("[soap:update] 監査ログ記録失敗:", error);
      });

    return NextResponse.json({
      success: true,
      data: updated as SoapNoteRow,
    });
  } catch (err) {
    console.error("[soap:update] 予期しないエラー:", err);
    return NextResponse.json(
      { success: false, error: "サーバー内部エラーが発生しました。" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/soap/:noteId — 削除（master のみ）
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ noteId: string }> }
): Promise<NextResponse<DeleteSuccessResponse | ErrorResponse>> {
  try {
    const { noteId } = await params;

    if (!noteId) {
      return NextResponse.json(
        { success: false, error: "ノートIDが指定されていません。" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
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

    // ----- 権限チェック: master のみ削除可 -----
    const role = await getUserRole(supabase, user.id);
    if (role !== "master") {
      return NextResponse.json(
        { success: false, error: "SOAPノートの削除はマスター管理者のみ実行できます。" },
        { status: 403 }
      );
    }

    // ----- 存在確認 -----
    const { data: existingNote, error: fetchError } = await supabase
      .from("soap_notes")
      .select("id, athlete_id")
      .eq("id", noteId)
      .single();

    if (fetchError || !existingNote) {
      return NextResponse.json(
        { success: false, error: "SOAPノートが見つからないか、アクセス権がありません。" },
        { status: 404 }
      );
    }

    // ----- 削除実行 -----
    const { error: deleteError } = await supabase
      .from("soap_notes")
      .delete()
      .eq("id", noteId);

    if (deleteError) {
      console.error("[soap:delete] 削除エラー:", deleteError);
      return NextResponse.json(
        { success: false, error: "SOAPノートの削除に失敗しました。" },
        { status: 500 }
      );
    }

    // ----- 監査ログ記録 -----
    await supabase
      .from("audit_logs")
      .insert({
        user_id: user.id,
        action: "soap_note_delete",
        resource_type: "soap_note",
        resource_id: noteId,
        details: {
          athlete_id: existingNote.athlete_id,
        },
      })
      .then(({ error }) => {
        if (error) console.warn("[soap:delete] 監査ログ記録失敗:", error);
      });

    return NextResponse.json({
      success: true,
      message: "SOAPノートを削除しました。",
    });
  } catch (err) {
    console.error("[soap:delete] 予期しないエラー:", err);
    return NextResponse.json(
      { success: false, error: "サーバー内部エラーが発生しました。" },
      { status: 500 }
    );
  }
}

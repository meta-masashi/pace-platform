/**
 * PACE Platform — SOAPノート個別操作 API
 *
 * GET    /api/soap/:noteId — 個別取得
 * PATCH  /api/soap/:noteId — 更新（作成者または master のみ）
 * DELETE /api/soap/:noteId — 削除（master のみ）
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withApiHandler, ApiError } from "@/lib/api/handler";

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

export const GET = withApiHandler(async (_req, ctx) => {
  const { noteId } = ctx.params;

  if (!noteId) {
    throw new ApiError(400, "ノートIDが指定されていません。");
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new ApiError(401, "認証が必要です。ログインしてください。");
  }

  const { data: note, error: fetchError } = await supabase
    .from("soap_notes")
    .select("*")
    .eq("id", noteId)
    .single();

  if (fetchError || !note) {
    throw new ApiError(404, "SOAPノートが見つからないか、アクセス権がありません。");
  }

  return NextResponse.json({
    success: true,
    data: note as SoapNoteRow,
  });
}, { service: 'soap' });

// ---------------------------------------------------------------------------
// PATCH /api/soap/:noteId — 更新（作成者または master のみ）
// ---------------------------------------------------------------------------

interface UpdateSoapBody {
  sText?: string;
  oText?: string;
  aText?: string;
  pText?: string;
}

export const PATCH = withApiHandler(async (req, ctx) => {
  const { noteId } = ctx.params;

  if (!noteId) {
    throw new ApiError(400, "ノートIDが指定されていません。");
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new ApiError(401, "認証が必要です。ログインしてください。");
  }

  // ----- 既存ノート取得 -----
  const { data: existingNote, error: fetchError } = await supabase
    .from("soap_notes")
    .select("*")
    .eq("id", noteId)
    .single();

  if (fetchError || !existingNote) {
    throw new ApiError(404, "SOAPノートが見つからないか、アクセス権がありません。");
  }

  // ----- 権限チェック: 作成者または master のみ編集可 -----
  const role = await getUserRole(supabase, user.id);
  const isCreator = existingNote.staff_id === user.id;
  const isMaster = role === "master";

  if (!isCreator && !isMaster) {
    throw new ApiError(403, "このノートを編集する権限がありません。作成者またはマスター管理者のみ編集できます。");
  }

  // ----- リクエストボディパース -----
  let body: UpdateSoapBody;
  try {
    body = (await req.json()) as UpdateSoapBody;
  } catch {
    throw new ApiError(400, "リクエストボディのJSONパースに失敗しました。");
  }

  // ----- バリデーション -----
  const updateFields: Record<string, string> = {};

  if (body.sText !== undefined) {
    if (body.sText.length < 10) {
      throw new ApiError(400, "主観的所見（S）は10文字以上必要です。");
    }
    updateFields.s_text = body.sText;
  }
  if (body.oText !== undefined) {
    if (body.oText.length < 10) {
      throw new ApiError(400, "客観的所見（O）は10文字以上必要です。");
    }
    updateFields.o_text = body.oText;
  }
  if (body.aText !== undefined) {
    if (body.aText.length < 10) {
      throw new ApiError(400, "評価（A）は10文字以上必要です。");
    }
    updateFields.a_text = body.aText;
  }
  if (body.pText !== undefined) {
    if (body.pText.length < 10) {
      throw new ApiError(400, "計画（P）は10文字以上必要です。");
    }
    updateFields.p_text = body.pText;
  }

  if (Object.keys(updateFields).length === 0) {
    throw new ApiError(400, "更新するフィールドが指定されていません。");
  }

  // ----- 更新実行 -----
  const { data: updated, error: updateError } = await supabase
    .from("soap_notes")
    .update(updateFields)
    .eq("id", noteId)
    .select("*")
    .single();

  if (updateError || !updated) {
    ctx.log.error("更新エラー", { detail: updateError });
    throw new ApiError(500, "SOAPノートの更新に失敗しました。");
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
      if (error) ctx.log.warn("監査ログ記録失敗", { detail: error });
    });

  return NextResponse.json({
    success: true,
    data: updated as SoapNoteRow,
  });
}, { service: 'soap' });

// ---------------------------------------------------------------------------
// DELETE /api/soap/:noteId — 削除（master のみ）
// ---------------------------------------------------------------------------

export const DELETE = withApiHandler(async (_req, ctx) => {
  const { noteId } = ctx.params;

  if (!noteId) {
    throw new ApiError(400, "ノートIDが指定されていません。");
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new ApiError(401, "認証が必要です。ログインしてください。");
  }

  // ----- 権限チェック: master のみ削除可 -----
  const role = await getUserRole(supabase, user.id);
  if (role !== "master") {
    throw new ApiError(403, "SOAPノートの削除はマスター管理者のみ実行できます。");
  }

  // ----- 存在確認 -----
  const { data: existingNote, error: fetchError } = await supabase
    .from("soap_notes")
    .select("id, athlete_id")
    .eq("id", noteId)
    .single();

  if (fetchError || !existingNote) {
    throw new ApiError(404, "SOAPノートが見つからないか、アクセス権がありません。");
  }

  // ----- 削除実行 -----
  const { error: deleteError } = await supabase
    .from("soap_notes")
    .delete()
    .eq("id", noteId);

  if (deleteError) {
    ctx.log.error("削除エラー", { detail: deleteError });
    throw new ApiError(500, "SOAPノートの削除に失敗しました。");
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
      if (error) ctx.log.warn("監査ログ記録失敗", { detail: error });
    });

  return NextResponse.json({
    success: true,
    message: "SOAPノートを削除しました。",
  });
}, { service: 'soap' });

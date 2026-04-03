/**
 * PACE Platform — SOAPノート一覧取得・新規作成 API
 *
 * GET  /api/soap?athleteId=xxx&limit=20&offset=0
 * POST /api/soap
 *
 * 認可: AT, PT, master ロール
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withApiHandler, ApiError } from "@/lib/api/handler";
import {
  validateUUID,
  validatePagination,
  sanitizeString,
} from "@/lib/security/input-validator";
import { logAuditEvent } from "@/lib/security/audit-logger";

// ---------------------------------------------------------------------------
// レスポンス型定義
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
// GET /api/soap — SOAPノート一覧取得
// ---------------------------------------------------------------------------

export const GET = withApiHandler(async (req, ctx) => {
  const { searchParams } = new URL(req.url);
  const athleteId = searchParams.get("athleteId");
  const pagination = validatePagination({
    limit: Number(searchParams.get("limit") ?? 20),
    offset: Number(searchParams.get("offset") ?? 0),
  });
  const { limit, offset } = pagination;

  if (!athleteId || !validateUUID(athleteId)) {
    throw new ApiError(400, "有効な athleteId パラメータが必要です。");
  }

  // ----- 認証チェック -----
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new ApiError(401, "認証が必要です。ログインしてください。");
  }

  // ----- SOAPノート取得（RLS で org_id フィルタリング）-----
  const { data: notes, error: fetchError, count } = await supabase
    .from("soap_notes")
    .select("*, staff:staff_id(name)", { count: "exact" })
    .eq("athlete_id", athleteId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (fetchError) {
    ctx.log.error("取得エラー", { detail: fetchError });
    throw new ApiError(500, "SOAPノートの取得に失敗しました。");
  }

  return NextResponse.json({
    success: true,
    data: {
      notes: (notes ?? []) as SoapNoteRow[],
      total: count ?? 0,
    },
  });
}, { service: 'soap' });

// ---------------------------------------------------------------------------
// POST /api/soap — SOAPノート新規作成
// ---------------------------------------------------------------------------

interface CreateSoapBody {
  athleteId: string;
  sText: string;
  oText: string;
  aText: string;
  pText: string;
  aiAssisted: boolean;
}

function validateCreateBody(body: unknown): body is CreateSoapBody {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;

  return (
    typeof b.athleteId === "string" &&
    validateUUID(b.athleteId) &&
    typeof b.sText === "string" &&
    b.sText.length >= 10 &&
    typeof b.oText === "string" &&
    b.oText.length >= 10 &&
    typeof b.aText === "string" &&
    b.aText.length >= 10 &&
    typeof b.pText === "string" &&
    b.pText.length >= 10 &&
    typeof b.aiAssisted === "boolean"
  );
}

export const POST = withApiHandler(async (req, ctx) => {
  // ----- 認証チェック -----
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new ApiError(401, "認証が必要です。ログインしてください。");
  }

  // ----- リクエストボディのパースとバリデーション -----
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, "リクエストボディのJSONパースに失敗しました。");
  }

  if (!validateCreateBody(body)) {
    throw new ApiError(
      400,
      "入力データが不正です。athleteId, sText, oText, aText, pText（各10文字以上）, aiAssisted を正しく指定してください。"
    );
  }

  // ----- アスリートのアクセス確認（RLS で保護）-----
  const { data: athlete, error: athleteError } = await supabase
    .from("athletes")
    .select("id")
    .eq("id", body.athleteId)
    .single();

  if (athleteError || !athlete) {
    throw new ApiError(403, "指定されたアスリートが見つからないか、アクセス権がありません。");
  }

  // ----- SOAPノート作成（テキスト入力をサニタイズ） -----
  const { data: note, error: insertError } = await supabase
    .from("soap_notes")
    .insert({
      athlete_id: body.athleteId,
      staff_id: user.id,
      s_text: sanitizeString(body.sText, 5000),
      o_text: sanitizeString(body.oText, 5000),
      a_text: sanitizeString(body.aText, 5000),
      p_text: sanitizeString(body.pText, 5000),
      ai_assisted: body.aiAssisted,
    })
    .select("*")
    .single();

  if (insertError || !note) {
    ctx.log.error("作成エラー", { detail: insertError });
    throw new ApiError(500, "SOAPノートの作成に失敗しました。");
  }

  // ----- 監査ログ記録 -----
  await logAuditEvent(supabase, {
    action: 'soap_note_create',
    targetType: 'soap_note',
    targetId: note.id as string,
    details: {
      athlete_id: body.athleteId,
      ai_assisted: body.aiAssisted,
    },
  });

  return NextResponse.json({
    success: true,
    data: note as SoapNoteRow,
  });
}, { service: 'soap' });

/**
 * PACE v6.0 — P1/P2 アラート承認 API
 *
 * POST /api/pipeline/acknowledge — P1/P2 アラートの承認処理
 *
 * 認証済みスタッフが P1/P2 判定に対して承認/修正/却下/オーバーライドを記録する。
 * inference_trace_logs テーブルの acknowledged_* フィールドを更新する。
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateUUID, sanitizeString } from '@/lib/security/input-validator';
import { withApiHandler, ApiError } from '@/lib/api/handler';

// ---------------------------------------------------------------------------
// POST /api/pipeline/acknowledge
// ---------------------------------------------------------------------------

const VALID_ACTIONS = ['approved', 'modified', 'rejected', 'override'] as const;
type AcknowledgeAction = (typeof VALID_ACTIONS)[number];

export const POST = withApiHandler(async (req, ctx) => {
  const supabase = await createClient();

  // ----- 認証チェック -----
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new ApiError(401, '認証が必要です。ログインしてください。');
  }

  // ----- スタッフ確認 -----
  const { data: staff, error: staffError } = await supabase
    .from('staff')
    .select('id, org_id, name')
    .eq('id', user.id)
    .single();

  if (staffError || !staff) {
    throw new ApiError(403, 'スタッフプロファイルが見つかりません。');
  }

  // ----- リクエストボディ -----
  let body: {
    traceId: string;
    action: AcknowledgeAction;
    notes?: string;
  };
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, 'リクエストボディのJSONパースに失敗しました。');
  }

  if (!body.traceId || !body.action) {
    throw new ApiError(400, 'traceId と action は必須です。');
  }

  if (!validateUUID(body.traceId)) {
    throw new ApiError(400, 'traceId の形式が不正です。');
  }

  if (!VALID_ACTIONS.includes(body.action)) {
    throw new ApiError(400, `action は ${VALID_ACTIONS.join(', ')} のいずれかを指定してください。`);
  }

  // 修正/却下/オーバーライドの場合は notes が必須
  if (['modified', 'rejected', 'override'].includes(body.action) && !body.notes) {
    throw new ApiError(400, '修正・却下・オーバーライドの場合は notes が必須です。');
  }

  // ----- トレースログ存在確認（同一組織） -----
  const { data: trace, error: traceError } = await supabase
    .from('inference_trace_logs')
    .select('trace_id, org_id')
    .eq('trace_id', body.traceId)
    .eq('org_id', staff.org_id)
    .single();

  if (traceError || !trace) {
    throw new ApiError(404, '指定されたトレースログが見つかりません。');
  }

  // ----- 承認情報を更新 -----
  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('inference_trace_logs')
    .update({
      acknowledged_by: staff.id,
      acknowledged_at: now,
      acknowledge_action: body.action,
      acknowledge_notes: body.notes ? sanitizeString(body.notes, 2000) : null,
      acknowledged_staff_name: (staff.name as string) ?? '',
    })
    .eq('trace_id', body.traceId);

  if (updateError) {
    ctx.log.error('更新エラー', { detail: updateError });
    throw new ApiError(500, '承認情報の更新に失敗しました。');
  }

  return NextResponse.json({
    success: true,
    data: {
      traceId: body.traceId,
      action: body.action,
      acknowledgedBy: staff.id,
      acknowledgedAt: now,
      staffName: (staff.name as string) ?? '',
    },
  });
}, { service: 'pipeline' });

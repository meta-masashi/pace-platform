/**
 * PACE v6.0 — 推論トレースログ取得 API
 *
 * GET /api/pipeline/trace/[traceId] — 特定のトレースログを取得する
 *
 * 認証済みスタッフ（同一組織）のみ取得可能。
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateUUID } from '@/lib/security/input-validator';
import { withApiHandler, ApiError } from '@/lib/api/handler';

// ---------------------------------------------------------------------------
// GET /api/pipeline/trace/[traceId]
// ---------------------------------------------------------------------------

export const GET = withApiHandler(async (_req, ctx) => {
  const traceId = ctx.params.traceId ?? '';
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
    .select('id, org_id')
    .eq('id', user.id)
    .single();

  if (staffError || !staff) {
    throw new ApiError(403, 'スタッフプロファイルが見つかりません。');
  }

  // ----- traceId バリデーション -----
  if (!validateUUID(traceId)) {
    throw new ApiError(400, 'traceId の形式が不正です。');
  }

  // ----- トレースログ取得 -----
  const { data: trace, error: traceError } = await supabase
    .from('inference_trace_logs')
    .select('*')
    .eq('trace_id', traceId)
    .eq('org_id', staff.org_id)
    .single();

  if (traceError || !trace) {
    throw new ApiError(404, '指定されたトレースログが見つかりません。');
  }

  return NextResponse.json({ success: true, data: trace });
}, { service: 'pipeline' });

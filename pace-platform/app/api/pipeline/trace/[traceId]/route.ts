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

// ---------------------------------------------------------------------------
// GET /api/pipeline/trace/[traceId]
// ---------------------------------------------------------------------------

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ traceId: string }> },
) {
  try {
    const { traceId } = await params;
    const supabase = await createClient();

    // ----- 認証チェック -----
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: '認証が必要です。ログインしてください。' },
        { status: 401 },
      );
    }

    // ----- スタッフ確認 -----
    const { data: staff, error: staffError } = await supabase
      .from('staff')
      .select('id, org_id')
      .eq('id', user.id)
      .single();

    if (staffError || !staff) {
      return NextResponse.json(
        { success: false, error: 'スタッフプロファイルが見つかりません。' },
        { status: 403 },
      );
    }

    // ----- traceId バリデーション -----
    if (!validateUUID(traceId)) {
      return NextResponse.json(
        { success: false, error: 'traceId の形式が不正です。' },
        { status: 400 },
      );
    }

    // ----- トレースログ取得 -----
    const { data: trace, error: traceError } = await supabase
      .from('inference_trace_logs')
      .select('*')
      .eq('trace_id', traceId)
      .eq('org_id', staff.org_id)
      .single();

    if (traceError || !trace) {
      return NextResponse.json(
        { success: false, error: '指定されたトレースログが見つかりません。' },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: trace });
  } catch (err) {
    console.error('[pipeline/trace:GET] 予期しないエラー:', err);
    return NextResponse.json(
      { success: false, error: 'サーバー内部エラーが発生しました。' },
      { status: 500 },
    );
  }
}

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

// ---------------------------------------------------------------------------
// POST /api/pipeline/acknowledge
// ---------------------------------------------------------------------------

const VALID_ACTIONS = ['approved', 'modified', 'rejected', 'override'] as const;
type AcknowledgeAction = (typeof VALID_ACTIONS)[number];

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
        { success: false, error: '認証が必要です。ログインしてください。' },
        { status: 401 },
      );
    }

    // ----- スタッフ確認 -----
    const { data: staff, error: staffError } = await supabase
      .from('staff')
      .select('id, org_id, name')
      .eq('id', user.id)
      .single();

    if (staffError || !staff) {
      return NextResponse.json(
        { success: false, error: 'スタッフプロファイルが見つかりません。' },
        { status: 403 },
      );
    }

    // ----- リクエストボディ -----
    let body: {
      traceId: string;
      action: AcknowledgeAction;
      notes?: string;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'リクエストボディのJSONパースに失敗しました。' },
        { status: 400 },
      );
    }

    if (!body.traceId || !body.action) {
      return NextResponse.json(
        { success: false, error: 'traceId と action は必須です。' },
        { status: 400 },
      );
    }

    if (!validateUUID(body.traceId)) {
      return NextResponse.json(
        { success: false, error: 'traceId の形式が不正です。' },
        { status: 400 },
      );
    }

    if (!VALID_ACTIONS.includes(body.action)) {
      return NextResponse.json(
        {
          success: false,
          error: `action は ${VALID_ACTIONS.join(', ')} のいずれかを指定してください。`,
        },
        { status: 400 },
      );
    }

    // 修正/却下/オーバーライドの場合は notes が必須
    if (['modified', 'rejected', 'override'].includes(body.action) && !body.notes) {
      return NextResponse.json(
        { success: false, error: '修正・却下・オーバーライドの場合は notes が必須です。' },
        { status: 400 },
      );
    }

    // ----- トレースログ存在確認（同一組織） -----
    const { data: trace, error: traceError } = await supabase
      .from('inference_trace_logs')
      .select('trace_id, org_id')
      .eq('trace_id', body.traceId)
      .eq('org_id', staff.org_id)
      .single();

    if (traceError || !trace) {
      return NextResponse.json(
        { success: false, error: '指定されたトレースログが見つかりません。' },
        { status: 404 },
      );
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
      console.error('[pipeline/acknowledge:POST] 更新エラー:', updateError);
      return NextResponse.json(
        { success: false, error: '承認情報の更新に失敗しました。' },
        { status: 500 },
      );
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
  } catch (err) {
    console.error('[pipeline/acknowledge:POST] 予期しないエラー:', err);
    return NextResponse.json(
      { success: false, error: 'サーバー内部エラーが発生しました。' },
      { status: 500 },
    );
  }
}

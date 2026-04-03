/**
 * PACE Platform — リルート提案管理 API
 *
 * GET   /api/reroute/proposals?programId=xxx — pending 提案を取得
 * PATCH /api/reroute/proposals — 提案を承認/却下
 *
 * 承認時: rehab_programs.estimated_rtp_date を更新する。
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ---------------------------------------------------------------------------
// GET /api/reroute/proposals
// ---------------------------------------------------------------------------

/**
 * 指定プログラムの pending リルート提案を取得する。
 *
 * @query programId - 対象リハビリプログラムID（必須）
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const programId = searchParams.get('programId');

    if (!programId) {
      return NextResponse.json(
        { success: false, error: 'programId クエリパラメータは必須です。' },
        { status: 400 },
      );
    }

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

    // ----- スタッフ権限チェック -----
    const { data: staff } = await supabase
      .from('staff')
      .select('id, org_id, role')
      .eq('id', user.id)
      .single();

    if (!staff) {
      return NextResponse.json(
        { success: false, error: '権限がありません' },
        { status: 403 },
      );
    }

    // ----- プログラムの org_id 確認 -----
    const { data: program } = await supabase
      .from('rehab_programs')
      .select('id, athletes!inner(org_id)')
      .eq('id', programId)
      .eq('athletes.org_id', staff.org_id)
      .single();

    if (!program) {
      return NextResponse.json(
        { success: false, error: '権限がありません' },
        { status: 403 },
      );
    }

    // ----- pending 提案取得 -----
    const { data: proposals, error: fetchError } = await supabase
      .from('reroute_proposals')
      .select('id, program_id, athlete_id, detection, adjustments, new_estimated_rts, nlg_text, status, created_at')
      .eq('program_id', programId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (fetchError) {
      console.error('[reroute:proposals:GET] 取得エラー:', fetchError);
      return NextResponse.json(
        { success: false, error: 'リルート提案の取得に失敗しました。' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      data: proposals ?? [],
    });
  } catch (err) {
    console.error('[reroute:proposals:GET] 予期しないエラー:', err);
    return NextResponse.json(
      { success: false, error: 'サーバー内部エラーが発生しました。' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/reroute/proposals
// ---------------------------------------------------------------------------

/**
 * リルート提案を承認または却下する。
 *
 * 承認時: rehab_programs.estimated_rtp_date を新しい予定日に更新する。
 *
 * @body { proposalId: string, action: 'approve' | 'reject' }
 */
export async function PATCH(request: Request) {
  try {
    let body: { proposalId: string; action: 'approve' | 'reject' };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'リクエストボディのJSONパースに失敗しました。' },
        { status: 400 },
      );
    }

    if (!body.proposalId || !['approve', 'reject'].includes(body.action)) {
      return NextResponse.json(
        { success: false, error: 'proposalId と action (approve/reject) は必須です。' },
        { status: 400 },
      );
    }

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

    // ----- スタッフ権限チェック -----
    const { data: staff } = await supabase
      .from('staff')
      .select('id, org_id, role')
      .eq('id', user.id)
      .single();

    if (!staff) {
      return NextResponse.json(
        { success: false, error: '権限がありません' },
        { status: 403 },
      );
    }

    if (!['doctor', 'physio', 'head_trainer', 'trainer', 'admin'].includes(staff.role)) {
      return NextResponse.json(
        { success: false, error: 'この操作を行う権限がありません。' },
        { status: 403 },
      );
    }

    // ----- 提案取得 (org_id スコープ) -----
    const { data: proposal, error: fetchError } = await supabase
      .from('reroute_proposals')
      .select('id, program_id, new_estimated_rts, status, adjustments, athlete_id')
      .eq('id', body.proposalId)
      .single();

    if (fetchError || !proposal) {
      return NextResponse.json(
        { success: false, error: 'リルート提案が見つかりません。' },
        { status: 404 },
      );
    }

    // ----- org_id 所属確認 -----
    const { data: proposalAthlete } = await supabase
      .from('athletes')
      .select('org_id')
      .eq('id', proposal.athlete_id)
      .single();

    if (!proposalAthlete || proposalAthlete.org_id !== staff.org_id) {
      return NextResponse.json(
        { success: false, error: '権限がありません' },
        { status: 403 },
      );
    }

    if (proposal.status !== 'pending') {
      return NextResponse.json(
        { success: false, error: 'この提案はすでに処理済みです。' },
        { status: 400 },
      );
    }

    const newStatus = body.action === 'approve' ? 'approved' : 'rejected';

    // ----- 提案ステータス更新 -----
    const { error: updateError } = await supabase
      .from('reroute_proposals')
      .update({
        status: newStatus,
        approved_by: user.id,
      })
      .eq('id', body.proposalId);

    if (updateError) {
      console.error('[reroute:proposals:PATCH] 更新エラー:', updateError);
      return NextResponse.json(
        { success: false, error: 'リルート提案の更新に失敗しました。' },
        { status: 500 },
      );
    }

    // ----- 承認時: プログラムの RTS 日を更新 -----
    if (body.action === 'approve' && proposal.new_estimated_rts) {
      const { error: programUpdateError } = await supabase
        .from('rehab_programs')
        .update({ estimated_rtp_date: proposal.new_estimated_rts })
        .eq('id', proposal.program_id);

      if (programUpdateError) {
        console.error('[reroute:proposals:PATCH] プログラム更新エラー:', programUpdateError);
        // 提案は承認済みだが、プログラム更新に失敗
        return NextResponse.json(
          {
            success: true,
            data: { proposalId: body.proposalId, status: newStatus },
            warning: 'プログラムの復帰予定日の更新に失敗しました。手動で更新してください。',
          },
        );
      }

      // 監査ログ
      await supabase
        .from('audit_logs')
        .insert({
          user_id: user.id,
          action: 'reroute_approved',
          resource_type: 'reroute_proposal',
          resource_id: body.proposalId,
          details: {
            program_id: proposal.program_id,
            new_estimated_rts: proposal.new_estimated_rts,
            adjustments: proposal.adjustments,
          },
        })
        .then(({ error }) => {
          if (error) console.warn('[reroute:proposals:PATCH] 監査ログ記録失敗:', error);
        });
    }

    return NextResponse.json({
      success: true,
      data: {
        proposalId: body.proposalId,
        status: newStatus,
      },
    });
  } catch (err) {
    console.error('[reroute:proposals:PATCH] 予期しないエラー:', err);
    return NextResponse.json(
      { success: false, error: 'サーバー内部エラーが発生しました。' },
      { status: 500 },
    );
  }
}

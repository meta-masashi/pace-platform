/**
 * POST /api/assessment/conditioning/save
 *
 * コンディショニングアセスメントの保存。
 * ドラフト保存（下書き）と確定保存の両方に対応。
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateUUID } from '@/lib/security/input-validator';

// ---------------------------------------------------------------------------
// リクエストボディ型
// ---------------------------------------------------------------------------

interface SaveConditioningAssessmentBody {
  /** 既存アセスメントID（更新時） */
  assessmentId?: string;
  athleteId: string;
  /** パイプライントレースID */
  traceId?: string;
  pipelineDecision?: string;
  pipelinePriority?: string;
  /** 3軸分析結果（フロントエンドから送信されたスナップショット） */
  loadAnalysis?: Record<string, unknown>;
  efficiencyAnalysis?: Record<string, unknown>;
  painAnalysis?: Record<string, unknown>;
  /** 総合評価 */
  riskCategory?: string;
  staffNotes?: string;
  /** AI補助結果 */
  aiSuggestion?: Record<string, unknown>;
  aiAdopted?: boolean;
  /** シミュレータ結果 */
  selectedScenario?: Record<string, unknown>;
  simulationParams?: Record<string, unknown>;
  /** 特徴量スナップショット */
  featureSnapshot?: Record<string, unknown>;
  /** ステータス: draft | completed */
  status?: 'draft' | 'completed';
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // 認証チェック
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: '認証が必要です。' },
        { status: 401 },
      );
    }

    // スタッフ確認
    const { data: staff } = await supabase
      .from('staff')
      .select('id, org_id, role')
      .eq('id', user.id)
      .single();

    if (!staff) {
      return NextResponse.json(
        { success: false, error: 'スタッフプロファイルが見つかりません。' },
        { status: 403 },
      );
    }

    // ロール確認（AT, PT, master のみ）
    const allowedRoles = ['AT', 'PT', 'master'];
    if (!allowedRoles.includes(staff.role as string)) {
      return NextResponse.json(
        { success: false, error: 'アセスメントの保存権限がありません。' },
        { status: 403 },
      );
    }

    // リクエストボディ
    let body: SaveConditioningAssessmentBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'リクエストボディのパースに失敗しました。' },
        { status: 400 },
      );
    }

    if (!body.athleteId) {
      return NextResponse.json(
        { success: false, error: 'athleteId は必須です。' },
        { status: 400 },
      );
    }

    if (!validateUUID(body.athleteId)) {
      return NextResponse.json(
        { success: false, error: 'athleteId の形式が不正です。' },
        { status: 400 },
      );
    }

    // 選手の組織一致確認
    const { data: athlete } = await supabase
      .from('athletes')
      .select('id, org_id')
      .eq('id', body.athleteId)
      .eq('org_id', staff.org_id)
      .single();

    if (!athlete) {
      return NextResponse.json(
        { success: false, error: '選手が見つかりません。' },
        { status: 404 },
      );
    }

    // risk_category バリデーション
    const validCategories = ['overreaching', 'accumulated_fatigue', 'pain_management', 'observation'];
    if (body.riskCategory && !validCategories.includes(body.riskCategory)) {
      return NextResponse.json(
        { success: false, error: '無効な risk_category です。' },
        { status: 400 },
      );
    }

    const status = body.status ?? 'draft';
    const now = new Date().toISOString();

    const assessmentData = {
      athlete_id: body.athleteId,
      org_id: staff.org_id as string,
      staff_id: staff.id as string,
      trace_id: body.traceId ?? null,
      pipeline_decision: body.pipelineDecision ?? null,
      pipeline_priority: body.pipelinePriority ?? null,
      load_analysis: body.loadAnalysis ?? {},
      efficiency_analysis: body.efficiencyAnalysis ?? {},
      pain_analysis: body.painAnalysis ?? {},
      risk_category: body.riskCategory ?? null,
      staff_notes: body.staffNotes ?? null,
      ai_suggestion: body.aiSuggestion ?? null,
      ai_adopted: body.aiAdopted ?? false,
      selected_scenario: body.selectedScenario ?? null,
      simulation_params: body.simulationParams ?? null,
      feature_snapshot: body.featureSnapshot ?? null,
      status,
      ...(status === 'completed' ? { completed_at: now } : {}),
    };

    // 既存アセスメントの更新 or 新規作成
    if (body.assessmentId && validateUUID(body.assessmentId)) {
      // 更新
      const { data: updated, error: updateError } = await supabase
        .from('conditioning_assessments')
        .update(assessmentData)
        .eq('id', body.assessmentId)
        .eq('org_id', staff.org_id)
        .select('id, status, created_at, updated_at')
        .single();

      if (updateError) {
        console.error('[assessment/conditioning/save:POST] 更新エラー:', updateError);
        return NextResponse.json(
          { success: false, error: 'アセスメントの更新に失敗しました。' },
          { status: 500 },
        );
      }

      return NextResponse.json({
        success: true,
        data: { assessmentId: updated.id, status: updated.status, action: 'updated' },
      });
    } else {
      // 新規作成
      const { data: created, error: createError } = await supabase
        .from('conditioning_assessments')
        .insert(assessmentData)
        .select('id, status, created_at')
        .single();

      if (createError) {
        console.error('[assessment/conditioning/save:POST] 作成エラー:', createError);
        return NextResponse.json(
          { success: false, error: 'アセスメントの作成に失敗しました。' },
          { status: 500 },
        );
      }

      return NextResponse.json(
        {
          success: true,
          data: { assessmentId: created.id, status: created.status, action: 'created' },
        },
        { status: 201 },
      );
    }
  } catch (err) {
    console.error('[assessment/conditioning/save:POST] エラー:', err);
    return NextResponse.json(
      {
        success: false,
        error: 'アセスメントの保存に失敗しました。',
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/assessment/:assessmentId/answer
 *
 * 回答を送信し、ベイズ事後確率を更新して次の質問を返す。
 * Body: { nodeId: string, answer: "yes" | "no" | "unknown" }
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  updatePosteriors,
  selectNextQuestion,
  checkRedFlags,
  shouldTerminate,
  buildAssessmentResult,
} from '@/lib/assessment';
import type {
  AnswerValue,
  AssessmentNode,
  AnswerAssessmentResponse,
  AssessmentErrorResponse,
  AssessmentResponse,
} from '@/lib/assessment/types';

interface AnswerRequestBody {
  nodeId: string;
  answer: AnswerValue;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ assessmentId: string }> },
): Promise<NextResponse<AnswerAssessmentResponse | AssessmentErrorResponse>> {
  try {
    const { assessmentId } = await params;

    // ----- 認証 -----
    const supabase = await createClient();
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

    // ----- リクエストボディ -----
    let body: AnswerRequestBody;
    try {
      body = (await request.json()) as AnswerRequestBody;
    } catch {
      return NextResponse.json(
        { success: false, error: 'JSONパースエラー。' },
        { status: 400 },
      );
    }

    if (
      !body.nodeId ||
      !body.answer ||
      !['yes', 'no', 'unknown'].includes(body.answer)
    ) {
      return NextResponse.json(
        { success: false, error: 'nodeId と answer (yes/no/unknown) は必須です。' },
        { status: 400 },
      );
    }

    // ----- セッション取得 -----
    const { data: sessionRow, error: sessionError } = await supabase
      .from('assessment_sessions')
      .select('*')
      .eq('id', assessmentId)
      .single();

    if (sessionError || !sessionRow) {
      return NextResponse.json(
        { success: false, error: 'セッションが見つかりません。' },
        { status: 404 },
      );
    }

    if (sessionRow.status !== 'in_progress') {
      return NextResponse.json(
        { success: false, error: 'このセッションは既に完了しています。' },
        { status: 400 },
      );
    }

    // ----- 回答を保存 -----
    const now = new Date().toISOString();
    const { error: insertError } = await supabase
      .from('assessment_responses')
      .insert({
        session_id: assessmentId,
        node_id: body.nodeId,
        answer: body.answer,
        answered_at: now,
      });

    if (insertError) {
      console.error('[assessment:answer] 回答保存エラー:', insertError);
      return NextResponse.json(
        { success: false, error: '回答の保存に失敗しました。' },
        { status: 500 },
      );
    }

    // ----- 回答済みの全ノードを取得 -----
    const { data: responseRows } = await supabase
      .from('assessment_responses')
      .select('node_id, answer, answered_at')
      .eq('session_id', assessmentId)
      .order('answered_at', { ascending: true });

    const responses: AssessmentResponse[] = (responseRows ?? []).map((r) => ({
      nodeId: r.node_id as string,
      answer: r.answer as AnswerValue,
      timestamp: r.answered_at as string,
    }));

    // ----- 該当ノードを取得 -----
    const answeredNodeId = body.nodeId;
    const { data: nodeRow } = await supabase
      .from('assessment_nodes')
      .select('*')
      .eq('node_id', answeredNodeId)
      .single();

    // ----- アセスメントノード全体を取得 -----
    const fileTypeFilter =
      sessionRow.assessment_type === 'f1_acute'
        ? 'F1'
        : (sessionRow.assessment_type as string);

    const { data: allNodesRows } = await supabase
      .from('assessment_nodes')
      .select('*')
      .eq('file_type', fileTypeFilter)
      .order('node_id', { ascending: true });

    const allNodes = (allNodesRows ?? []) as AssessmentNode[];

    // ----- 事後確率を更新 -----
    const currentPosteriors = (sessionRow.posteriors as Record<string, number>) ?? {};
    const priorsMap = new Map(Object.entries(currentPosteriors));

    const updatedPosteriors = nodeRow
      ? updatePosteriors(
          priorsMap,
          nodeRow as AssessmentNode,
          body.answer,
        )
      : priorsMap;

    // ----- レッドフラグチェック -----
    const redFlag = nodeRow
      ? checkRedFlags(nodeRow as AssessmentNode, body.answer)
      : null;

    // ----- 完了判定 -----
    const shouldEnd = shouldTerminate(updatedPosteriors, responses.length);

    // ----- 事後確率配列を構築（上位5件）-----
    const posteriorArray = Array.from(updatedPosteriors.entries())
      .map(([code, prob]) => ({
        diagnosisCode: code,
        probability: prob,
        confidence: [0, 0] as [number, number],
        isRedFlag: false,
      }))
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 5);

    // ----- 事後確率をDBに保存 -----
    const posteriorsObj: Record<string, number> = {};
    for (const [key, value] of updatedPosteriors) {
      posteriorsObj[key] = value;
    }

    let nextQuestion = null;
    let assessmentResult = null;
    const terminationReason = shouldEnd;
    const isComplete = terminationReason !== null || (redFlag?.hardLock ?? false);

    if (isComplete) {
      // ----- 完了処理 -----
      const collectedRedFlags = redFlag ? [redFlag] : [];
      const reason = redFlag?.hardLock ? 'red_flag' as const : (terminationReason ?? 'high_confidence' as const);
      assessmentResult = buildAssessmentResult(
        updatedPosteriors,
        responses,
        allNodes,
        collectedRedFlags,
        reason,
      );

      await supabase
        .from('assessment_sessions')
        .update({
          status: redFlag?.hardLock ? 'terminated_red_flag' : 'completed',
          completed_at: now,
          posteriors: posteriorsObj,
          current_node_id: null,
        })
        .eq('id', assessmentId);

      // Save result
      await supabase.from('assessment_results').insert({
        session_id: assessmentId,
        primary_diagnosis: assessmentResult.primaryDiagnosis,
        confidence: assessmentResult.confidence,
        differentials: assessmentResult.differentials,
        red_flags: assessmentResult.redFlags,
        contraindication_tags: assessmentResult.contraindicationTags,
        prescription_tags: assessmentResult.prescriptionTags,
        response_count: assessmentResult.responseCount,
        termination_reason: assessmentResult.terminationReason,
      });
    } else {
      // ----- 次の質問を選択 -----
      nextQuestion = selectNextQuestion(allNodes, responses, updatedPosteriors);

      await supabase
        .from('assessment_sessions')
        .update({
          posteriors: posteriorsObj,
          current_node_id: nextQuestion?.nodeId ?? null,
        })
        .eq('id', assessmentId);
    }

    const progress = Math.min(
      100,
      isComplete ? 100 : (responses.length / Math.max(allNodes.length, 1)) * 100,
    );

    return NextResponse.json({
      success: true,
      data: {
        nextQuestion,
        posteriors: posteriorArray,
        progress,
        isComplete,
        result: assessmentResult,
        redFlag,
      },
    });
  } catch (err) {
    console.error('[assessment:answer] 予期しないエラー:', err);
    return NextResponse.json(
      { success: false, error: 'サーバー内部エラーが発生しました。' },
      { status: 500 },
    );
  }
}

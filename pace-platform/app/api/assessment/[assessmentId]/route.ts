/**
 * PACE Platform — アセスメントステータス取得 API
 *
 * GET /api/assessment/:assessmentId
 *
 * アセスメントセッションの現在の状態・結果を取得する。
 * 進行中のセッションでは全回答履歴と現在の事後確率を、
 * 完了済みのセッションでは最終診断結果を含めて返す。
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateUUID } from "@/lib/security/input-validator";
import type {
  AssessmentSession,
  AssessmentResult,
  AssessmentResponse,
  AnswerValue,
  AssessmentStatusResponse,
  AssessmentErrorResponse,
} from "@/lib/assessment/types";

// ---------------------------------------------------------------------------
// GET /api/assessment/:assessmentId
// ---------------------------------------------------------------------------

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ assessmentId: string }> }
): Promise<NextResponse<AssessmentStatusResponse | AssessmentErrorResponse>> {
  try {
    const { assessmentId } = await params;

    // ----- バリデーション -----
    if (!assessmentId || !validateUUID(assessmentId)) {
      return NextResponse.json(
        { success: false, error: "アセスメントIDが不正です。有効なUUID形式で指定してください。" },
        { status: 400 }
      );
    }

    // ----- 認証チェック -----
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

    // ----- セッション取得（RLS で org_id フィルタリング）-----
    const { data: sessionRow, error: sessionError } = await supabase
      .from("assessment_sessions")
      .select("*")
      .eq("id", assessmentId)
      .single();

    if (sessionError || !sessionRow) {
      return NextResponse.json(
        { success: false, error: "アセスメントセッションが見つからないか、アクセス権がありません。" },
        { status: 404 }
      );
    }

    // ----- 回答履歴を取得 -----
    const { data: responseRows } = await supabase
      .from("assessment_responses")
      .select("node_id, answer, answered_at")
      .eq("session_id", assessmentId)
      .order("answered_at", { ascending: true });

    const responses: AssessmentResponse[] = (responseRows ?? []).map((r) => ({
      nodeId: r.node_id as string,
      answer: r.answer as AnswerValue,
      timestamp: r.answered_at as string,
    }));

    // ----- セッションオブジェクトを構築 -----
    const session: AssessmentSession = {
      id: sessionRow.id as string,
      athleteId: sessionRow.athlete_id as string,
      staffId: sessionRow.staff_id as string,
      assessmentType: sessionRow.assessment_type as AssessmentSession["assessmentType"],
      status: sessionRow.status as AssessmentSession["status"],
      startedAt: sessionRow.started_at as string,
      completedAt: (sessionRow.completed_at as string) ?? null,
      currentNodeId: (sessionRow.current_node_id as string) ?? null,
      responses,
      posteriors: (sessionRow.posteriors as Record<string, number>) ?? {},
      orgId: sessionRow.org_id as string,
    };

    // ----- 完了済みの場合は結果も取得 -----
    let result: AssessmentResult | null = null;

    if (session.status === "completed" || session.status === "terminated_red_flag") {
      const { data: resultRow } = await supabase
        .from("assessment_results")
        .select("*")
        .eq("session_id", assessmentId)
        .single();

      if (resultRow) {
        result = {
          primaryDiagnosis: resultRow.primary_diagnosis as string,
          confidence: resultRow.confidence as number,
          differentials: resultRow.differentials as AssessmentResult["differentials"],
          redFlags: resultRow.red_flags as AssessmentResult["redFlags"],
          contraindicationTags: (resultRow.contraindication_tags as string[]) ?? [],
          prescriptionTags: (resultRow.prescription_tags as string[]) ?? [],
          responseCount: resultRow.response_count as number,
          terminationReason: resultRow.termination_reason as AssessmentResult["terminationReason"],
        };
      }
    }

    // ----- レスポンス -----
    return NextResponse.json({
      success: true,
      data: {
        session,
        result,
      },
    });
  } catch (err) {
    console.error("[assessment:status] 予期しないエラー:", err);
    return NextResponse.json(
      { success: false, error: "サーバー内部エラーが発生しました。" },
      { status: 500 }
    );
  }
}

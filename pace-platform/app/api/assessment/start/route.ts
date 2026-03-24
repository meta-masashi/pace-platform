/**
 * PACE Platform — アセスメント開始 API
 *
 * POST /api/assessment/start
 *
 * 新しいアセスメントセッションを作成し、最初の質問を返す。
 * F1 Acute 評価ノードを assessment_nodes テーブルから取得し、
 * ベース有病率から事前確率を初期化、情報利得最大の質問を選択する。
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withRetry } from "@/lib/shared/retry-handler";
import {
  initializePriors,
  selectNextQuestion,
} from "@/lib/assessment";
import type {
  AssessmentNode,
  AssessmentType,
  StartAssessmentResponse,
  AssessmentErrorResponse,
} from "@/lib/assessment/types";

// ---------------------------------------------------------------------------
// リクエスト型
// ---------------------------------------------------------------------------

interface StartRequestBody {
  athleteId: string;
  assessmentType: AssessmentType;
}

// ---------------------------------------------------------------------------
// バリデーション
// ---------------------------------------------------------------------------

/**
 * リクエストボディのバリデーション。
 */
function validateStartBody(body: unknown): body is StartRequestBody {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;

  return (
    typeof b.athleteId === "string" &&
    b.athleteId.length > 0 &&
    typeof b.assessmentType === "string" &&
    ["f1_acute", "chronic", "performance"].includes(b.assessmentType)
  );
}

// ---------------------------------------------------------------------------
// POST /api/assessment/start
// ---------------------------------------------------------------------------

export async function POST(
  request: Request
): Promise<NextResponse<StartAssessmentResponse | AssessmentErrorResponse>> {
  try {
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

    // ----- リクエストボディのパースとバリデーション -----
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "リクエストボディのJSONパースに失敗しました。" },
        { status: 400 }
      );
    }

    if (!validateStartBody(body)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "入力データが不正です。athleteId（文字列）と assessmentType（'f1_acute' | 'chronic' | 'performance'）を正しく指定してください。",
        },
        { status: 400 }
      );
    }

    // ----- スタッフ権限確認（AT, PT, master のみ）-----
    const { data: staffProfile, error: staffError } = await supabase
      .from("staff_profiles")
      .select("id, org_id, role")
      .eq("user_id", user.id)
      .single();

    if (staffError || !staffProfile) {
      return NextResponse.json(
        {
          success: false,
          error: "スタッフプロファイルが見つかりません。アセスメント実施権限がありません。",
        },
        { status: 403 }
      );
    }

    const allowedRoles = ["AT", "PT", "master"];
    if (!allowedRoles.includes(staffProfile.role as string)) {
      return NextResponse.json(
        {
          success: false,
          error: "アセスメント実施にはAT、PT、またはmaster権限が必要です。",
        },
        { status: 403 }
      );
    }

    // ----- アスリートのアクセス確認（RLS 経由で同組織のスタッフのみ）-----
    const { data: athlete, error: athleteError } = await supabase
      .from("athletes")
      .select("id, org_id")
      .eq("id", body.athleteId)
      .single();

    if (athleteError || !athlete) {
      return NextResponse.json(
        {
          success: false,
          error: "指定されたアスリートが見つからないか、アクセス権がありません。",
        },
        { status: 403 }
      );
    }

    // ----- F1 Acute ノードを取得 -----
    const fileTypeFilter = body.assessmentType === "f1_acute" ? "F1" : body.assessmentType;

    const { result: nodesResult } = await withRetry(
      async () => {
        const { data, error } = await supabase
          .from("assessment_nodes")
          .select("*")
          .eq("file_type", fileTypeFilter)
          .order("node_id", { ascending: true });

        if (error) throw error;
        return data;
      },
      {
        maxRetries: 3,
        baseDelayMs: 200,
        onRetry: (attempt, err) => {
          console.warn(`[assessment:start] ノード取得リトライ attempt=${attempt}:`, err);
        },
      }
    );

    const nodes = (nodesResult ?? []) as AssessmentNode[];

    if (nodes.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: `${body.assessmentType} のアセスメントノードが見つかりません。`,
        },
        { status: 404 }
      );
    }

    // ----- 事前確率を初期化 -----
    const priors = initializePriors(nodes);

    // ----- 最初の質問を選択（情報利得最大）-----
    const firstQuestion = selectNextQuestion(nodes, [], priors);

    if (!firstQuestion) {
      return NextResponse.json(
        { success: false, error: "質問の選択に失敗しました。ノードデータを確認してください。" },
        { status: 500 }
      );
    }

    // ----- セッションレコードを作成 -----
    const priorsObj: Record<string, number> = {};
    for (const [key, value] of priors) {
      priorsObj[key] = value;
    }

    const { result: sessionResult } = await withRetry(
      async () => {
        const { data, error } = await supabase
          .from("assessment_sessions")
          .insert({
            athlete_id: body.athleteId,
            staff_id: staffProfile.id,
            org_id: staffProfile.org_id,
            assessment_type: body.assessmentType,
            status: "in_progress",
            current_node_id: firstQuestion.nodeId,
            posteriors: priorsObj,
            started_at: new Date().toISOString(),
          })
          .select("id")
          .single();

        if (error) throw error;
        return data;
      },
      {
        maxRetries: 3,
        baseDelayMs: 200,
        onRetry: (attempt, err) => {
          console.warn(`[assessment:start] セッション作成リトライ attempt=${attempt}:`, err);
        },
      }
    );

    if (!sessionResult?.id) {
      return NextResponse.json(
        { success: false, error: "アセスメントセッションの作成に失敗しました。" },
        { status: 500 }
      );
    }

    // ----- 監査ログ記録 -----
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "assessment_start",
      resource_type: "assessment_session",
      resource_id: sessionResult.id as string,
      details: {
        athlete_id: body.athleteId,
        assessment_type: body.assessmentType,
        total_nodes: nodes.length,
        first_question_node_id: firstQuestion.nodeId,
      },
    }).then(({ error }) => {
      if (error) console.warn("[assessment:start] 監査ログ記録失敗:", error);
    });

    // ----- レスポンス -----
    return NextResponse.json({
      success: true,
      data: {
        assessmentId: sessionResult.id as string,
        firstQuestion,
        totalNodes: nodes.length,
      },
    });
  } catch (err) {
    console.error("[assessment:start] 予期しないエラー:", err);
    return NextResponse.json(
      { success: false, error: "サーバー内部エラーが発生しました。" },
      { status: 500 }
    );
  }
}

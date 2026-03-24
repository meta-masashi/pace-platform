/**
 * PACE Platform — アセスメント回答送信 API
 *
 * POST /api/assessment/answer
 *
 * アセスメントの回答を受け取り、ベイズ事後確率を更新して次の質問を返す。
 *
 * 処理フロー:
 *   1. 回答を assessment_responses に保存
 *   2. posterior-updater で事後確率を更新
 *   3. レッドフラグチェック（該当時はアスリートロック設定）
 *   4. 終了条件判定
 *   5. 次の質問選択または最終結果返却
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withRetry } from "@/lib/shared/retry-handler";
import {
  updatePosteriors,
  normalizeWithMutualExclusion,
  selectNextQuestion,
  checkRedFlags,
  shouldTerminate,
  buildAssessmentResult,
} from "@/lib/assessment";
import type {
  AssessmentNode,
  AssessmentResponse,
  AnswerValue,
  AnswerAssessmentResponse,
  AssessmentErrorResponse,
  PosteriorResult,
  RedFlagResult,
} from "@/lib/assessment/types";

// ---------------------------------------------------------------------------
// リクエスト型
// ---------------------------------------------------------------------------

interface AnswerRequestBody {
  assessmentId: string;
  nodeId: string;
  answer: AnswerValue;
}

// ---------------------------------------------------------------------------
// バリデーション
// ---------------------------------------------------------------------------

/**
 * リクエストボディのバリデーション。
 */
function validateAnswerBody(body: unknown): body is AnswerRequestBody {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;

  return (
    typeof b.assessmentId === "string" &&
    b.assessmentId.length > 0 &&
    typeof b.nodeId === "string" &&
    b.nodeId.length > 0 &&
    typeof b.answer === "string" &&
    ["yes", "no", "unknown"].includes(b.answer)
  );
}

// ---------------------------------------------------------------------------
// POST /api/assessment/answer
// ---------------------------------------------------------------------------

export async function POST(
  request: Request
): Promise<NextResponse<AnswerAssessmentResponse | AssessmentErrorResponse>> {
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

    if (!validateAnswerBody(body)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "入力データが不正です。assessmentId, nodeId（文字列）, answer（'yes' | 'no' | 'unknown'）を正しく指定してください。",
        },
        { status: 400 }
      );
    }

    // ----- セッション取得 -----
    const { data: session, error: sessionError } = await supabase
      .from("assessment_sessions")
      .select("*")
      .eq("id", body.assessmentId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        { success: false, error: "アセスメントセッションが見つかりません。" },
        { status: 404 }
      );
    }

    if (session.status !== "in_progress") {
      return NextResponse.json(
        { success: false, error: "このアセスメントは既に完了または中止されています。" },
        { status: 400 }
      );
    }

    // ----- アセスメントノードを取得 -----
    const fileTypeFilter =
      (session.assessment_type as string) === "f1_acute" ? "F1" : (session.assessment_type as string);

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
          console.warn(`[assessment:answer] ノード取得リトライ attempt=${attempt}:`, err);
        },
      }
    );

    const nodes = (nodesResult ?? []) as AssessmentNode[];

    // 回答対象ノードを検索
    const targetNode = nodes.find((n) => n.node_id === body.nodeId);
    if (!targetNode) {
      return NextResponse.json(
        { success: false, error: "指定されたノードIDが見つかりません。" },
        { status: 404 }
      );
    }

    // ----- 回答を保存 -----
    const now = new Date().toISOString();

    const { error: responseError } = await supabase
      .from("assessment_responses")
      .insert({
        session_id: body.assessmentId,
        node_id: body.nodeId,
        answer: body.answer,
        question_text: targetNode.question_text,
        answered_at: now,
      });

    if (responseError) {
      console.error("[assessment:answer] 回答保存エラー:", responseError);
      return NextResponse.json(
        { success: false, error: "回答の保存に失敗しました。" },
        { status: 500 }
      );
    }

    // ----- 事後確率を更新 -----
    const currentPosteriors = new Map<string, number>(
      Object.entries((session.posteriors as Record<string, number>) ?? {})
    );

    let updatedPosteriors = updatePosteriors(
      currentPosteriors,
      targetNode,
      body.answer
    );

    // 排他グループ正規化を適用
    updatedPosteriors = normalizeWithMutualExclusion(updatedPosteriors, nodes);

    // ----- レッドフラグチェック -----
    const redFlag = checkRedFlags(targetNode, body.answer);
    const allRedFlags: RedFlagResult[] = [];

    if (redFlag) {
      allRedFlags.push(redFlag);

      // ハードロック対象の場合はアスリートにロックを設定
      if (redFlag.hardLock) {
        await supabase
          .from("athletes")
          .update({
            lock_type: "hard",
            lock_reason: redFlag.description,
            locked_at: now,
            locked_by: user.id,
          })
          .eq("id", session.athlete_id as string)
          .then(({ error }) => {
            if (error) {
              console.error("[assessment:answer] アスリートロック設定失敗:", error);
            }
          });
      }
    }

    // ----- 過去の回答を含む全回答リストを構築 -----
    const { data: allResponseRows } = await supabase
      .from("assessment_responses")
      .select("node_id, answer, answered_at")
      .eq("session_id", body.assessmentId)
      .order("answered_at", { ascending: true });

    const allResponses: AssessmentResponse[] = (allResponseRows ?? []).map(
      (r) => ({
        nodeId: r.node_id as string,
        answer: r.answer as AnswerValue,
        timestamp: r.answered_at as string,
      })
    );

    // ----- 終了条件判定 -----
    const terminationReason = redFlag?.hardLock
      ? ("red_flag" as const)
      : shouldTerminate(
          updatedPosteriors,
          allResponses.length,
          nodes,
          allResponses
        );

    const isComplete = terminationReason !== null;

    // ----- セッション更新 -----
    const posteriorsObj: Record<string, number> = {};
    for (const [key, value] of updatedPosteriors) {
      posteriorsObj[key] = value;
    }

    // 完了時は結果も保存
    let assessmentResultData = null;
    if (isComplete && terminationReason) {
      assessmentResultData = buildAssessmentResult(
        updatedPosteriors,
        allResponses,
        nodes,
        allRedFlags,
        terminationReason
      );

      // assessment_results テーブルに保存
      await withRetry(
        async () => {
          const { error } = await supabase.from("assessment_results").insert({
            session_id: body.assessmentId,
            athlete_id: session.athlete_id,
            org_id: session.org_id,
            primary_diagnosis: assessmentResultData!.primaryDiagnosis,
            confidence: assessmentResultData!.confidence,
            differentials: assessmentResultData!.differentials,
            red_flags: assessmentResultData!.redFlags,
            contraindication_tags: assessmentResultData!.contraindicationTags,
            prescription_tags: assessmentResultData!.prescriptionTags,
            response_count: assessmentResultData!.responseCount,
            termination_reason: assessmentResultData!.terminationReason,
            completed_at: now,
          });
          if (error) throw error;
        },
        {
          maxRetries: 2,
          baseDelayMs: 300,
          onRetry: (attempt, err) => {
            console.warn(`[assessment:answer] 結果保存リトライ attempt=${attempt}:`, err);
          },
        }
      );
    }

    // セッション状態を更新
    const nextQuestion = isComplete
      ? null
      : selectNextQuestion(nodes, allResponses, updatedPosteriors);

    await supabase
      .from("assessment_sessions")
      .update({
        posteriors: posteriorsObj,
        current_node_id: nextQuestion?.nodeId ?? null,
        status: isComplete
          ? terminationReason === "red_flag"
            ? "terminated_red_flag"
            : "completed"
          : "in_progress",
        ...(isComplete ? { completed_at: now } : {}),
      })
      .eq("id", body.assessmentId);

    // ----- 監査ログ記録 -----
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: isComplete ? "assessment_complete" : "assessment_answer",
      resource_type: "assessment_session",
      resource_id: body.assessmentId,
      details: {
        node_id: body.nodeId,
        answer: body.answer,
        response_count: allResponses.length,
        is_complete: isComplete,
        ...(terminationReason ? { termination_reason: terminationReason } : {}),
        ...(redFlag ? { red_flag: redFlag } : {}),
      },
    }).then(({ error }) => {
      if (error) console.warn("[assessment:answer] 監査ログ記録失敗:", error);
    });

    // ----- 上位5件の事後確率を構築 -----
    const topPosteriors = buildTopPosteriors(updatedPosteriors, allRedFlags, allResponses.length);

    // ----- レスポンス -----
    return NextResponse.json({
      success: true,
      data: {
        nextQuestion,
        posteriors: topPosteriors,
        progress: nextQuestion?.progress ?? 100,
        isComplete,
        result: assessmentResultData,
        redFlag: redFlag ?? null,
      },
    });
  } catch (err) {
    console.error("[assessment:answer] 予期しないエラー:", err);
    return NextResponse.json(
      { success: false, error: "サーバー内部エラーが発生しました。" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

/**
 * 上位5件の事後確率をレスポンス形式に変換する。
 */
function buildTopPosteriors(
  posteriors: Map<string, number>,
  redFlags: RedFlagResult[],
  responseCount: number
): PosteriorResult[] {
  const redFlagNodeIds = new Set(redFlags.map((rf) => rf.nodeId));
  const sorted = [...posteriors.entries()].sort(([, a], [, b]) => b - a);

  // ウィルソンスコア区間で簡易 95% CI を計算
  const z = 1.96;
  const n = Math.max(1, responseCount);

  return sorted.slice(0, 5).map(([code, prob]) => {
    const denominator = 1 + (z * z) / n;
    const center = (prob + (z * z) / (2 * n)) / denominator;
    const margin =
      (z / denominator) *
      Math.sqrt((prob * (1 - prob)) / n + (z * z) / (4 * n * n));

    return {
      diagnosisCode: code,
      probability: prob,
      confidence: [Math.max(0, center - margin), Math.min(1, center + margin)] as [
        number,
        number,
      ],
      isRedFlag: redFlagNodeIds.has(code),
    };
  });
}

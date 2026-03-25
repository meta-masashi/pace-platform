/**
 * PACE Platform — 次の質問候補取得 API
 *
 * GET /api/assessment/next-questions?assessmentId=xxx
 *
 * アセスメントセッションの全ノードと現在の回答状態を取得し、
 * Routing_v4.3 条件を評価して表示可能な次の質問候補を返す。
 *
 * 処理フロー:
 *   1. セッション情報と全ノードを取得
 *   2. 現在の回答状態を取得
 *   3. 各未回答ノードの Routing_v4.3 条件を評価
 *   4. 条件を満たすノードのみを候補として返す
 *   5. CAT エンジンの情報利得でソート
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withRetry } from "@/lib/shared/retry-handler";
import { selectNextQuestion } from "@/lib/assessment";
import type {
  AssessmentNode,
  AssessmentResponse,
  AnswerValue,
  AssessmentErrorResponse,
} from "@/lib/assessment/types";
import { parseRoutingRule } from "@/lib/routing/parser";
import { evaluateCondition } from "@/lib/routing/evaluator";
import type { RoutingCondition } from "@/lib/routing/types";

// ---------------------------------------------------------------------------
// レスポンス型
// ---------------------------------------------------------------------------

/** 次の質問候補 */
interface NextQuestionCandidate {
  /** ノードID */
  nodeId: string;
  /** 質問テキスト */
  questionText: string;
  /** 情報利得スコア */
  informationGain: number;
  /** ルーティング条件タイプ */
  routingType: string;
  /** ルーティング条件の説明（UIヒント用） */
  routingHint: string | null;
}

/** 成功レスポンス */
interface NextQuestionsResponse {
  success: true;
  data: {
    /** 表示可能な質問候補（情報利得順） */
    candidates: NextQuestionCandidate[];
    /** 推奨される次の質問（情報利得最大） */
    recommended: NextQuestionCandidate | null;
    /** 進捗率 */
    progress: number;
    /** 全未回答ノード数 */
    totalUnanswered: number;
    /** ルーティング通過ノード数 */
    routingPassedCount: number;
  };
}

// ---------------------------------------------------------------------------
// GET /api/assessment/next-questions
// ---------------------------------------------------------------------------

export async function GET(
  request: Request,
): Promise<NextResponse<NextQuestionsResponse | AssessmentErrorResponse>> {
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
        { status: 401 },
      );
    }

    // ----- クエリパラメータ取得 -----
    const { searchParams } = new URL(request.url);
    const assessmentId = searchParams.get("assessmentId");

    if (!assessmentId) {
      return NextResponse.json(
        {
          success: false,
          error: "assessmentId クエリパラメータが必要です。",
        },
        { status: 400 },
      );
    }

    // ----- セッション取得 -----
    const { data: session, error: sessionError } = await supabase
      .from("assessment_sessions")
      .select("*")
      .eq("id", assessmentId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        {
          success: false,
          error: "アセスメントセッションが見つかりません。",
        },
        { status: 404 },
      );
    }

    if (session.status !== "in_progress") {
      return NextResponse.json(
        {
          success: false,
          error: "このアセスメントは既に完了または中止されています。",
        },
        { status: 400 },
      );
    }

    // ----- アセスメントノードを取得 -----
    const fileTypeFilter =
      (session.assessment_type as string) === "f1_acute"
        ? "F1"
        : (session.assessment_type as string);

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
          console.warn(
            `[assessment:next-questions] ノード取得リトライ attempt=${attempt}:`,
            err,
          );
        },
      },
    );

    const nodes = (nodesResult ?? []) as AssessmentNode[];

    // ----- 回答履歴を取得 -----
    const { data: responseRows } = await supabase
      .from("assessment_responses")
      .select("node_id, answer, answered_at")
      .eq("session_id", assessmentId)
      .order("answered_at", { ascending: true });

    const allResponses: AssessmentResponse[] = (responseRows ?? []).map(
      (r) => ({
        nodeId: r.node_id as string,
        answer: r.answer as AnswerValue,
        timestamp: r.answered_at as string,
      }),
    );

    // 回答済みノードIDのセット
    const answeredNodeIds = new Set(allResponses.map((r) => r.nodeId));

    // 回答値マップ（ルーティング評価用）
    const responseMap = new Map<string, string>();
    for (const r of allResponses) {
      responseMap.set(r.nodeId, r.answer);
    }

    // ----- 現在の事後確率を復元 -----
    const posteriors = new Map<string, number>(
      Object.entries(
        (session.posteriors as Record<string, number>) ?? {},
      ),
    );

    // ----- 未回答ノードのルーティング評価 -----
    const unansweredNodes = nodes.filter(
      (n) => !answeredNodeIds.has(n.node_id),
    );

    const routingPassedNodes: Array<{
      node: AssessmentNode;
      condition: RoutingCondition;
      hint: string | null;
    }> = [];

    for (const node of unansweredNodes) {
      // routing_rules_json 内の routing_condition を取得
      const routingRulesJson = node.routing_rules_json as Record<
        string,
        unknown
      > | null;

      // routing_v43_raw または routing_condition からパース
      let condition: RoutingCondition;
      const rawRouting =
        (routingRulesJson?.routing_condition as RoutingCondition) ?? null;

      if (rawRouting && rawRouting.type) {
        // 既にパース済みの構造化条件がある
        condition = rawRouting;
      } else {
        // routing_v43_raw からパース
        const rawText =
          ((node as unknown as Record<string, unknown>)["routing_v43_raw"] as string) ??
          null;
        condition = parseRoutingRule(rawText);
      }

      // 条件を評価
      const passed = evaluateCondition(condition, responseMap);

      if (passed) {
        routingPassedNodes.push({
          node,
          condition,
          hint: buildRoutingHint(condition),
        });
      }
    }

    // ----- 情報利得でソート（CAT エンジン統合）-----
    // ルーティング通過ノードのみで情報利得を計算
    const passedNodesList = routingPassedNodes.map((rp) => rp.node);
    const recommended = selectNextQuestion(
      passedNodesList,
      allResponses,
      posteriors,
    );

    // 各候補の情報利得を取得するため、個別に計算
    const candidates: NextQuestionCandidate[] = routingPassedNodes.map(
      (rp) => {
        // 推奨ノードと一致する場合はその情報利得を使用
        const ig =
          recommended && recommended.nodeId === rp.node.node_id
            ? recommended.informationGain
            : 0;

        return {
          nodeId: rp.node.node_id,
          questionText: rp.node.question_text,
          informationGain: ig,
          routingType: rp.condition.type,
          routingHint: rp.hint,
        };
      },
    );

    // 情報利得の降順でソート（推奨ノードが先頭に来る）
    candidates.sort((a, b) => b.informationGain - a.informationGain);

    const recommendedCandidate =
      candidates.length > 0 ? candidates[0]! : null;

    return NextResponse.json({
      success: true,
      data: {
        candidates,
        recommended: recommendedCandidate,
        progress: recommended?.progress ?? 0,
        totalUnanswered: unansweredNodes.length,
        routingPassedCount: routingPassedNodes.length,
      },
    });
  } catch (err) {
    console.error("[assessment:next-questions] 予期しないエラー:", err);
    return NextResponse.json(
      { success: false, error: "サーバー内部エラーが発生しました。" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

/**
 * ルーティング条件から日本語のヒント文字列を生成する。
 * UIで「なぜこの質問が表示されたか」を示すために使用する。
 */
function buildRoutingHint(condition: RoutingCondition): string | null {
  switch (condition.type) {
    case "always":
      return null;

    case "if":
      if (condition.conditions && condition.conditions.length > 0) {
        const c = condition.conditions[0]!;
        return `${c.nodeId} の回答が "${c.value}" のため表示`;
      }
      return null;

    case "after":
      return `${condition.afterNodeId} の回答後に表示`;

    case "compound": {
      if (!condition.conditions || condition.conditions.length === 0) {
        return null;
      }
      const parts = condition.conditions.map(
        (c) => `${c.nodeId}${c.operator}${c.value}`,
      );
      const op = condition.operator === "OR" ? "または" : "かつ";
      return `条件: ${parts.join(` ${op} `)}`;
    }

    default:
      return null;
  }
}

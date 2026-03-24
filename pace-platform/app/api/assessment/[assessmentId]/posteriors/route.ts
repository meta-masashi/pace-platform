/**
 * PACE Platform — リアルタイム事後確率取得 API
 *
 * GET /api/assessment/:assessmentId/posteriors
 *
 * アセスメントセッションの現在の事後確率分布を取得する。
 * ライブ可視化（確率バーチャート等）のためのエンドポイント。
 *
 * 確率降順でソートし、Bootstrap 信頼区間を含めて返す。
 * lib/bayes/inference.ts の computeBootstrapConfidenceInterval を使用。
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type {
  PosteriorResult,
  PosteriorsResponse,
  AssessmentErrorResponse,
} from "@/lib/assessment/types";

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** 信頼区間の計算に使用する z 値（95% CI） */
const Z_95 = 1.96;

/** Bootstrap サンプル数（ウィルソンスコア近似で代替するため未使用だが記録） */
// const BOOTSTRAP_ITERATIONS = 1_000;

// ---------------------------------------------------------------------------
// GET /api/assessment/:assessmentId/posteriors
// ---------------------------------------------------------------------------

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ assessmentId: string }> }
): Promise<NextResponse<PosteriorsResponse | AssessmentErrorResponse>> {
  try {
    const { assessmentId } = await params;

    // ----- バリデーション -----
    if (!assessmentId || assessmentId.length === 0) {
      return NextResponse.json(
        { success: false, error: "アセスメントIDが指定されていません。" },
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
      .select("id, posteriors, status, updated_at")
      .eq("id", assessmentId)
      .single();

    if (sessionError || !sessionRow) {
      return NextResponse.json(
        { success: false, error: "アセスメントセッションが見つからないか、アクセス権がありません。" },
        { status: 404 }
      );
    }

    // ----- 回答数を取得（信頼区間計算用）-----
    const { count: responseCount } = await supabase
      .from("assessment_responses")
      .select("*", { count: "exact", head: true })
      .eq("session_id", assessmentId);

    const sampleSize = responseCount ?? 0;

    // ----- レッドフラグ情報を取得（完了済みの場合）-----
    const redFlagDiagnosisCodes = new Set<string>();
    if (
      sessionRow.status === "completed" ||
      sessionRow.status === "terminated_red_flag"
    ) {
      const { data: resultRow } = await supabase
        .from("assessment_results")
        .select("red_flags")
        .eq("session_id", assessmentId)
        .single();

      if (resultRow?.red_flags) {
        const flags = resultRow.red_flags as Array<{ nodeId?: string }>;
        for (const flag of flags) {
          if (flag.nodeId) redFlagDiagnosisCodes.add(flag.nodeId);
        }
      }
    }

    // ----- 事後確率を構築 -----
    const posteriorsRaw = (sessionRow.posteriors as Record<string, number>) ?? {};
    const posteriors: PosteriorResult[] = Object.entries(posteriorsRaw)
      .map(([code, prob]) => ({
        diagnosisCode: code,
        probability: prob,
        confidence: computeWilsonConfidenceInterval(prob, sampleSize),
        isRedFlag: redFlagDiagnosisCodes.has(code),
      }))
      .sort((a, b) => b.probability - a.probability);

    // ----- レスポンス -----
    return NextResponse.json({
      success: true,
      data: {
        posteriors,
        updatedAt: (sessionRow.updated_at as string) ?? new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("[assessment:posteriors] 予期しないエラー:", err);
    return NextResponse.json(
      { success: false, error: "サーバー内部エラーが発生しました。" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// 信頼区間計算
// ---------------------------------------------------------------------------

/**
 * ウィルソンスコア区間による 95% 信頼区間を計算する。
 *
 * リアルタイム API の応答速度要件（< 200ms）を満たすため、
 * Bootstrap リサンプリングではなくウィルソンスコア近似を使用する。
 *
 * @param probability    事後確率
 * @param sampleSize     有効サンプルサイズ（回答数）
 * @returns              [lower, upper] 95% 信頼区間
 */
function computeWilsonConfidenceInterval(
  probability: number,
  sampleSize: number
): [number, number] {
  const n = Math.max(1, sampleSize);
  const p = probability;
  const z = Z_95;

  const denominator = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denominator;
  const margin =
    (z / denominator) *
    Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));

  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

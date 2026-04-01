/**
 * PACE Platform — メニューコンパイル API
 *
 * POST /api/menu/compile
 *
 * アセスメント結果に基づいてワークアウトメニューを自律修正する。
 * タグコンパイラを実行し、禁忌ブロック・処方挿入の結果を返す。
 *
 * **自動保存しない** — スタッフ承認待ち（ワンタップ・アプルーバル）。
 *
 * 認可: AT, PT, master, S&C
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { compileMenu } from "@/lib/tags/compiler";
import type {
  Exercise,
  FiredNode,
  TagCompilationResult,
} from "@/lib/tags/types";

// ---------------------------------------------------------------------------
// リクエスト・レスポンス型
// ---------------------------------------------------------------------------

interface CompileRequest {
  athleteId: string;
  date?: string;
  assessmentId?: string;
}

interface CompileSuccessResponse {
  success: true;
  data: {
    originalMenu: Exercise[];
    modifiedMenu: Exercise[];
    compilationResult: TagCompilationResult;
  };
}

interface CompileErrorResponse {
  success: false;
  error: string;
}

// ---------------------------------------------------------------------------
// POST /api/menu/compile
// ---------------------------------------------------------------------------

export async function POST(
  request: Request
): Promise<NextResponse<CompileSuccessResponse | CompileErrorResponse>> {
  try {
    // --- 認証 ---
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "認証が必要です。" },
        { status: 401 }
      );
    }

    // --- リクエストパース ---
    const body = (await request.json()) as CompileRequest;
    const { athleteId, assessmentId } = body;
    const date = body.date ?? new Date().toISOString().split("T")[0]!;

    if (!athleteId) {
      return NextResponse.json(
        { success: false, error: "athleteId は必須です。" },
        { status: 400 }
      );
    }

    // --- データ取得（並列） ---
    const [menuResult, assessmentResult, exercisesResult] = await Promise.all([
      // 1. 現在のワークアウトメニュー
      supabase
        .from("workout_menus")
        .select(
          "id, exercise_id, exercises(id, name_ja, name_en, category, target_axis, prescription_tags_json, contraindication_tags_json, sets, reps, rpe)"
        )
        .eq("athlete_id", athleteId)
        .eq("date", date),

      // 2. アセスメント結果（発火ノード）
      assessmentId
        ? supabase
            .from("assessment_sessions")
            .select(
              `id, assessment_responses(
                node_id,
                answer,
                assessment_nodes(
                  node_id, question_text, category, target_axis,
                  lr_yes, lr_no, base_prevalence,
                  prescription_tags_json, contraindication_tags_json
                )
              )`
            )
            .eq("id", assessmentId)
            .single()
        : supabase
            .from("assessment_sessions")
            .select(
              `id, assessment_responses(
                node_id,
                answer,
                assessment_nodes(
                  node_id, question_text, category, target_axis,
                  lr_yes, lr_no, base_prevalence,
                  prescription_tags_json, contraindication_tags_json
                )
              )`
            )
            .eq("athlete_id", athleteId)
            .eq("status", "completed")
            .order("completed_at", { ascending: false })
            .limit(1)
            .single(),

      // 3. エクササイズマスタ
      supabase
        .from("exercises")
        .select(
          "id, name_ja, name_en, category, target_axis, prescription_tags_json, contraindication_tags_json, sets, reps, rpe"
        )
        .eq("is_active", true),
    ]);

    // --- 現在のメニューを Exercise[] に変換 ---
    const currentMenu: Exercise[] = (menuResult.data ?? [])
      .map((row) => {
        const ex = (typeof row.exercises === 'object' && row.exercises !== null) ? (row.exercises as unknown as Record<string, unknown>) : null;
        if (!ex) return null;
        return {
          id: ex.id as string,
          name_ja: ex.name_ja as string,
          name_en: ex.name_en as string,
          category: ex.category as string,
          targetAxis: ex.target_axis as string,
          prescriptionTagsJson: ex.prescription_tags_json as string[] | null,
          contraindicationTagsJson: ex.contraindication_tags_json as string[] | null,
          sets: ex.sets as number,
          reps: ex.reps as number,
          rpe: ex.rpe as number,
        } satisfies Exercise;
      })
      .filter((ex): ex is Exercise => ex !== null);

    // --- 発火ノードを FiredNode[] に変換 ---
    const firedNodes: FiredNode[] = [];
    if (assessmentResult.data) {
      const responses = (assessmentResult.data as Record<string, unknown>)
        .assessment_responses as Array<Record<string, unknown>> | null;

      if (responses) {
        for (const resp of responses) {
          const answer = resp.answer as string;
          if (answer !== "yes") continue;

          const node = resp.assessment_nodes as Record<string, unknown> | null;
          if (!node) continue;

          const lrYes = node.lr_yes as number;
          const basePrevalence = node.base_prevalence as number;
          const posterior = calculatePosterior(lrYes, basePrevalence);
          const riskIncrease = basePrevalence > 0
            ? ((posterior - basePrevalence) / basePrevalence) * 100
            : 0;

          firedNodes.push({
            nodeId: node.node_id as string,
            nodeName: node.question_text as string,
            answer: "yes",
            targetAxis: node.target_axis as string,
            posteriorProbability: posterior,
            priorProbability: basePrevalence,
            category: node.category as string,
            prescriptionTags: (node.prescription_tags_json as string[] | null) ?? [],
            contraindicationTags: (node.contraindication_tags_json as string[] | null) ?? [],
            evidenceText: "",
            riskIncrease,
          });
        }
      }
    }

    // --- エクササイズマスタを Exercise[] に変換 ---
    const allExercises: Exercise[] = (exercisesResult.data ?? []).map(
      (row) => ({
        id: row.id as string,
        name_ja: row.name_ja as string,
        name_en: row.name_en as string,
        category: row.category as string,
        targetAxis: row.target_axis as string,
        prescriptionTagsJson: row.prescription_tags_json as string[] | null,
        contraindicationTagsJson: row.contraindication_tags_json as string[] | null,
        sets: row.sets as number,
        reps: row.reps as number,
        rpe: row.rpe as number,
      })
    );

    // --- タグコンパイラ実行 ---
    const compilationResult = compileMenu({
      currentMenu,
      firedNodes,
      allExercises,
    });

    // --- 修正後メニューを構築 ---
    const blockedIds = new Set(compilationResult.blockedExercises.map((e) => e.id));
    const remainingExercises = currentMenu.filter((e) => !blockedIds.has(e.id));
    const insertedAsExercises: Exercise[] = compilationResult.insertedExercises.map(
      (match) => ({
        id: match.exerciseId,
        name_ja: match.name_ja,
        name_en: match.name_en,
        category: match.category,
        targetAxis: "",
        prescriptionTagsJson: [match.matchedTag],
        contraindicationTagsJson: null,
        sets: match.sets,
        reps: match.reps,
        rpe: match.rpe,
      })
    );
    const modifiedMenu = [...remainingExercises, ...insertedAsExercises];

    return NextResponse.json({
      success: true,
      data: {
        originalMenu: currentMenu,
        modifiedMenu,
        compilationResult,
      },
    });
  } catch (err) {
    console.error("[api/menu/compile] 予期しないエラー:", err);
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
 * 簡易的な事後確率計算（ベイズの定理）。
 * posterior = (LR_yes * prior) / ((LR_yes * prior) + (1 - prior))
 */
function calculatePosterior(lrYes: number, prior: number): number {
  if (prior <= 0 || prior >= 1) return prior;
  const numerator = lrYes * prior;
  const denominator = numerator + (1 - prior);
  if (denominator === 0) return prior;
  return numerator / denominator;
}

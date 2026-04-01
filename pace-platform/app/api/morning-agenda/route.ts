/**
 * PACE Platform — 7 AM Monopoly Morning Agenda API
 *
 * GET /api/morning-agenda?teamId=xxx&date=YYYY-MM-DD
 *
 * 朝7時の自律メニュー生成エンドポイント。
 * チーム内の全アスリートについて:
 *   1. 最新アセスメント結果からリスク閾値超過を検出
 *   2. タグコンパイラでメニューを自律修正
 *   3. NLG テンプレートでエビデンステキストを生成
 *   4. オプションで Gemini 整形
 *   5. アラートカードをリスクレベル順にソート
 *
 * 認可: AT, PT, master, S&C
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { compileMenu } from "@/lib/tags/compiler";
import type { Exercise, FiredNode, MenuDraft } from "@/lib/tags/types";
import {
  generateEvidenceTemplate,
  generateAlertCards,
  determineRiskLevel,
} from "@/lib/nlg/template-generator";
import { shapeWithGemini } from "@/lib/nlg/gemini-shaper";
import { MEDICAL_DISCLAIMER } from "@/lib/gemini/client";
import type {
  EvidenceAlert,
  AlertCard,
  MorningAgendaResponse,
  MorningAgendaErrorResponse,
} from "@/lib/nlg/types";

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** リスク倍率の最低閾値 — この倍率以上のアスリートのみアラート対象 */
const ALERT_RISK_MULTIPLIER_THRESHOLD = 1.3;

/** リスク増加率の閾値（%）— タグコンパイラのデフォルト */
const TAG_RISK_THRESHOLD = 15;

// ---------------------------------------------------------------------------
// GET /api/morning-agenda
// ---------------------------------------------------------------------------

export async function GET(
  request: Request
): Promise<NextResponse<MorningAgendaResponse | MorningAgendaErrorResponse>> {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get("teamId");
    const date = searchParams.get("date") ?? new Date().toISOString().split("T")[0]!;

    if (!teamId) {
      return NextResponse.json(
        { success: false, error: "teamId クエリパラメータは必須です。" },
        { status: 400 }
      );
    }

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

    // --- チームアクセス確認 ---
    const { data: team, error: teamError } = await supabase
      .from("teams")
      .select("id")
      .eq("id", teamId)
      .single();

    if (teamError || !team) {
      return NextResponse.json(
        { success: false, error: "チームが見つかりません。" },
        { status: 403 }
      );
    }

    // --- 並列データ取得 ---
    const [athletesResult, exercisesResult] = await Promise.all([
      // チーム内全アスリート
      supabase
        .from("athletes")
        .select("id, name")
        .eq("team_id", teamId),

      // エクササイズマスタ
      supabase
        .from("exercises")
        .select(
          "id, name_ja, name_en, category, target_axis, prescription_tags_json, contraindication_tags_json, sets, reps, rpe"
        )
        .eq("is_active", true),
    ]);

    const athletes = athletesResult.data ?? [];
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

    // --- アスリートごとの処理 ---
    const alerts: EvidenceAlert[] = [];
    const menuDrafts = new Map<string, MenuDraft>();

    for (const athlete of athletes) {
      const athleteId = athlete.id as string;
      const athleteName = athlete.name as string;

      // 最新の完了済みアセスメント取得
      const { data: sessionData } = await supabase
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
        .maybeSingle();

      if (!sessionData) continue;

      // 発火ノード抽出
      const firedNodes = extractFiredNodes(sessionData);
      if (firedNodes.length === 0) continue;

      // 現在のメニュー取得
      const { data: menuData } = await supabase
        .from("workout_menus")
        .select(
          "exercise_id, exercises(id, name_ja, name_en, category, target_axis, prescription_tags_json, contraindication_tags_json, sets, reps, rpe)"
        )
        .eq("athlete_id", athleteId)
        .eq("date", date);

      const currentMenu: Exercise[] = (menuData ?? [])
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

      // タグコンパイラ実行
      const compilation = compileMenu({
        currentMenu,
        firedNodes,
        allExercises,
        riskThreshold: TAG_RISK_THRESHOLD,
      });

      // リスク閾値超過のノードからアラートを生成
      for (const node of firedNodes) {
        if (node.answer !== "yes") continue;

        const riskMultiplier =
          node.priorProbability > 0
            ? node.posteriorProbability / node.priorProbability
            : 1;

        if (riskMultiplier < ALERT_RISK_MULTIPLIER_THRESHOLD) continue;

        // このノードに関連するブロック・処方タグを抽出
        const relatedBlockedTags = compilation.blockedTags.filter((tag) =>
          node.contraindicationTags.includes(tag)
        );
        const relatedPrescribedTags = compilation.prescribedTags.filter((tag) =>
          node.prescriptionTags.includes(tag)
        );
        const relatedMods = compilation.evidenceTrail.filter(
          (m) => m.nodeId === node.nodeId
        );

        alerts.push({
          athleteId,
          athleteName,
          riskArea: buildRiskAreaLabel(node.targetAxis, node.category),
          posteriorProbability: node.posteriorProbability,
          priorProbability: node.priorProbability,
          riskMultiplier,
          nodeName: node.nodeName,
          evidenceText: node.evidenceText,
          blockedTags: relatedBlockedTags,
          prescribedTags: relatedPrescribedTags,
          modifications: relatedMods,
        });
      }

      // メニュードラフト作成
      if (compilation.evidenceTrail.length > 0) {
        const blockedIds = new Set(compilation.blockedExercises.map((e) => e.id));
        const remaining = currentMenu.filter((e) => !blockedIds.has(e.id));
        const inserted: Exercise[] = compilation.insertedExercises.map((m) => ({
          id: m.exerciseId,
          name_ja: m.name_ja,
          name_en: m.name_en,
          category: m.category,
          targetAxis: "",
          prescriptionTagsJson: [m.matchedTag],
          contraindicationTagsJson: null,
          sets: m.sets,
          reps: m.reps,
          rpe: m.rpe,
        }));

        menuDrafts.set(athleteId, {
          athleteId,
          date,
          exercises: [...remaining, ...inserted],
          isModified: true,
          modifications: compilation.evidenceTrail,
        });
      }
    }

    // --- NLG テキスト生成 + アラートカード構築 ---
    let alertCards = generateAlertCards(alerts, menuDrafts);

    // Gemini 整形（オプション — 失敗時はテンプレートのまま）
    alertCards = await applyGeminiShaping(alertCards, user.id);

    // --- チームサマリー ---
    const teamSummary = {
      totalAthletes: athletes.length,
      criticalCount: alertCards.filter((c) => c.riskLevel === "critical").length,
      watchlistCount: alertCards.filter((c) => c.riskLevel === "watchlist").length,
      normalCount: alertCards.filter((c) => c.riskLevel === "normal").length,
    };

    return NextResponse.json({
      success: true,
      data: {
        date,
        alertCards,
        teamSummary,
      },
    });
  } catch (err) {
    console.error("[api/morning-agenda] 予期しないエラー:", err);
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
 * アセスメントセッションデータから FiredNode[] を抽出する。
 */
function extractFiredNodes(sessionData: Record<string, unknown>): FiredNode[] {
  const responses = sessionData.assessment_responses as Array<Record<string, unknown>> | null;
  if (!responses) return [];

  const nodes: FiredNode[] = [];

  for (const resp of responses) {
    const answer = resp.answer as string;
    if (answer !== "yes") continue;

    const node = resp.assessment_nodes as Record<string, unknown> | null;
    if (!node) continue;

    const lrYes = node.lr_yes as number;
    const basePrevalence = node.base_prevalence as number;
    const posterior = calculatePosterior(lrYes, basePrevalence);
    const riskIncrease =
      basePrevalence > 0
        ? ((posterior - basePrevalence) / basePrevalence) * 100
        : 0;

    nodes.push({
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

  return nodes;
}

/**
 * 簡易的な事後確率計算（ベイズの定理）。
 */
function calculatePosterior(lrYes: number, prior: number): number {
  if (prior <= 0 || prior >= 1) return prior;
  const numerator = lrYes * prior;
  const denominator = numerator + (1 - prior);
  if (denominator === 0) return prior;
  return numerator / denominator;
}

/**
 * target_axis と category からリスク領域ラベルを構築する（日本語）。
 */
function buildRiskAreaLabel(targetAxis: string, category: string): string {
  const labels: Record<string, string> = {
    hamstring_strain: "ハムストリングスの肉離れ",
    acl_tear: "前十字靱帯損傷",
    ankle_sprain: "足関節捻挫",
    groin_strain: "鼠径部の肉離れ",
    shoulder_instability: "肩関節不安定性",
    calf_strain: "ふくらはぎの肉離れ",
    quadriceps_strain: "大腿四頭筋の肉離れ",
    meniscus_injury: "半月板損傷",
    achilles_tendinopathy: "アキレス腱障害",
    low_back_pain: "腰痛",
  };

  const axisLabel = labels[targetAxis.toLowerCase()];
  if (axisLabel) return axisLabel;

  // カテゴリベースのフォールバック
  const categoryLabels: Record<string, string> = {
    knee: "膝関節",
    hamstring: "ハムストリングス",
    ankle: "足関節",
    shoulder: "肩関節",
    hip: "股関節",
    spine: "脊柱",
    calf: "ふくらはぎ",
    groin: "鼠径部",
  };

  return `${categoryLabels[category.toLowerCase()] ?? category}のリスク`;
}

/**
 * アラートカードに Gemini 整形を適用する（ベストエフォート）。
 */
async function applyGeminiShaping(
  cards: AlertCard[],
  userId: string
): Promise<AlertCard[]> {
  const result: AlertCard[] = [];

  for (const card of cards) {
    try {
      const shapeResult = await shapeWithGemini(card.nlgText, {
        userId,
        endpoint: "nlg-shaper",
      });

      result.push({
        ...card,
        nlgText: `${shapeResult.text} ${MEDICAL_DISCLAIMER}`,
      });
    } catch {
      // Gemini 失敗 — テンプレートテキストのまま
      result.push(card);
    }
  }

  return result;
}

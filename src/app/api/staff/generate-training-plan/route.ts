/**
 * POST /api/staff/generate-training-plan
 *
 * Gemini 2.0 Flash で週次訓練計画 JSON を生成し、
 * weekly_training_plans に status='draft' で INSERT する。
 *
 * Phase 6 Sprint 1 ADR-002, ADR-022
 *
 * リクエスト: { week_start_date: 'YYYY-MM-DD', notes?: string }
 * レスポンス: { plan_id: string, status: 'draft', plan_data: object }
 *
 * ガードレール:
 * - 出力に「診断」「処方」「投薬」「治療」が含まれる場合は 403
 * - レートリミット: 10回/日/スタッフ（rate-limit ユーティリティ使用）
 * - Gemini: 3回リトライ（gemini-client ユーティリティ使用）
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  callGeminiWithRetry,
  buildCdsSystemPrefix,
  cleanJsonText,
} from "@/lib/gemini-client";

function getDb() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ---------------------------------------------------------------------------
// 訓練計画ガードレール（診断・処方・投薬・治療ワード禁止）
// ---------------------------------------------------------------------------

const TRAINING_PLAN_GUARDRAIL_PATTERNS: RegExp[] = [
  /診断/,
  /処方/,
  /投薬/,
  /治療/,
];

function containsTrainingPlanViolation(text: string): boolean {
  return TRAINING_PLAN_GUARDRAIL_PATTERNS.some((p) => p.test(text));
}

// ---------------------------------------------------------------------------
// チームACWR・readiness 集計
// ---------------------------------------------------------------------------

interface TeamConditionSummary {
  avgAcwr: number;
  avgReadiness: number;
  criticalCount: number;
  athleteCount: number;
  /** P6-015: ACWR > 1.5 (Danger Zone) の選手数 — Hard Lock Context */
  dangerZoneCount: number;
}

async function getTeamConditionForWeek(
  db: ReturnType<typeof getDb>,
  orgId: string,
  weekStartDate: string
): Promise<TeamConditionSummary> {
  // 当週の月曜〜日曜の範囲
  const start = new Date(weekStartDate);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);

  // 組織の選手ID一覧
  const { data: athletes } = await db
    .from("athletes")
    .select("id")
    .eq("org_id", orgId)
    .eq("is_active", true);

  if (!athletes || athletes.length === 0) {
    return { avgAcwr: 1.0, avgReadiness: 50, criticalCount: 0, dangerZoneCount: 0, athleteCount: 0 };
  }

  const athleteIds = athletes.map((a: { id: string }) => a.id);

  // 当週のコンディションキャッシュ（最新日のみ）
  const { data: caches } = await db
    .from("athlete_condition_cache")
    .select("athlete_id, acwr, readiness_score")
    .in("athlete_id", athleteIds)
    .gte("date", startStr)
    .lte("date", endStr)
    .order("date", { ascending: false });

  if (!caches || caches.length === 0) {
    return {
      avgAcwr: 1.0,
      avgReadiness: 50,
      criticalCount: 0,
      dangerZoneCount: 0,
      athleteCount: athletes.length,
    };
  }

  // 選手ごとに最新1件だけ使う
  const latestMap = new Map<string, { acwr: number; readiness_score: number }>();
  for (const c of caches) {
    if (!latestMap.has(c.athlete_id)) {
      latestMap.set(c.athlete_id, c);
    }
  }

  const entries = Array.from(latestMap.values());
  const avgAcwr =
    entries.reduce((s, e) => s + (e.acwr ?? 1.0), 0) / entries.length;
  const avgReadiness =
    entries.reduce((s, e) => s + (e.readiness_score ?? 50), 0) / entries.length;
  const criticalCount = entries.filter((e) => (e.readiness_score ?? 50) < 40).length;
  // P6-015 Hard Lock Context: ACWR > 1.5 は危険ゾーン
  const dangerZoneCount = entries.filter((e) => (e.acwr ?? 1.0) > 1.5).length;

  return {
    avgAcwr: Math.round(avgAcwr * 1000) / 1000,
    avgReadiness: Math.round(avgReadiness * 10) / 10,
    criticalCount,
    dangerZoneCount,
    athleteCount: athletes.length,
  };
}

// ---------------------------------------------------------------------------
// Gemini プロンプト構築
// ---------------------------------------------------------------------------

interface PlanPromptInput {
  orgId: string;
  weekStartDate: string;
  avgAcwr: number;
  avgReadiness: number;
  criticalCount: number;
  dangerZoneCount: number;
  athleteCount: number;
  notes?: string;
}

function buildTrainingPlanPrompt(input: PlanPromptInput): string {
  const {
    weekStartDate,
    avgAcwr,
    avgReadiness,
    criticalCount,
    dangerZoneCount,
    athleteCount,
    notes,
  } = input;

  // 週終了日
  const end = new Date(weekStartDate);
  end.setDate(end.getDate() + 6);
  const weekEndDate = end.toISOString().slice(0, 10);

  return `${buildCdsSystemPrefix()}
以下のチームコンディションデータに基づき、週次トレーニング計画をJSON形式で生成してください。

【対象週】${weekStartDate} 〜 ${weekEndDate}

【チームコンディションサマリー】
- 選手総数: ${athleteCount}名
- チーム平均ACWR: ${avgAcwr.toFixed(3)}
- チーム平均Readiness: ${avgReadiness.toFixed(1)}/100
- 要注意選手数（Readiness < 40）: ${criticalCount}名
- 危険ゾーン選手数（ACWR > 1.5）: ${dangerZoneCount}名${dangerZoneCount > 0 ? " ⚠️ Hard Lock: intensity_target は 'low' のみ" : ""}
${notes ? `\n【スタッフメモ】\n${notes}` : ""}

【出力形式（必ずこのJSONのみ返答）】
{
  "week_theme": "（今週のトレーニングテーマを1文で）",
  "intensity_target": "low" | "moderate" | "high",
  "days": [
    {
      "day": "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday",
      "focus": "（その日のトレーニングフォーカスを1文で）",
      "duration_min": 数値（分）,
      "intensity": "low" | "moderate" | "high" | "rest",
      "activities": ["（活動1）", "（活動2）"],
      "notes": "（補足があれば1文、なければ null）"
    }
  ],
  "recovery_guidance": "（週全体の回復に関する注意点を1〜2文）",
  "staff_notes": "（スタッフへの引き継ぎ事項を1〜2文）"
}

【厳守ルール】
- 「診断」「処方」「投薬」「治療」などの医療行為・医療判断ワードは絶対に含めない
- 「〜と診断します」「〜が原因です」など医療的断定は禁止
- トレーニング強度はACWRとReadinessに基づいて科学的に調整すること
  - ACWR > 1.3 または criticalCount > 0 の場合は intensity_target を "low" または "moderate" にすること
  - ACWR < 0.8 の場合はトレーニング量不足を示唆してよい
  - dangerZoneCount > 0 の場合: intensity_target は必ず "low" に設定し days の全 intensity も "low" または "rest" のみ使用すること（Hard Lock 強制）
- 必ずJSON形式のみ返答（コードブロック・説明文は不要）
- days 配列は必ず7要素（月〜日）含めること
`;
}

// ---------------------------------------------------------------------------
// 週次計画の型
// ---------------------------------------------------------------------------

interface TrainingDay {
  day: string;
  focus: string;
  duration_min: number;
  intensity: "low" | "moderate" | "high" | "rest";
  activities: string[];
  notes: string | null;
}

interface TrainingPlanData {
  week_theme: string;
  intensity_target: "low" | "moderate" | "high";
  days: TrainingDay[];
  recovery_guidance: string;
  staff_notes: string;
}

function parseTrainingPlan(text: string): TrainingPlanData {
  const parsed = JSON.parse(cleanJsonText(text)) as TrainingPlanData;

  // 必須フィールド検証
  if (!parsed.week_theme || !parsed.intensity_target || !Array.isArray(parsed.days)) {
    throw new Error("Invalid training plan structure");
  }
  if (parsed.days.length !== 7) {
    throw new Error("Training plan must have exactly 7 days");
  }

  return parsed;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // ── スタッフ認証 ──────────────────────────────────────────────────────────
    const supabaseAuth = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getDb();

    const { data: staff, error: staffError } = await db
      .from("staff")
      .select("id, org_id, role")
      .eq("id", user.id)
      .maybeSingle();

    if (staffError || !staff) {
      return NextResponse.json(
        { error: "Staff record not found" },
        { status: 403 }
      );
    }

    // ── リクエストボディ ──────────────────────────────────────────────────────
    let body: { week_start_date?: string; notes?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { week_start_date, notes } = body;

    if (!week_start_date) {
      return NextResponse.json(
        { error: "week_start_date is required (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    // 日付フォーマット検証
    if (!/^\d{4}-\d{2}-\d{2}$/.test(week_start_date)) {
      return NextResponse.json(
        { error: "week_start_date must be in YYYY-MM-DD format" },
        { status: 400 }
      );
    }

    // ── チームコンディション取得 ──────────────────────────────────────────────
    const teamCondition = await getTeamConditionForWeek(
      db,
      staff.org_id,
      week_start_date
    );

    // ── Gemini で週次計画生成（レートリミット付き、3回リトライ）──────────────
    const promptInput: PlanPromptInput = {
      orgId: staff.org_id,
      weekStartDate: week_start_date,
      avgAcwr: teamCondition.avgAcwr,
      avgReadiness: teamCondition.avgReadiness,
      criticalCount: teamCondition.criticalCount,
      dangerZoneCount: teamCondition.dangerZoneCount,
      athleteCount: teamCondition.athleteCount,
      notes: notes?.trim(),
    };

    let planData: TrainingPlanData;
    try {
      const { result } = await callGeminiWithRetry<TrainingPlanData>(
        buildTrainingPlanPrompt(promptInput),
        parseTrainingPlan,
        { userId: staff.id, endpoint: "generate-training-plan" }
      );
      planData = result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);

      if (msg === "RATE_LIMIT_EXCEEDED") {
        return NextResponse.json(
          { error: "レート制限に達しました。しばらく後でお試しください。" },
          { status: 429 }
        );
      }

      console.error("[generate-training-plan] Gemini error:", msg);
      return NextResponse.json(
        { error: "Failed to generate training plan" },
        { status: 502 }
      );
    }

    // ── ガードレール二重チェック（診断・処方・投薬・治療ワード） ──────────────
    const planJson = JSON.stringify(planData);
    if (containsTrainingPlanViolation(planJson)) {
      console.error(
        "[generate-training-plan] Guardrail violation in generated plan"
      );
      return NextResponse.json(
        {
          error:
            "生成されたプランに医療行為に関するワードが含まれていました。再度お試しください。",
        },
        { status: 403 }
      );
    }

    // ── weekly_training_plans INSERT ─────────────────────────────────────────
    const { data: plan, error: insertError } = await db
      .from("weekly_training_plans")
      .insert({
        org_id: staff.org_id,
        staff_id: staff.id,
        week_start_date,
        plan_data: planData,
        status: "draft",
        notes: notes?.trim() || null,
        generated_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insertError || !plan) {
      console.error(
        "[generate-training-plan] DB insert error:",
        insertError
      );
      return NextResponse.json(
        { error: "Failed to save training plan" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        plan_id: plan.id,
        status: "draft",
        plan_data: planData,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[generate-training-plan] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/staff/generate-rehab-roadmap
 *
 * AT/PT 向け 4週間リハビリロードマップ自律生成 (P6-014)
 *
 * Gemini 2.0 Flash で選手の診断・ACWR・SOAPノートをコンテキストとして注入し、
 * 4週間 × 週次目標 の構造化リハビリロードマップを生成する。
 * 生成結果は weekly_training_plans テーブルに 4 行（週単位）INSERT される。
 *
 * ガードレール (P6-016):
 * - 「診断します」「処方します」「投薬」「手術」「医師の判断」などの禁止ワードチェック
 * - ACWR > 1.5 の場合は intensity を強制 "low" オーバーライド (P6-015 Hard Lock Context)
 * - レートリミット: 5回/日/スタッフ（リハビリ計画は週次）
 * - JSONパース失敗時: 3回リトライ（指数バックオフ）(P6-017)
 *
 * リクエスト: {
 *   athlete_id: string,
 *   rtp_target_date: string,   // RTP（Return To Play）目標日 YYYY-MM-DD
 *   start_date?: string,       // 開始日（省略時: 今週月曜）
 *   notes?: string             // スタッフの補足メモ
 * }
 *
 * レスポンス: {
 *   plan_ids: string[],        // 4 件の weekly_training_plans ID
 *   roadmap: RoadmapWeek[],
 *   acwr_override: boolean     // Hard Lock により強度が上書きされた場合 true
 * }
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
// リハビリ計画ガードレールパターン (P6-016)
// ---------------------------------------------------------------------------

const REHAB_GUARDRAIL_PATTERNS: RegExp[] = [
  /診断します/,
  /処方します/,
  /投薬/,
  /手術/,
  /医師の判断/,
  /診察/,
  /治療します/,
];

function containsRehabViolation(text: string): boolean {
  return REHAB_GUARDRAIL_PATTERNS.some((p) => p.test(text));
}

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface RoadmapWeekDay {
  day: "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday";
  focus: string;
  duration_min: number;
  intensity: "rest" | "low" | "moderate" | "high";
  exercises: string[];
  criteria_to_advance: string | null;
  notes: string | null;
}

interface RoadmapWeek {
  week: number; // 1〜4
  week_start_date: string; // YYYY-MM-DD
  phase: string; // "炎症管理" | "組織修復" | "機能回復" | "RTP準備"
  weekly_goal: string;
  rtp_criteria: string;
  days: RoadmapWeekDay[];
  staff_notes: string;
}

interface RoadmapOutput {
  athlete_summary: string;
  roadmap: RoadmapWeek[];
  precautions: string;
}

// ---------------------------------------------------------------------------
// コンテキスト取得
// ---------------------------------------------------------------------------

async function getAthleteContext(
  db: ReturnType<typeof getDb>,
  athleteId: string,
  orgId: string
) {
  // 並行取得
  const [athleteRes, soapRes, assessRes, condRes] = await Promise.all([
    db
      .from("athletes")
      .select("id, name, position, birth_date")
      .eq("id", athleteId)
      .eq("org_id", orgId)
      .maybeSingle(),
    db
      .from("soap_notes")
      .select("s_text, o_text, a_text, p_text, created_at")
      .eq("athlete_id", athleteId)
      .order("created_at", { ascending: false })
      .limit(2),
    db
      .from("assessments")
      .select("assessment_type, primary_diagnosis, differentials, completed_at")
      .eq("athlete_id", athleteId)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(1),
    db
      .from("athlete_condition_cache")
      .select("date, acwr, readiness_score, fitness, fatigue")
      .eq("athlete_id", athleteId)
      .order("date", { ascending: false })
      .limit(3),
  ]);

  return {
    athlete: athleteRes.data,
    soapNotes: soapRes.data ?? [],
    latestAssessment: assessRes.data?.[0] ?? null,
    conditionHistory: condRes.data ?? [],
  };
}

// ---------------------------------------------------------------------------
// プロンプト構築 (P6-015: LLM Context Injection)
// ---------------------------------------------------------------------------

function buildRehabPrompt(
  context: Awaited<ReturnType<typeof getAthleteContext>>,
  startDate: string,
  rtpTargetDate: string,
  weekStarts: string[],
  acwrOverride: boolean,
  notes?: string
): string {
  const { athlete, soapNotes, latestAssessment, conditionHistory } = context;
  const latestCond = conditionHistory[0];

  // SOAP サマリー（最新1件）
  const soapSummary =
    soapNotes.length > 0
      ? `S: ${soapNotes[0].s_text}\nO: ${soapNotes[0].o_text}\nA: ${soapNotes[0].a_text}\nP: ${soapNotes[0].p_text}`
      : "SOAPノートなし";

  // アセスメント情報
  const diagnosisLabel =
    latestAssessment?.primary_diagnosis
      ? `${(latestAssessment.primary_diagnosis as { label: string }).label}`
      : "アセスメント未実施";

  const acwrWarning =
    acwrOverride
      ? "\n⚠️ ACWR > 1.5 のため全週の intensity は最大 'moderate' に制限されます。"
      : "";

  return `${buildCdsSystemPrefix()}
あなたは認定アスレティックトレーナーの臨床補助AIです。以下の選手データに基づき、4週間リハビリロードマップをJSON形式で生成してください。${acwrWarning}

【選手情報】
- 名前: ${athlete?.name ?? "不明"}
- ポジション: ${athlete?.position ?? "不明"}

【直近SOAPノート】
${soapSummary}

【アセスメント（ベイズ推論結果）】
主診断: ${diagnosisLabel}
${latestAssessment?.differentials ? `鑑別診断: ${JSON.stringify(latestAssessment.differentials).slice(0, 200)}` : ""}

【コンディション】
直近ACWR: ${latestCond?.acwr?.toFixed(3) ?? "データなし"}
直近Readiness: ${latestCond?.readiness_score?.toFixed(1) ?? "データなし"}/100
${acwrOverride ? "→ ACWR 過負荷警告: 全週の intensity を 'moderate' 以下に制限" : ""}

【RTP目標日】${rtpTargetDate}
【開始日】${startDate}
【各週の開始日】${weekStarts.join(", ")}
${notes ? `\n【スタッフ補足メモ】\n${notes}` : ""}

【出力形式（必ずこのJSONのみ返答）】
{
  "athlete_summary": "（選手の現状を2〜3文でまとめる）",
  "roadmap": [
    {
      "week": 1,
      "week_start_date": "YYYY-MM-DD",
      "phase": "（炎症管理 / 組織修復 / 機能回復 / RTP準備 のいずれか）",
      "weekly_goal": "（この週のリハビリ目標を1文で）",
      "rtp_criteria": "（この週終了時のRTPクライテリア達成条件を1文で）",
      "days": [
        {
          "day": "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday",
          "focus": "（その日のリハビリフォーカスを1文で）",
          "duration_min": 数値,
          "intensity": "rest" | "low" | "moderate" | "high",
          "exercises": ["（エクササイズ1）", "（エクササイズ2）"],
          "criteria_to_advance": "（次の強度に進む基準、またはnull）",
          "notes": "（補足があれば1文、なければnull）"
        }
      ],
      "staff_notes": "（スタッフへの引き継ぎ事項を1〜2文）"
    }
  ],
  "precautions": "（4週間を通じた注意事項を1〜2文）"
}

【厳守ルール】
- 「診断します」「処方します」「投薬」「手術」「医師の判断」などの医療行為ワードは絶対に含めない
- 全てのリハビリ指導は「推奨」「提案」「サポート」の表現に留める
- ACWRが1.3超の週はintensityを"high"に設定しない
${acwrOverride ? "- ACWR 1.5超: 全日程で intensity を 'moderate' 以下に強制する" : ""}
- roadmap は必ず4要素（week 1〜4）を含めること
- days は必ず7要素（月〜日）を含めること
- 必ずJSON形式のみ返答（コードブロック・説明文は不要）
`;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // ── スタッフ認証（AT / PT / master のみ）────────────────────────────────
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
      return NextResponse.json({ error: "Staff record not found" }, { status: 403 });
    }

    // リハビリロードマップは AT / PT / master のみ
    if (!["AT", "PT", "master"].includes(staff.role)) {
      return NextResponse.json(
        { error: "リハビリロードマップ生成は AT / PT / master ロールのみ使用できます" },
        { status: 403 }
      );
    }

    // ── リクエストボディ ──────────────────────────────────────────────────────
    let body: {
      athlete_id?: string;
      rtp_target_date?: string;
      start_date?: string;
      notes?: string;
    };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { athlete_id, rtp_target_date, start_date, notes } = body;

    if (!athlete_id || !rtp_target_date) {
      return NextResponse.json(
        { error: "athlete_id and rtp_target_date are required" },
        { status: 400 }
      );
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(rtp_target_date)) {
      return NextResponse.json(
        { error: "rtp_target_date must be YYYY-MM-DD" },
        { status: 400 }
      );
    }

    // ── 開始日（今週月曜日）──────────────────────────────────────────────────
    let actualStartDate = start_date;
    if (!actualStartDate) {
      const today = new Date();
      const day = today.getDay();
      const monday = new Date(today);
      monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
      actualStartDate = monday.toISOString().slice(0, 10);
    }

    // 各週の開始日を計算（4週分）
    const weekStarts: string[] = [];
    for (let i = 0; i < 4; i++) {
      const d = new Date(actualStartDate);
      d.setDate(d.getDate() + i * 7);
      weekStarts.push(d.toISOString().slice(0, 10));
    }

    // ── 選手コンテキスト取得 ──────────────────────────────────────────────────
    const context = await getAthleteContext(db, athlete_id, staff.org_id);

    if (!context.athlete) {
      return NextResponse.json(
        { error: "Athlete not found in your organization" },
        { status: 404 }
      );
    }

    // ── Hard Lock Context (P6-015): ACWR 1.5超で全強度を 'moderate' 以下にオーバーライド
    const latestAcwr = context.conditionHistory[0]?.acwr ?? 1.0;
    const acwrOverride = latestAcwr > 1.5;

    // ── Gemini で4週間ロードマップ生成（3回リトライ）──────────────────────────
    const prompt = buildRehabPrompt(
      context,
      actualStartDate,
      rtp_target_date,
      weekStarts,
      acwrOverride,
      notes?.trim()
    );

    let roadmapOutput: RoadmapOutput;
    try {
      const { result } = await callGeminiWithRetry<RoadmapOutput>(
        prompt,
        (text) => {
          const parsed = JSON.parse(cleanJsonText(text)) as RoadmapOutput;
          if (!parsed.roadmap || !Array.isArray(parsed.roadmap)) {
            throw new Error("Invalid roadmap structure");
          }
          if (parsed.roadmap.length !== 4) {
            throw new Error("Roadmap must have exactly 4 weeks");
          }
          return parsed;
        },
        { userId: staff.id, endpoint: "generate-rehab-roadmap" }
      );
      roadmapOutput = result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "RATE_LIMIT_EXCEEDED") {
        return NextResponse.json(
          { error: "レート制限に達しました。しばらく後でお試しください。" },
          { status: 429 }
        );
      }
      console.error("[generate-rehab-roadmap] Gemini error:", msg);
      return NextResponse.json({ error: "Failed to generate rehab roadmap" }, { status: 502 });
    }

    // ── ガードレール二重チェック (P6-016) ────────────────────────────────────
    const outputJson = JSON.stringify(roadmapOutput);
    if (containsRehabViolation(outputJson)) {
      console.error("[generate-rehab-roadmap] Guardrail violation in generated roadmap");
      return NextResponse.json(
        { error: "生成された計画に医療行為に関するワードが含まれていました。再度お試しください。" },
        { status: 403 }
      );
    }

    // ── Hard Lock 後処理: ACWR 1.5超の場合は intensity を 'moderate' 以下に強制 ──
    if (acwrOverride) {
      for (const week of roadmapOutput.roadmap) {
        for (const day of week.days) {
          if (day.intensity === "high") {
            day.intensity = "moderate";
          }
        }
      }
    }

    // ── 各週の week_start_date を確定値で上書き ─────────────────────────────
    roadmapOutput.roadmap.forEach((week, i) => {
      week.week_start_date = weekStarts[i];
      week.week = i + 1;
    });

    // ── weekly_training_plans に 4 行 INSERT ─────────────────────────────────
    const inserts = roadmapOutput.roadmap.map((week) => ({
      org_id: staff.org_id,
      staff_id: staff.id,
      athlete_id,
      week_start_date: week.week_start_date,
      plan_data: week,
      status: "draft" as const,
      notes: `RTP目標: ${rtp_target_date} / Week ${week.week}: ${week.phase}`,
      generated_at: new Date().toISOString(),
      plan_type: "rehab_roadmap",
    }));

    const { data: plans, error: insertError } = await db
      .from("weekly_training_plans")
      .insert(inserts)
      .select("id");

    if (insertError || !plans) {
      console.error("[generate-rehab-roadmap] DB insert error:", insertError);
      return NextResponse.json({ error: "Failed to save rehab roadmap" }, { status: 500 });
    }

    return NextResponse.json(
      {
        plan_ids: plans.map((p: { id: string }) => p.id),
        roadmap: roadmapOutput.roadmap,
        athlete_summary: roadmapOutput.athlete_summary,
        precautions: roadmapOutput.precautions,
        acwr_override: acwrOverride,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[generate-rehab-roadmap] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

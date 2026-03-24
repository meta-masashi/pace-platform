/**
 * GET /api/athlete/daily-coach
 *
 * 選手向けAIデイリーコーチカード。
 * Gemini 2.0 Flash を使い、コンディションスコア・チェックインデータを
 * 基にパーソナライズされた今日のアドバイスを生成する。
 *
 * Phase 5 v3.2 ADR-022
 *
 * レスポンス:
 * {
 *   date: string,
 *   greeting: string,       // 冒頭のパーソナライズ挨拶（1文）
 *   focus: string,          // 今日のフォーカスポイント（1文, 主観指標ベース）
 *   tip: string,            // 実践アドバイス（1〜2文, 法的安全）
 *   acwr_note: string,      // ACWR ゾーン別コメント
 *   readiness_label: string, // readiness スコアの言語化
 *   cached: boolean,        // キャッシュ応答フラグ
 * }
 *
 * ガードレール: 医療文言・診断断言・処方指示は Gemini 側プロンプトと
 * containsHarmfulContent() の二重チェックで除去。最大3回再試行。
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { callGeminiWithRetry, buildCdsSystemPrefix, cleanJsonText } from "@/lib/gemini-client";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://athlete.hachi-riskon.com",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function getDb() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ---------------------------------------------------------------------------
// ACWR ゾーン別コメント（法的安全文言）
// ---------------------------------------------------------------------------

function acwrNote(acwr: number): string {
  if (acwr < 0.8) return "今日は練習量が少なめです。回復を優先しながら、軽い動きを取り入れてみましょう。";
  if (acwr <= 1.3) return "負荷バランスは良好です。今日も安定したトレーニングを継続できそうです。";
  if (acwr <= 1.5) return "負荷が少し高めです。体のサインに注意しながら活動強度を調整しましょう。";
  return "負荷が高い状態が続いています。今日は回復を最優先に、スタッフへ相談することをお勧めします。";
}

// ---------------------------------------------------------------------------
// Readiness ラベル
// ---------------------------------------------------------------------------

function readinessLabel(score: number): string {
  if (score >= 80) return "絶好調";
  if (score >= 60) return "良好";
  if (score >= 40) return "普通";
  return "要注意";
}

// ---------------------------------------------------------------------------
// Gemini プロンプト構築
// ---------------------------------------------------------------------------

interface CoachInput {
  athleteName: string;
  readinessScore: number;
  acwr: number;
  nrs: number;
  sleepScore: number;
  subjectiveCondition: number;
  srpe: number | null;
  sleepQuality: number | null;
  fatigueFeeling: number | null;
}

function buildCoachPrompt(input: CoachInput): string {
  const {
    athleteName, readinessScore, acwr,
    nrs, sleepScore, subjectiveCondition,
    srpe, sleepQuality, fatigueFeeling,
  } = input;

  return `${buildCdsSystemPrefix()}
以下の選手データに基づき、今日のコーチングカードをJSON形式で生成してください。

【選手データ】
- 選手名: ${athleteName}
- コンディションスコア (Readiness): ${readinessScore}/100
- ACWR: ${acwr.toFixed(2)}
- NRS (痛みスコア 0=痛みなし, 10=激痛): ${nrs}
- 主観コンディション (1-5): ${subjectiveCondition}
- 睡眠スコア (1-5): ${sleepScore}
${srpe !== null ? `- 昨日のsRPE (0-100, トレーニング負荷): ${srpe}` : ""}
${sleepQuality !== null ? `- 睡眠の質 (1-5): ${sleepQuality}` : ""}
${fatigueFeeling !== null ? `- 主観的疲労感 (1=疲労 〜 5=元気): ${fatigueFeeling}` : ""}

【出力形式（必ずこのJSONのみ返答）】
{
  "greeting": "（30字以内で${athleteName}さんへの励ましメッセージ）",
  "focus": "（今日意識すべきことを1文で。痛みやコンディションを踏まえて）",
  "tip": "（具体的なアドバイスを1〜2文。医療診断・処方は絶対に含めない）"
}

【厳守ルール】
- 「〜です」「〜と診断」「〜が原因」など医療的断定は禁止
- 「薬を飲む」「手術」「炎症」「断裂」など医療処置・病名ワードは禁止
- ポジティブで実践的な内容にする
- 必ずJSON形式のみ返答（コードブロック・説明文は不要）
`;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

interface CoachCard {
  greeting: string;
  focus: string;
  tip: string;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");

  const supabaseAuth = await createClient();
  let userId: string;

  if (token) {
    const { data: { user }, error } = await supabaseAuth.auth.getUser(token);
    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: CORS_HEADERS });
    }
    userId = user.id;
  } else {
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: CORS_HEADERS });
    }
    userId = user.id;
  }

  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);

  // ── 選手レコード ──────────────────────────────────────────────────────────
  const { data: athlete } = await db
    .from("athletes")
    .select("id, name, auth_user_id")
    .eq("auth_user_id", userId)
    .maybeSingle();

  const athleteId = athlete?.id ?? userId;
  const athleteName = athlete?.name ?? "選手";

  // ── 本日チェックインデータ取得 ──────────────────────────────────────────
  const { data: metric } = await db
    .from("daily_metrics")
    .select("nrs, sleep_score, subjective_condition, srpe, sleep_quality, fatigue_feeling")
    .eq("athlete_id", athleteId)
    .eq("date", today)
    .maybeSingle();

  // ── コンディションキャッシュ取得 ─────────────────────────────────────────
  const { data: cache } = await db
    .from("athlete_condition_cache")
    .select("readiness_score, acwr")
    .eq("athlete_id", athleteId)
    .eq("date", today)
    .maybeSingle();

  const readinessScore = cache?.readiness_score ?? 50;
  const acwr = cache?.acwr ?? 1.0;
  const nrs = metric?.nrs ?? 0;
  const sleepScore = metric?.sleep_score ?? 3;
  const subjectiveCondition = metric?.subjective_condition ?? 3;

  // チェックイン未提出の場合はデフォルトカードを返す（Gemini 節約）
  if (!metric) {
    return NextResponse.json(
      {
        date: today,
        greeting: `${athleteName}さん、今日もよろしくお願いします！`,
        focus: "まずは今日のコンディションを記録してみましょう。",
        tip: "デイリーチェックインを行うと、あなた専用のアドバイスが届きます。",
        acwr_note: acwrNote(acwr),
        readiness_label: readinessLabel(readinessScore),
        cached: false,
        no_checkin: true,
      },
      { headers: CORS_HEADERS }
    );
  }

  // ── Gemini AI コーチカード生成 ──────────────────────────────────────────
  const input: CoachInput = {
    athleteName,
    readinessScore,
    acwr,
    nrs,
    sleepScore,
    subjectiveCondition,
    srpe: metric?.srpe ?? null,
    sleepQuality: metric?.sleep_quality ?? null,
    fatigueFeeling: metric?.fatigue_feeling ?? null,
  };

  try {
    const { result: card } = await callGeminiWithRetry<CoachCard>(
      buildCoachPrompt(input),
      (text) => {
        const parsed = JSON.parse(cleanJsonText(text)) as CoachCard;
        // 必須フィールド検証
        if (!parsed.greeting || !parsed.focus || !parsed.tip) {
          throw new Error("Invalid coach card structure");
        }
        return parsed;
      },
      { userId: athleteId, endpoint: "daily-coach" }
    );

    return NextResponse.json(
      {
        date: today,
        greeting: card.greeting,
        focus: card.focus,
        tip: card.tip,
        acwr_note: acwrNote(acwr),
        readiness_label: readinessLabel(readinessScore),
        cached: false,
      },
      { headers: CORS_HEADERS }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    // Gemini 失敗時のフォールバック（サービス継続性優先）
    if (msg === "RATE_LIMIT_EXCEEDED") {
      return NextResponse.json({ error: "レート制限に達しました。しばらく後でお試しください。" }, { status: 429, headers: CORS_HEADERS });
    }

    console.error("[daily-coach] Gemini error:", msg);

    // フォールバックカード（ルールベース）
    const fallback = buildFallbackCard(input);
    return NextResponse.json(
      {
        date: today,
        ...fallback,
        acwr_note: acwrNote(acwr),
        readiness_label: readinessLabel(readinessScore),
        cached: false,
        fallback: true,
      },
      { headers: CORS_HEADERS }
    );
  }
}

// ---------------------------------------------------------------------------
// ルールベースフォールバックカード（Gemini 不使用）
// ---------------------------------------------------------------------------

function buildFallbackCard(input: CoachInput): Pick<CoachCard, "greeting" | "focus" | "tip"> {
  const { athleteName, readinessScore, nrs, acwr } = input;

  let focus = "今日も一日、自分のペースで頑張りましょう。";
  let tip = "水分補給と十分なウォームアップを忘れずに。";

  if (nrs >= 5) {
    focus = "今日は痛みが少し強めです。無理せず身体の声を聞きましょう。";
    tip = "強度の高いトレーニングは避け、スタッフに相談しながら進めましょう。";
  } else if (readinessScore >= 80) {
    focus = "コンディションは絶好調です！今日のトレーニングを楽しみましょう。";
    tip = "しっかり追い込める日です。目標を設定して挑戦してみましょう。";
  } else if (readinessScore < 40) {
    focus = "今日は回復を優先する日です。";
    tip = "軽いストレッチやウォーキング程度にとどめ、睡眠・栄養を意識しましょう。";
  } else if (acwr > 1.3) {
    focus = "最近の練習負荷が高めです。今日は少し落ち着いたメニューを心がけましょう。";
    tip = "積極的な回復（アクティブリカバリー）が効果的です。";
  }

  return {
    greeting: `${athleteName}さん、今日もよろしくお願いします！`,
    focus,
    tip,
  };
}

/**
 * PACE Platform — アスリート個別コンディショニング API
 *
 * GET /api/conditioning/:athleteId
 *
 * 指定アスリートの最新コンディショニングスコアと
 * 42日間のトレンドデータを返す。
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withApiHandler, ApiError } from "@/lib/api/handler";
import { calculateConditioningScore } from "@/lib/conditioning/engine";
import { classifyTrend } from "@/lib/conditioning/team-score";
import { callGeminiWithRetry, buildCdsSystemPrefix, MEDICAL_DISCLAIMER } from "@/lib/gemini/client";
import { checkRateLimit, logTokenUsage, buildRateLimitResponse } from "@/lib/gemini/rate-limiter";
import { sanitizeUserInput } from "@/lib/shared/security-helpers";
import { validateUUID } from "@/lib/security/input-validator";
import type {
  ConditioningInput,
  ConditioningResult,
  DailyMetricRow,
} from "@/lib/conditioning/types";

// ---------------------------------------------------------------------------
// レスポンス型定義
// ---------------------------------------------------------------------------

interface DailyTrendEntry {
  date: string;
  conditioning_score: number | null;
  fitness_ewma: number | null;
  fatigue_ewma: number | null;
  acwr: number | null;
  srpe: number | null;
}

interface ConditioningResponse {
  success: true;
  data: {
    athlete_id: string;
    current: ConditioningResult;
    latest_date: string;
    trend: DailyTrendEntry[];
    trendDirection: 'improving' | 'stable' | 'declining';
    insight: string;
    fitnessTrend: number[];
    fatigueTrend: number[];
  };
}

interface ErrorResponse {
  success: false;
  error: string;
}

// ---------------------------------------------------------------------------
// AI インサイト生成
// ---------------------------------------------------------------------------

function buildInsightPrompt(data: {
  conditioningScore: number;
  fitnessEwma: number;
  fatigueEwma: number;
  acwr: number;
}): string {
  return `${buildCdsSystemPrefix()}
アスリートのコンディションデータから、日本語で短い（1-2文の）インサイトを生成してください。
医学用語を使わず、アスリートが理解しやすい平易な日本語でお願いします。
出力はJSON形式で: {"insight": "ここにテキスト"}

データ:
- コンディショニングスコア: ${data.conditioningScore}/100
- フィットネス蓄積(42日EWMA): ${data.fitnessEwma}
- 疲労負荷(7日EWMA): ${data.fatigueEwma}
- ACWR: ${data.acwr}

スコアの解釈:
- 70-100: 最適コンディション
- 40-69: 注意が必要
- 0-39: 回復を優先すべき

ACWRの解釈:
- 0.8-1.3: 安全ゾーン
- 1.3-1.5: 注意ゾーン
- 1.5以上: 過負荷リスク
`;
}

async function generateInsight(
  data: {
    conditioningScore: number;
    fitnessEwma: number;
    fatigueEwma: number;
    acwr: number;
  },
  userId: string,
  log: { warn: (msg: string, data?: Record<string, unknown>) => void },
): Promise<string> {
  try {
    // 防壁3: レートリミットチェック
    const rateLimit = await checkRateLimit(userId, "conditioning-insight");
    if (!rateLimit.allowed) {
      log.warn("レートリミット超過 — フォールバック使用");
      return generateFallbackInsight(data);
    }

    const prompt = buildInsightPrompt(data);

    const { result } = await callGeminiWithRetry<{ insight: string }>(
      prompt,
      (text) => {
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) throw new Error("JSON not found in response");
        return JSON.parse(match[0]) as { insight: string };
      },
      { userId, endpoint: "conditioning-insight" }
    );

    // 防壁3: トークン使用量ログ
    await logTokenUsage({
      staffId: userId,
      endpoint: "conditioning-insight",
      inputChars: prompt.length,
      estimatedTokens: Math.ceil(prompt.length / 4),
    });

    return `${result.insight} ${MEDICAL_DISCLAIMER}`;
  } catch {
    return generateFallbackInsight(data);
  }
}

function generateFallbackInsight(data: {
  conditioningScore: number;
  acwr: number;
}): string {
  if (data.conditioningScore >= 70) {
    return "コンディションは良好です。計画通りのトレーニングを続けましょう。";
  }
  if (data.conditioningScore >= 40) {
    if (data.acwr > 1.3) {
      return "トレーニング負荷がやや高めです。強度を調整して経過を見ましょう。";
    }
    return "コンディションに注意が必要です。休息とリカバリーを意識しましょう。";
  }
  return "回復を優先してください。軽めのアクティブリカバリーがおすすめです。";
}

// ---------------------------------------------------------------------------
// GET /api/conditioning/:athleteId
// ---------------------------------------------------------------------------

export const GET = withApiHandler(async (req, ctx) => {
  const { athleteId } = ctx.params;

  // ----- バリデーション -----
  if (!athleteId || !validateUUID(athleteId)) {
    throw new ApiError(400, "アスリートIDが不正です。有効なUUID形式で指定してください。");
  }

  // ----- 認証チェック -----
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new ApiError(401, "認証が必要です。ログインしてください。");
  }

  // ----- アスリートのアクセス確認（RLS 経由で同組織のスタッフのみ）-----
  const { data: athlete, error: athleteError } = await supabase
    .from("athletes")
    .select("id, org_id")
    .eq("id", athleteId)
    .single();

  if (athleteError || !athlete) {
    throw new ApiError(403, "指定されたアスリートが見つからないか、アクセス権がありません。");
  }

  // ----- 42日間の daily_metrics を取得 -----
  const today = new Date().toISOString().split("T")[0]!;
  const fortyTwoDaysAgo = new Date();
  fortyTwoDaysAgo.setDate(fortyTwoDaysAgo.getDate() - 42);
  const fromDate = fortyTwoDaysAgo.toISOString().split("T")[0]!;

  const { data: metricsRows, error: metricsError } = await supabase
    .from("daily_metrics")
    .select(
      "date, srpe, sleep_score, fatigue_subjective, hrv, hrv_baseline, conditioning_score, fitness_ewma, fatigue_ewma, acwr"
    )
    .eq("athlete_id", athleteId)
    .gte("date", fromDate)
    .lte("date", today)
    .order("date", { ascending: true });

  if (metricsError) {
    ctx.log.error("daily_metrics 取得エラー", { detail: metricsError });
    throw new ApiError(500, "コンディションデータの取得に失敗しました。");
  }

  const rows = metricsRows ?? [];

  if (rows.length === 0) {
    throw new ApiError(404, "コンディションデータが存在しません。");
  }

  // ----- 最新日のデータからコンディショニングスコアを再計算 -----
  const latestRow = rows[rows.length - 1]!;
  const historyRows = rows.slice(0, -1);

  const history: DailyMetricRow[] = historyRows.map((row) => ({
    date: row.date as string,
    srpe: row.srpe as number | null,
    sleepScore: row.sleep_score as number | null,
    fatigueSubjective: row.fatigue_subjective as number | null,
    hrv: row.hrv as number | null,
    hrvBaseline: row.hrv_baseline as number | null,
  }));

  const latestHrv = latestRow.hrv as number | null;
  const latestHrvBaseline = latestRow.hrv_baseline as number | null;

  const todayInput: ConditioningInput = {
    srpe: (latestRow.srpe as number | null) ?? 0,
    sleepScore: (latestRow.sleep_score as number | null) ?? 5,
    fatigueSubjective: (latestRow.fatigue_subjective as number | null) ?? 5,
    ...(latestHrv !== null ? { hrv: latestHrv } : {}),
    ...(latestHrvBaseline !== null ? { hrvBaseline: latestHrvBaseline } : {}),
  };

  const current = calculateConditioningScore(history, todayInput);

  // ----- トレンドデータの構築 -----
  const trend: DailyTrendEntry[] = rows.map((row) => ({
    date: row.date as string,
    conditioning_score: row.conditioning_score as number | null,
    fitness_ewma: row.fitness_ewma as number | null,
    fatigue_ewma: row.fatigue_ewma as number | null,
    acwr: row.acwr as number | null,
    srpe: row.srpe as number | null,
  }));

  // ----- トレンド方向の算出（直近7日） -----
  const recentScores = rows
    .slice(-7)
    .map((r) => (r.conditioning_score as number | null) ?? current.conditioningScore);
  const trendDirection = classifyTrend(recentScores);

  // ----- スパークライン用トレンド配列（直近14日分）-----
  const recentRows = rows.slice(-14);
  const fitnessTrend = recentRows.map(
    (r) => (r.fitness_ewma as number | null) ?? 0
  );
  const fatigueTrend = recentRows.map(
    (r) => (r.fatigue_ewma as number | null) ?? 0
  );

  // ----- AI インサイト生成 -----
  const insight = await generateInsight(
    {
      conditioningScore: current.conditioningScore,
      fitnessEwma: current.fitnessEwma,
      fatigueEwma: current.fatigueEwma,
      acwr: current.acwr,
    },
    user.id,
    ctx.log,
  );

  // ----- コーチング履歴に保存（同日重複は無視） -----
  const coachingDate = new Date().toISOString().split('T')[0]!;
  if (insight) {
    const { data: athleteForOrg } = await supabase
      .from('athletes')
      .select('org_id')
      .eq('id', athleteId)
      .single();

    if (athleteForOrg?.org_id) {
      await supabase.from('coaching_history').upsert(
        {
          athlete_id: athleteId,
          org_id: athleteForOrg.org_id as string,
          coaching_date: coachingDate,
          advice_text: insight,
          context_snapshot: {
            conditioningScore: current.conditioningScore,
            fitnessEwma: current.fitnessEwma,
            fatigueEwma: current.fatigueEwma,
            acwr: current.acwr,
          },
        },
        { onConflict: 'athlete_id,coaching_date' },
      );
    }
  }

  // ----- レスポンス -----
  return NextResponse.json({
    success: true,
    data: {
      athlete_id: athleteId,
      current,
      latest_date: latestRow.date as string,
      trend,
      trendDirection,
      insight,
      fitnessTrend,
      fatigueTrend,
    },
  });
}, { service: 'conditioning' });

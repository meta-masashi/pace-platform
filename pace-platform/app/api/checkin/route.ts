/**
 * PACE Platform — アスリート日次チェックイン API
 *
 * POST /api/checkin
 *
 * アスリートの日次コンディションデータを受け取り、
 * コンディショニングスコアを算出して daily_metrics に upsert する。
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calculateConditioningScore } from "@/lib/conditioning/engine";
import { canAccess } from "@/lib/billing/plan-gates";
import type {
  ConditioningInput,
  ConditioningResult,
  DailyMetricRow,
} from "@/lib/conditioning/types";

// ---------------------------------------------------------------------------
// リクエスト / レスポンス型定義
// ---------------------------------------------------------------------------

interface CheckinRequestBody {
  athlete_id: string;
  date: string;
  nrs: number;
  rpe: number;
  training_duration_min: number;
  sleep_score: number;
  subjective_condition: number;
  fatigue_subjective: number;
  hrv?: number;
  medication_nsaid_24h?: boolean;
  menstrual_phase?: string;
}

interface CheckinResponse {
  success: true;
  data: {
    athlete_id: string;
    date: string;
    srpe: number;
    conditioning: ConditioningResult;
  };
}

interface ErrorResponse {
  success: false;
  error: string;
}

// ---------------------------------------------------------------------------
// バリデーション
// ---------------------------------------------------------------------------

function validateCheckinBody(
  body: unknown
): body is CheckinRequestBody {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;

  return (
    typeof b.athlete_id === "string" &&
    b.athlete_id.length > 0 &&
    typeof b.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(b.date) &&
    typeof b.nrs === "number" &&
    b.nrs >= 0 &&
    b.nrs <= 10 &&
    typeof b.rpe === "number" &&
    b.rpe >= 0 &&
    b.rpe <= 10 &&
    typeof b.training_duration_min === "number" &&
    b.training_duration_min >= 0 &&
    typeof b.sleep_score === "number" &&
    b.sleep_score >= 0 &&
    b.sleep_score <= 10 &&
    typeof b.subjective_condition === "number" &&
    b.subjective_condition >= 0 &&
    b.subjective_condition <= 10 &&
    typeof b.fatigue_subjective === "number" &&
    b.fatigue_subjective >= 0 &&
    b.fatigue_subjective <= 10 &&
    (b.hrv === undefined ||
      (typeof b.hrv === "number" && b.hrv >= 0))
  );
}

// ---------------------------------------------------------------------------
// POST /api/checkin
// ---------------------------------------------------------------------------

export async function POST(
  request: Request
): Promise<NextResponse<CheckinResponse | ErrorResponse>> {
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

    if (!validateCheckinBody(body)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "入力データが不正です。athlete_id, date(YYYY-MM-DD), nrs(0-10), rpe(0-10), training_duration_min(>=0), sleep_score(0-10), subjective_condition(0-10), fatigue_subjective(0-10) を正しく指定してください。",
        },
        { status: 400 }
      );
    }

    // ----- アスリートの org_id アクセス確認（RLS で保護）-----
    const { data: athlete, error: athleteError } = await supabase
      .from("athletes")
      .select("id, org_id")
      .eq("id", body.athlete_id)
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

    // ----- プラン別機能ゲート（防壁3）-----
    const accessResult = await canAccess(supabase, athlete.org_id, 'feature_daily_checkin');
    if (!accessResult.allowed) {
      return NextResponse.json(
        { success: false, error: accessResult.reason ?? 'この機能はご利用いただけません。' },
        { status: 403 }
      );
    }

    // ----- sRPE 算出 -----
    const srpe = body.rpe * body.training_duration_min;

    // ----- 過去42日分の daily_metrics を取得 -----
    const fortyTwoDaysAgo = new Date(body.date);
    fortyTwoDaysAgo.setDate(fortyTwoDaysAgo.getDate() - 42);
    const fromDate = fortyTwoDaysAgo.toISOString().split("T")[0]!;

    const { data: historyRows, error: historyError } = await supabase
      .from("daily_metrics")
      .select("date, srpe, sleep_score, fatigue_subjective, hrv, hrv_baseline")
      .eq("athlete_id", body.athlete_id)
      .gte("date", fromDate)
      .lt("date", body.date)
      .order("date", { ascending: true });

    if (historyError) {
      console.error("[checkin] daily_metrics 取得エラー:", historyError);
      return NextResponse.json(
        { success: false, error: "コンディションデータの取得に失敗しました。" },
        { status: 500 }
      );
    }

    // ----- DailyMetricRow 形式に変換 -----
    const history: DailyMetricRow[] = (historyRows ?? []).map((row) => ({
      date: row.date as string,
      srpe: row.srpe as number | null,
      sleepScore: row.sleep_score as number | null,
      fatigueSubjective: row.fatigue_subjective as number | null,
      hrv: row.hrv as number | null,
      hrvBaseline: row.hrv_baseline as number | null,
    }));

    // ----- HRV ベースライン取得（Pro Mode 判定用）-----
    let hrvBaseline: number | undefined;
    if (body.hrv !== undefined) {
      const { data: baselineRow } = await supabase
        .from("athlete_baselines")
        .select("hrv_baseline")
        .eq("athlete_id", body.athlete_id)
        .single();

      if (baselineRow?.hrv_baseline != null) {
        hrvBaseline = baselineRow.hrv_baseline as number;
      }
    }

    // ----- コンディショニングスコア算出 -----
    const todayInput: ConditioningInput = {
      srpe,
      sleepScore: body.sleep_score,
      fatigueSubjective: body.fatigue_subjective,
      ...(body.hrv !== undefined ? { hrv: body.hrv } : {}),
      ...(hrvBaseline !== undefined ? { hrvBaseline } : {}),
    };

    const conditioning = calculateConditioningScore(history, todayInput);

    // ----- daily_metrics に upsert -----
    const { error: upsertError } = await supabase
      .from("daily_metrics")
      .upsert(
        {
          athlete_id: body.athlete_id,
          date: body.date,
          nrs: body.nrs,
          rpe: body.rpe,
          training_duration_min: body.training_duration_min,
          srpe,
          sleep_score: body.sleep_score,
          subjective_condition: body.subjective_condition,
          fatigue_subjective: body.fatigue_subjective,
          hrv: body.hrv ?? null,
          medication_nsaid_24h: body.medication_nsaid_24h ?? false,
          menstrual_phase: body.menstrual_phase ?? null,
          conditioning_score: conditioning.conditioningScore,
          fitness_ewma: conditioning.fitnessEwma,
          fatigue_ewma: conditioning.fatigueEwma,
          acwr: conditioning.acwr,
        },
        { onConflict: "athlete_id,date" }
      );

    if (upsertError) {
      console.error("[checkin] daily_metrics upsert エラー:", upsertError);
      return NextResponse.json(
        { success: false, error: "コンディションデータの保存に失敗しました。" },
        { status: 500 }
      );
    }

    // ----- レスポンス -----
    return NextResponse.json({
      success: true,
      data: {
        athlete_id: body.athlete_id,
        date: body.date,
        srpe,
        conditioning,
      },
    });
  } catch (err) {
    console.error("[checkin] 予期しないエラー:", err);
    return NextResponse.json(
      { success: false, error: "サーバー内部エラーが発生しました。" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/athlete/checkin
 * GET  /api/athlete/checkin  (本日提出済み確認)
 *
 * v3.2 拡張: srpe / sleep_quality / fatigue_feeling を受け取り、
 * チェックイン後に athlete_condition_cache を非同期更新する。
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://athlete.hachi-riskon.com",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Preflight
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ---------------------------------------------------------------------------
// Fitness-Fatigue Model (EWMA)
// α₄₂ = 2/(42+1) ≈ 0.04651  → 長期フィットネス蓄積
// α₇  = 2/(7+1)  = 0.25      → 短期疲労
// ---------------------------------------------------------------------------

const ALPHA_FITNESS = 2 / (42 + 1);
const ALPHA_FATIGUE = 2 / (7 + 1);

/**
 * 直近 42 日分の srpe を取得して EWMA を計算し、
 * athlete_condition_cache を UPSERT する。
 */
async function computeAndCacheCondition(
  db: ReturnType<typeof getServiceClient>,
  athleteId: string,
  today: string
): Promise<void> {
  // 直近 42 日分の daily_metrics を取得
  const from = new Date(today);
  from.setDate(from.getDate() - 42);

  const { data: rows } = await db
    .from("daily_metrics")
    .select("date, srpe, sleep_quality, fatigue_feeling")
    .eq("athlete_id", athleteId)
    .gte("date", from.toISOString().slice(0, 10))
    .order("date", { ascending: true });

  if (!rows || rows.length === 0) return;

  // ─── EWMA 計算 ───────────────────────────────────────────────────────────
  let fitness = 0;
  let fatigue = 0;

  // ACWR 用に 28 日・7 日の単純平均負荷を計算
  const loadsMap: Record<string, number> = {};
  for (const r of rows) {
    loadsMap[r.date] = r.srpe ?? 0;
  }

  // 当日含む直近 N 日の平均負荷
  const sortedDates = Object.keys(loadsMap).sort();
  const latestDates = sortedDates.slice(-28);
  const acute7 = latestDates.slice(-7).reduce((s, d) => s + loadsMap[d], 0) / 7;
  const chronic28 =
    latestDates.length > 0
      ? latestDates.reduce((s, d) => s + loadsMap[d], 0) / latestDates.length
      : 0;
  const acwr = chronic28 > 0 ? acute7 / chronic28 : 1.0;

  // EWMA: 最古 → 最新の順に更新
  for (const r of rows) {
    const load = r.srpe ?? 0;
    fitness = fitness + ALPHA_FITNESS * (load - fitness);
    fatigue = fatigue + ALPHA_FATIGUE * (load - fatigue);
  }

  // ─── 主観ペナルティ係数 ───────────────────────────────────────────────────
  // 最新エントリの sleep_quality / fatigue_feeling を使用
  const latest = rows[rows.length - 1];
  const sleepQ = latest.sleep_quality ?? 3;
  const fatigueF = latest.fatigue_feeling ?? 3;
  // スコアが 3 を下回るごとに 5% ずつペナルティ
  const sleepPenalty = Math.max(0, (3 - sleepQ) * 0.05);
  const fatiguePenalty = Math.max(0, (3 - fatigueF) * 0.05);
  const subjectivePenalty = sleepPenalty + fatiguePenalty;

  // ─── Readiness スコア (0-100) ─────────────────────────────────────────────
  // form = fitness - fatigue (トレーニング科学の "form" 概念)
  const form = fitness - fatigue;
  // 正規化: form は通常 -50〜+50 の範囲
  const readinessRaw = Math.max(0, Math.min(100, 50 + form));
  const readinessScore = Math.max(0, readinessRaw * (1 - subjectivePenalty));

  // ─── HRV デルタ（Level 2 は別エンドポイントで更新、ここでは Level 1）────
  const level = 1; // HRV連携なし

  await db.from("athlete_condition_cache").upsert(
    {
      athlete_id: athleteId,
      date: today,
      fitness_score: Math.round(fitness * 100) / 100,
      fatigue_score: Math.round(fatigue * 100) / 100,
      readiness_score: Math.round(readinessScore * 10) / 10,
      acwr: Math.round(acwr * 1000) / 1000,
      acwr_acute: Math.round(acute7 * 100) / 100,
      acwr_chronic: Math.round(chronic28 * 100) / 100,
      level,
      hrv_baseline_delta: null,
      subjective_penalty: Math.round(subjectivePenalty * 100) / 100,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "athlete_id,date" }
  );
}

// ---------------------------------------------------------------------------
// POST: チェックイン
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: CORS_HEADERS });
    }

    const supabaseAuth = await createClient();
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: CORS_HEADERS });
    }

    const body = await req.json();
    const {
      nrs,
      sleep_score,
      subjective_condition,
      memo,
      // v3.2 新規フィールド
      srpe,
      sleep_quality,
      fatigue_feeling,
    } = body;

    const today = new Date().toISOString().slice(0, 10);

    const hp_computed = Math.min(
      100,
      (10 - (nrs ?? 0)) * 5 + (sleep_score ?? 3) * 5 + (subjective_condition ?? 3) * 5
    );

    const serviceSupabase = getServiceClient();

    // 選手レコード確認
    const { data: athleteRecord } = await serviceSupabase
      .from("athletes")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (!athleteRecord) {
      return NextResponse.json(
        {
          error: "ATHLETE_NOT_REGISTERED",
          message: "選手登録が完了していません。スタッフから招待コードを受け取り、新規登録画面から登録してください。",
        },
        { status: 403, headers: CORS_HEADERS }
      );
    }

    // daily_metrics UPSERT (v3.2: srpe / sleep_quality / fatigue_feeling 追加)
    const upsertData: Record<string, unknown> = {
      athlete_id: user.id,
      date: today,
      nrs: nrs ?? 0,
      sleep_score: sleep_score ?? 3,
      subjective_condition: subjective_condition ?? 3,
      memo: memo?.trim() || null,
      hp_computed,
    };

    if (srpe !== undefined && srpe !== null) {
      upsertData.srpe = Math.max(0, Math.min(100, Math.round(srpe)));
    }
    if (sleep_quality !== undefined && sleep_quality !== null) {
      upsertData.sleep_quality = Math.max(1, Math.min(5, Math.round(sleep_quality)));
    }
    if (fatigue_feeling !== undefined && fatigue_feeling !== null) {
      upsertData.fatigue_feeling = Math.max(1, Math.min(5, Math.round(fatigue_feeling)));
    }

    const { error: dbError } = await serviceSupabase
      .from("daily_metrics")
      .upsert(upsertData, { onConflict: "athlete_id,date" });

    if (dbError) {
      console.error("[checkin] DB error:", dbError);
      return NextResponse.json({ error: dbError.message }, { status: 500, headers: CORS_HEADERS });
    }

    // コンディションキャッシュを非同期更新（失敗してもチェックインは成功扱い）
    computeAndCacheCondition(serviceSupabase, user.id, today).catch((err) => {
      console.error("[checkin] condition cache update failed:", err);
    });

    return NextResponse.json({ success: true, hp_computed }, { headers: CORS_HEADERS });
  } catch (e) {
    console.error("[checkin] Unexpected error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: CORS_HEADERS });
  }
}

// ---------------------------------------------------------------------------
// GET: 本日提出済み確認
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: CORS_HEADERS });
  }

  const supabaseAuth = await createClient();
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: CORS_HEADERS });
  }

  const today = new Date().toISOString().slice(0, 10);
  const serviceSupabase = getServiceClient();
  const { data } = await serviceSupabase
    .from("daily_metrics")
    .select("id, nrs, sleep_score, subjective_condition, memo, hp_computed, srpe, sleep_quality, fatigue_feeling")
    .eq("athlete_id", user.id)
    .eq("date", today)
    .maybeSingle();

  return NextResponse.json({ submitted: !!data, data: data ?? null }, { headers: CORS_HEADERS });
}

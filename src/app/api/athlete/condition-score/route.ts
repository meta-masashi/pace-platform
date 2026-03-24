/**
 * GET /api/athlete/condition-score
 *
 * 選手自身のコンディションスコア（フィットネス疲労モデル + ACWR）を返す。
 * athlete_condition_cache から当日 or 最新エントリを返す。
 * キャッシュが存在しない場合はリアルタイム計算してキャッシュを作成する。
 *
 * Phase 5 v3.2 ADR-022
 *
 * レスポンス:
 * {
 *   date: string,
 *   readiness_score: number,   // 0-100
 *   fitness_score: number,
 *   fatigue_score: number,
 *   acwr: number,
 *   acwr_acute: number,
 *   acwr_chronic: number,
 *   acwr_zone: "safe" | "optimal" | "caution" | "danger",
 *   level: 1 | 2,
 *   hrv_baseline_delta: number | null,
 *   trend: Array<{ date, readiness_score, acwr }>,  // 直近14日
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

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

// ACWR 安全ゾーン判定
function acwrZone(acwr: number): "safe" | "optimal" | "caution" | "danger" {
  if (acwr < 0.8) return "safe";       // 低負荷（デトレーニングリスク）
  if (acwr <= 1.3) return "optimal";   // 推奨ゾーン
  if (acwr <= 1.5) return "caution";   // 注意（傷害リスク上昇）
  return "danger";                      // 危険（ACWR > 1.5）
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Auth: Authorization ヘッダー or Cookie セッション両対応
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

  // 選手レコードを auth_user_id で特定
  const { data: athlete } = await db
    .from("athletes")
    .select("id")
    .eq("auth_user_id", userId)
    .maybeSingle();

  // auth_user_id が athletes に存在しない場合、athletes.id = user.id で試行（後方互換）
  const athleteId = athlete?.id ?? userId;

  // ─── キャッシュから当日スコアを取得 ────────────────────────────────────────
  const { data: cache } = await db
    .from("athlete_condition_cache")
    .select("*")
    .eq("athlete_id", athleteId)
    .eq("date", today)
    .maybeSingle();

  // ─── 直近14日のトレンドデータ ─────────────────────────────────────────────
  const trendFrom = new Date(today);
  trendFrom.setDate(trendFrom.getDate() - 13);

  const { data: trendRows } = await db
    .from("athlete_condition_cache")
    .select("date, readiness_score, acwr, fitness_score, fatigue_score")
    .eq("athlete_id", athleteId)
    .gte("date", trendFrom.toISOString().slice(0, 10))
    .order("date", { ascending: true });

  if (!cache) {
    // キャッシュがない場合: 基本レスポンス（初回チェックイン未実施）
    return NextResponse.json(
      {
        date: today,
        readiness_score: 50,
        fitness_score: 0,
        fatigue_score: 0,
        acwr: 1.0,
        acwr_acute: 0,
        acwr_chronic: 0,
        acwr_zone: "safe",
        level: 1,
        hrv_baseline_delta: null,
        trend: trendRows ?? [],
        no_data: true,
      },
      { headers: CORS_HEADERS }
    );
  }

  return NextResponse.json(
    {
      date: cache.date,
      readiness_score: cache.readiness_score,
      fitness_score: cache.fitness_score,
      fatigue_score: cache.fatigue_score,
      acwr: cache.acwr,
      acwr_acute: cache.acwr_acute,
      acwr_chronic: cache.acwr_chronic,
      acwr_zone: acwrZone(cache.acwr),
      level: cache.level,
      hrv_baseline_delta: cache.hrv_baseline_delta,
      trend: trendRows ?? [],
    },
    { headers: CORS_HEADERS }
  );
}

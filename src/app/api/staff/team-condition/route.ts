/**
 * POST /api/staff/team-condition
 *
 * スタッフ向けチームコンディションサマリー。
 * 各選手の当日 athlete_condition_cache を集約して返す。
 *
 * Phase 5 v3.2 ADR-022
 *
 * リクエスト: { team_id?: string }  省略時: スタッフの所属組織全選手
 *
 * レスポンス:
 * {
 *   date: string,
 *   team_readiness_avg: number,
 *   critical_count: number,     // readiness < 40
 *   watchlist_count: number,    // readiness 40-59
 *   normal_count: number,       // readiness 60-79
 *   zone_count: number,         // readiness >= 80
 *   athletes: Array<{
 *     id, name, position,
 *     readiness_score, acwr, acwr_zone,
 *     fitness_score, fatigue_score,
 *     status: "critical" | "watchlist" | "normal" | "zone",
 *     hrv_baseline_delta: number | null,
 *     checkin_submitted: boolean,
 *   }>
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

function getDb() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function acwrZone(acwr: number): "safe" | "optimal" | "caution" | "danger" {
  if (acwr < 0.8) return "safe";
  if (acwr <= 1.3) return "optimal";
  if (acwr <= 1.5) return "caution";
  return "danger";
}

function readinessStatus(
  score: number
): "critical" | "watchlist" | "normal" | "zone" {
  if (score < 40) return "critical";
  if (score < 60) return "watchlist";
  if (score < 80) return "normal";
  return "zone";
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();

  // ── スタッフレコード取得 ──────────────────────────────────────────────────
  const { data: staff } = await db
    .from("staff")
    .select("id, org_id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!staff) {
    return NextResponse.json({ error: "Staff record not found" }, { status: 404 });
  }

  // ── リクエストボディ ──────────────────────────────────────────────────────
  let teamId: string | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    teamId = body.team_id;
  } catch {
    // body なしは許容
  }

  const today = new Date().toISOString().slice(0, 10);

  // ── 選手一覧取得 ──────────────────────────────────────────────────────────
  let athleteQuery = db
    .from("athletes")
    .select("id, name, position, auth_user_id")
    .eq("org_id", staff.org_id)
    .eq("is_active", true);

  if (teamId) {
    athleteQuery = athleteQuery.eq("team_id", teamId);
  }

  const { data: athletes } = await athleteQuery.order("name", { ascending: true });

  if (!athletes || athletes.length === 0) {
    return NextResponse.json({
      date: today,
      team_readiness_avg: 0,
      critical_count: 0,
      watchlist_count: 0,
      normal_count: 0,
      zone_count: 0,
      athletes: [],
    });
  }

  const athleteIds = athletes.map((a) => a.id);

  // ── コンディションキャッシュ一括取得 ────────────────────────────────────
  const { data: caches } = await db
    .from("athlete_condition_cache")
    .select("athlete_id, readiness_score, fitness_score, fatigue_score, acwr, acwr_acute, acwr_chronic, hrv_baseline_delta, level")
    .in("athlete_id", athleteIds)
    .eq("date", today);

  const cacheMap = new Map(
    (caches ?? []).map((c) => [c.athlete_id, c])
  );

  // ── 本日チェックイン済み選手 ─────────────────────────────────────────────
  const { data: checkins } = await db
    .from("daily_metrics")
    .select("athlete_id")
    .in("athlete_id", athleteIds)
    .eq("date", today);

  const checkinSet = new Set((checkins ?? []).map((c) => c.athlete_id));

  // ── 集約 ──────────────────────────────────────────────────────────────────
  const result = athletes.map((athlete) => {
    const cache = cacheMap.get(athlete.id);
    const readiness = cache?.readiness_score ?? 50;
    const acwr = cache?.acwr ?? 1.0;
    return {
      id: athlete.id,
      name: athlete.name,
      position: athlete.position ?? null,
      readiness_score: readiness,
      acwr,
      acwr_zone: acwrZone(acwr),
      fitness_score: cache?.fitness_score ?? 0,
      fatigue_score: cache?.fatigue_score ?? 0,
      status: readinessStatus(readiness),
      hrv_baseline_delta: cache?.hrv_baseline_delta ?? null,
      checkin_submitted: checkinSet.has(athlete.id),
    };
  });

  // ステータス別カウント
  const critical = result.filter((a) => a.status === "critical").length;
  const watchlist = result.filter((a) => a.status === "watchlist").length;
  const normal = result.filter((a) => a.status === "normal").length;
  const zone = result.filter((a) => a.status === "zone").length;

  const avgReadiness =
    result.length > 0
      ? result.reduce((s, a) => s + a.readiness_score, 0) / result.length
      : 0;

  // クリティカル → ウォッチリスト → ノーマル → ゾーン の順にソート
  const statusOrder = { critical: 0, watchlist: 1, normal: 2, zone: 3 };
  result.sort(
    (a, b) =>
      statusOrder[a.status] - statusOrder[b.status] ||
      a.readiness_score - b.readiness_score
  );

  return NextResponse.json({
    date: today,
    team_readiness_avg: Math.round(avgReadiness * 10) / 10,
    critical_count: critical,
    watchlist_count: watchlist,
    normal_count: normal,
    zone_count: zone,
    checkin_rate:
      athletes.length > 0
        ? Math.round((checkinSet.size / athletes.length) * 100)
        : 0,
    athletes: result,
  });
}

/**
 * GET /api/team/fatigue-timeline?org_id=xxx
 *
 * S&C・AT・Master 向け: チーム全体の DBN 疲労予測タイムラインを集約して返す。
 * Phase 4 Sprint 3（P4-19）
 *
 * レスポンス:
 * {
 *   team_risk_score: number (0-100, 高いほどリスク大)
 *   high_risk_athletes: [ { athlete_id, name, fatigue_probability_high, prediction_date } ]
 *   timeline: {
 *     [date: string]: {
 *       high_count: number    // 高疲労予測の選手数
 *       medium_count: number  // 中疲労予測の選手数
 *       low_count: number     // 低疲労予測の選手数
 *       athletes: [ { id, name, state, probability_high } ]
 *     }
 *   }
 *   pending_alerts: [ { id, athlete_name, alert_date, predicted_state } ]
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { getStaffWithRole } from "@/lib/permissions";

function getDb() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const staff = await getStaffWithRole(user.id);
  if (!staff) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── org_id 解決（クエリパラメータ or 自組織） ─────────────────────────────
  const { searchParams } = new URL(request.url);
  const requestedOrgId = searchParams.get("org_id") ?? staff.org_id;

  // Enterprise Admin は傘下組織も参照可
  const db = getDb();
  const { data: orgRow } = await db
    .from("organizations")
    .select("id, parent_organization_id")
    .eq("id", requestedOrgId)
    .maybeSingle();

  if (!orgRow) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  // アクセス権確認: 自組織 or 親組織が自組織（Enterprise admin）
  const isOwnOrg = requestedOrgId === staff.org_id;
  const isChildOrg = orgRow.parent_organization_id === staff.org_id;
  if (!isOwnOrg && !isChildOrg) {
    return NextResponse.json({ error: "Forbidden: cannot access this organization" }, { status: 403 });
  }

  // ── データ取得: 直近14日の DBN 予測 ─────────────────────────────────────
  const today = new Date();
  const fourteenDaysAgo = new Date(today);
  fourteenDaysAgo.setDate(today.getDate() - 14);
  const sevenDaysAhead = new Date(today);
  sevenDaysAhead.setDate(today.getDate() + 7);

  // チームの選手一覧
  const { data: athletes } = await db
    .from("athletes")
    .select("id, name")
    .eq("org_id", requestedOrgId)
    .eq("is_active", true);

  if (!athletes || athletes.length === 0) {
    return NextResponse.json({
      team_risk_score: 0,
      high_risk_athletes: [],
      timeline: {},
      pending_alerts: [],
    });
  }

  const athleteIds = athletes.map((a) => a.id);
  const athleteMap = Object.fromEntries(athletes.map((a) => [a.id, a.name]));

  // DBN 予測データ（過去14日〜未来7日）
  const { data: predictions } = await db
    .from("dbn_predictions")
    .select("athlete_id, prediction_date, predicted_fatigue_state, fatigue_probability_high, fatigue_probability_medium, fatigue_probability_low")
    .in("athlete_id", athleteIds)
    .gte("prediction_date", fourteenDaysAgo.toISOString().slice(0, 10))
    .lte("prediction_date", sevenDaysAhead.toISOString().slice(0, 10))
    .order("prediction_date", { ascending: true });

  // ── タイムライン集約 ─────────────────────────────────────────────────────
  type DayEntry = {
    high_count: number;
    medium_count: number;
    low_count: number;
    athletes: Array<{ id: string; name: string; state: string; probability_high: number }>;
  };
  const timeline: Record<string, DayEntry> = {};

  for (const pred of predictions ?? []) {
    const date = pred.prediction_date as string;
    if (!timeline[date]) {
      timeline[date] = { high_count: 0, medium_count: 0, low_count: 0, athletes: [] };
    }
    const state = pred.predicted_fatigue_state as string;
    if (state === "high") timeline[date].high_count++;
    else if (state === "medium") timeline[date].medium_count++;
    else timeline[date].low_count++;

    timeline[date].athletes.push({
      id: pred.athlete_id as string,
      name: athleteMap[pred.athlete_id as string] ?? "Unknown",
      state,
      probability_high: pred.fatigue_probability_high as number,
    });
  }

  // ── チームリスクスコア算出（今日基準: 高疲労選手の割合 × 重み） ───────────
  const todayStr = today.toISOString().slice(0, 10);
  const todayEntry = timeline[todayStr];
  const totalToday = athletes.length;
  const highToday = todayEntry?.high_count ?? 0;
  const mediumToday = todayEntry?.medium_count ?? 0;
  const team_risk_score =
    totalToday > 0
      ? Math.round(((highToday * 1.0 + mediumToday * 0.5) / totalToday) * 100)
      : 0;

  // ── 高リスク選手（高疲労確率 TOP5） ──────────────────────────────────────
  const todayAthletes = todayEntry?.athletes ?? [];
  const high_risk_athletes = todayAthletes
    .filter((a) => a.probability_high >= 0.5)
    .sort((a, b) => b.probability_high - a.probability_high)
    .slice(0, 5);

  // ── 未対応疲労アラート ────────────────────────────────────────────────────
  const { data: pendingAlerts } = await db
    .from("fatigue_alerts")
    .select(`
      id,
      alert_date,
      predicted_fatigue_state,
      alert_status,
      athletes!inner ( name )
    `)
    .in("athlete_id", athleteIds)
    .eq("alert_status", "pending")
    .order("alert_date", { ascending: false })
    .limit(10);

  const pending_alerts = (pendingAlerts ?? []).map((alert) => ({
    id: alert.id,
    athlete_name: (alert.athletes as unknown as { name: string })?.name ?? "Unknown",
    alert_date: alert.alert_date,
    predicted_state: alert.predicted_fatigue_state,
  }));

  return NextResponse.json({
    team_risk_score,
    high_risk_athletes,
    timeline,
    pending_alerts,
  });
}

export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { formatDate } from "@/lib/utils";
import { DashboardClient } from "./DashboardClient";
import type { DailyMetric, TriageEntry } from "@/types";

// Thresholds
const NRS_CRITICAL   = 6;
const ACWR_CRITICAL  = 1.5;
const NRS_WATCHLIST  = 4;
const ACWR_WATCHLIST = 1.3;

function computePriority(nrs: number, acwr: number): "critical" | "watchlist" | "normal" {
  if (nrs >= NRS_CRITICAL  || acwr > ACWR_CRITICAL)  return "critical";
  if (nrs >= NRS_WATCHLIST || acwr > ACWR_WATCHLIST) return "watchlist";
  return "normal";
}

function getDb() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export default async function DashboardPage() {
  const todayLabel = new Date().toLocaleDateString("ja-JP", {
    year: "numeric", month: "long", day: "numeric", weekday: "short",
  });

  let chartData: { date: string; ACWR: number; NRS: number; HRV: number; readiness: number; fitness: number; fatigue: number }[] = [];
  const triageEntries: TriageEntry[] = [];
  let criticalCount = 0;
  let watchlistCount = 0;
  let avgHp = 0;
  let totalAthletes = 0;
  let teamCondition: {
    team_readiness_avg: number;
    normal_count: number;
    zone_count: number;
    checkin_rate: number;
    athletes: {
      id: string; name: string; position: string | null;
      readiness_score: number; acwr: number; acwr_zone: string;
      fitness_score: number; fatigue_score: number;
      status: "critical" | "watchlist" | "normal" | "zone";
      hrv_baseline_delta: number | null;
      checkin_submitted: boolean;
    }[];
  } | null = null;

  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      throw new Error("Supabase env not set");
    }

    const supabase = await createClient();
    const db = getDb();

    // ── スタッフ情報からorg_idを取得 ─────────────────────────────────────
    const userRes = await supabase.auth.getUser();
    const user = userRes?.data?.user ?? null;
    let orgId: string | null = null;

    if (user) {
      const { data: staff } = await db.from("staff").select("org_id").eq("id", user.id).maybeSingle();
      orgId = staff?.org_id ?? null;
    }

    // ── 選手一覧 ──────────────────────────────────────────────────────────
    const athleteQuery = db.from("athletes").select("id, name, position").eq("is_active", true);
    if (orgId) athleteQuery.eq("org_id", orgId);

    const { data: athletes } = await athleteQuery;

    if (athletes && athletes.length > 0) {
      totalAthletes = athletes.length;
      const athleteIds = athletes.map((a) => a.id);
      const today = new Date().toISOString().slice(0, 10);

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 13);
      const cutoff = cutoffDate.toISOString().split("T")[0];

      // ── 直近14日のdaily_metrics ────────────────────────────────────────
      const { data: metricsRows } = await db
        .from("daily_metrics")
        .select("athlete_id, date, nrs, hrv, acwr, hp_computed")
        .in("athlete_id", athleteIds)
        .gte("date", cutoff)
        .order("date", { ascending: true });

      // ── 直近14日のconditionキャッシュ ─────────────────────────────────
      const { data: cacheRows } = await db
        .from("athlete_condition_cache")
        .select("athlete_id, date, readiness_score, fitness_score, fatigue_score, acwr")
        .in("athlete_id", athleteIds)
        .gte("date", cutoff)
        .order("date", { ascending: true });

      const cacheByDate: Record<string, { readiness: number[]; fitness: number[]; fatigue: number[] }> = {};
      for (const c of cacheRows ?? []) {
        if (!cacheByDate[c.date]) cacheByDate[c.date] = { readiness: [], fitness: [], fatigue: [] };
        cacheByDate[c.date].readiness.push(c.readiness_score);
        cacheByDate[c.date].fitness.push(c.fitness_score);
        cacheByDate[c.date].fatigue.push(c.fatigue_score);
      }

      if (metricsRows && metricsRows.length > 0) {
        const byDate: Record<string, { nrsSum: number; acwrSum: number; hrvSum: number; hpSum: number; count: number }> = {};
        for (const row of metricsRows) {
          const d = row.date as string;
          if (!byDate[d]) byDate[d] = { nrsSum: 0, acwrSum: 0, hrvSum: 0, hpSum: 0, count: 0 };
          byDate[d].nrsSum += Number(row.nrs ?? 0);
          byDate[d].acwrSum += Number(row.acwr ?? 0);
          byDate[d].hrvSum += Number(row.hrv ?? 0);
          byDate[d].hpSum += Number(row.hp_computed ?? 0);
          byDate[d].count += 1;
        }

        chartData = Object.entries(byDate)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, vals]) => {
            const cc = cacheByDate[date];
            const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
            return {
              date: formatDate(date),
              ACWR:     parseFloat((vals.acwrSum / vals.count).toFixed(2)),
              NRS:      parseFloat((vals.nrsSum  / vals.count).toFixed(1)),
              HRV:      parseFloat(((vals.hrvSum / vals.count) / 10).toFixed(2)),
              readiness: cc ? parseFloat(avg(cc.readiness).toFixed(1)) : 0,
              fitness:   cc ? parseFloat(avg(cc.fitness).toFixed(1))   : 0,
              fatigue:   cc ? parseFloat(avg(cc.fatigue).toFixed(1))   : 0,
            };
          });

        const allHpVals = metricsRows.map((r) => Number(r.hp_computed ?? 0)).filter((v) => v > 0);
        avgHp = allHpVals.length > 0 ? Math.round(allHpVals.reduce((s, v) => s + v, 0) / allHpVals.length) : 0;

        const latestByAthlete: Record<string, DailyMetric> = {};
        for (const row of metricsRows) {
          const existing = latestByAthlete[row.athlete_id];
          if (!existing || row.date > existing.date) {
            latestByAthlete[row.athlete_id] = {
              id: "", athlete_id: row.athlete_id, date: row.date,
              nrs: Number(row.nrs ?? 0), hrv: Number(row.hrv ?? 0), acwr: Number(row.acwr ?? 0),
              sleep_score: 0, subjective_condition: 3, hp_computed: Number(row.hp_computed ?? 0),
            };
          }
        }
        for (const athlete of athletes) {
          const latest = latestByAthlete[athlete.id];
          if (!latest) continue;
          const priority = computePriority(latest.nrs, latest.acwr);
          if (priority === "critical") criticalCount++;
          else if (priority === "watchlist") watchlistCount++;
          if (priority !== "normal") {
            triageEntries.push({
              athlete_id: athlete.id, athlete_name: athlete.name, position: athlete.position ?? "",
              priority, triggers: [], nrs: latest.nrs, hrv: latest.hrv, acwr: latest.acwr,
              last_updated: latest.date,
            });
          }
        }
        triageEntries.sort((a, b) => {
          const order: Record<string, number> = { critical: 0, watchlist: 1, normal: 2 };
          return (order[a.priority] ?? 2) - (order[b.priority] ?? 2);
        });
      }

      // ── 当日コンディションキャッシュ（teamCondition 構築）─────────────
      const { data: todayCaches } = await db
        .from("athlete_condition_cache")
        .select("athlete_id, readiness_score, fitness_score, fatigue_score, acwr, hrv_baseline_delta")
        .in("athlete_id", athleteIds)
        .eq("date", today);

      const { data: todayCheckins } = await db
        .from("daily_metrics")
        .select("athlete_id")
        .in("athlete_id", athleteIds)
        .eq("date", today);

      const cacheMap = new Map((todayCaches ?? []).map((c) => [c.athlete_id, c]));
      const checkinSet = new Set((todayCheckins ?? []).map((c) => c.athlete_id));

      function acwrZone(v: number) {
        if (v < 0.8) return "safe";
        if (v <= 1.3) return "optimal";
        if (v <= 1.5) return "caution";
        return "danger";
      }
      function readinessStatus(score: number): "critical" | "watchlist" | "normal" | "zone" {
        if (score < 40) return "critical";
        if (score < 60) return "watchlist";
        if (score < 80) return "normal";
        return "zone";
      }

      const conditionAthletes = athletes.map((a) => {
        const c = cacheMap.get(a.id);
        const readiness = c?.readiness_score ?? 50;
        const acwrVal   = c?.acwr ?? 1.0;
        return {
          id: a.id, name: a.name, position: a.position ?? null,
          readiness_score: readiness, acwr: acwrVal, acwr_zone: acwrZone(acwrVal),
          fitness_score: c?.fitness_score ?? 0, fatigue_score: c?.fatigue_score ?? 0,
          status: readinessStatus(readiness),
          hrv_baseline_delta: c?.hrv_baseline_delta ?? null,
          checkin_submitted: checkinSet.has(a.id),
        };
      });

      conditionAthletes.sort((a, b) => {
        const order = { critical: 0, watchlist: 1, normal: 2, zone: 3 };
        return order[a.status] - order[b.status] || a.readiness_score - b.readiness_score;
      });

      const avgReadiness = conditionAthletes.length > 0
        ? conditionAthletes.reduce((s, a) => s + a.readiness_score, 0) / conditionAthletes.length
        : 0;

      teamCondition = {
        team_readiness_avg: Math.round(avgReadiness * 10) / 10,
        normal_count:  conditionAthletes.filter((a) => a.status === "normal").length,
        zone_count:    conditionAthletes.filter((a) => a.status === "zone").length,
        checkin_rate:  athletes.length > 0 ? Math.round((checkinSet.size / athletes.length) * 100) : 0,
        athletes: conditionAthletes,
      };

      // v3.2: criticalCount / watchlistCount を teamCondition から更新
      criticalCount  = conditionAthletes.filter((a) => a.status === "critical").length;
      watchlistCount = conditionAthletes.filter((a) => a.status === "watchlist").length;
    }
  } catch (err) {
    console.warn("[dashboard] query failed:", err);
  }

  return (
    <DashboardClient
      chartData={chartData}
      triageEntries={triageEntries}
      criticalCount={criticalCount}
      watchlistCount={watchlistCount}
      avgHp={avgHp}
      totalAthletes={totalAthletes}
      todayLabel={todayLabel}
      teamCondition={teamCondition}
    />
  );
}

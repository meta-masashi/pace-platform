export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { mockMetrics, mockTriageEntries } from "@/lib/mock-data";
import { formatDate } from "@/lib/utils";
import { DashboardClient } from "./DashboardClient";
import type { DailyMetric, TriageEntry } from "@/types";

// Thresholds
const NRS_CRITICAL = 6;
const ACWR_CRITICAL = 1.5;
const NRS_WATCHLIST = 4;
const ACWR_WATCHLIST = 1.3;

function computePriority(nrs: number, acwr: number): "critical" | "watchlist" | "normal" {
  if (nrs >= NRS_CRITICAL || acwr > ACWR_CRITICAL) return "critical";
  if (nrs >= NRS_WATCHLIST || acwr > ACWR_WATCHLIST) return "watchlist";
  return "normal";
}

export default async function DashboardPage() {
  const todayLabel = new Date().toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });

  // ---- Try Supabase ----
  let chartData: { date: string; ACWR: number; NRS: number; HRV: number }[] = [];
  let triageEntries: TriageEntry[] = [];
  let criticalCount = 0;
  let watchlistCount = 0;
  let avgHp = 0;
  let totalAthletes = 0;

  try {
    if (
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ) {
      const supabase = await createClient();

      // Fetch active athletes count
      const { data: athletes } = await supabase
        .from("athletes")
        .select("id, name, position")
        .eq("is_active", true);

      if (athletes && athletes.length > 0) {
        totalAthletes = athletes.length;
        const athleteIds = athletes.map((a) => a.id);

        // Fetch last 14 days of metrics
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 13);
        const cutoff = cutoffDate.toISOString().split("T")[0];

        const { data: metricsRows } = await supabase
          .from("daily_metrics")
          .select("athlete_id, date, nrs, hrv, acwr, hp_computed")
          .in("athlete_id", athleteIds)
          .gte("date", cutoff)
          .order("date", { ascending: true });

        if (metricsRows && metricsRows.length > 0) {
          // Group by date for team averages
          const byDate: Record<
            string,
            { nrsSum: number; acwrSum: number; hrvSum: number; hpSum: number; count: number }
          > = {};

          for (const row of metricsRows) {
            const d = row.date as string;
            if (!byDate[d]) {
              byDate[d] = { nrsSum: 0, acwrSum: 0, hrvSum: 0, hpSum: 0, count: 0 };
            }
            byDate[d].nrsSum += Number(row.nrs ?? 0);
            byDate[d].acwrSum += Number(row.acwr ?? 0);
            byDate[d].hrvSum += Number(row.hrv ?? 0);
            byDate[d].hpSum += Number(row.hp_computed ?? 0);
            byDate[d].count += 1;
          }

          chartData = Object.entries(byDate)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, vals]) => ({
              date: formatDate(date),
              ACWR: parseFloat((vals.acwrSum / vals.count).toFixed(2)),
              NRS: parseFloat((vals.nrsSum / vals.count).toFixed(1)),
              HRV: parseFloat(((vals.hrvSum / vals.count) / 10).toFixed(2)),
            }));

          // Compute avgHp from last available data
          const allHpVals = metricsRows.map((r) => Number(r.hp_computed ?? 0)).filter((v) => v > 0);
          avgHp = allHpVals.length > 0
            ? Math.round(allHpVals.reduce((s, v) => s + v, 0) / allHpVals.length)
            : 0;

          // Build triage entries from latest metric per athlete
          const latestByAthlete: Record<string, DailyMetric> = {};
          for (const row of metricsRows) {
            const existing = latestByAthlete[row.athlete_id];
            if (!existing || row.date > existing.date) {
              latestByAthlete[row.athlete_id] = {
                id: "",
                athlete_id: row.athlete_id,
                date: row.date,
                nrs: Number(row.nrs ?? 0),
                hrv: Number(row.hrv ?? 0),
                acwr: Number(row.acwr ?? 0),
                sleep_score: 0,
                subjective_condition: 3,
                hp_computed: Number(row.hp_computed ?? 0),
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
                athlete_id: athlete.id,
                athlete_name: athlete.name,
                position: athlete.position ?? "",
                priority,
                triggers: [],
                nrs: latest.nrs,
                hrv: latest.hrv,
                acwr: latest.acwr,
                last_updated: latest.date,
              });
            }
          }

          // Sort: critical first
          triageEntries.sort((a, b) => {
            const order: Record<string, number> = { critical: 0, watchlist: 1, normal: 2 };
            return (order[a.priority] ?? 2) - (order[b.priority] ?? 2);
          });
        }
      }
    }
  } catch (err) {
    console.warn("[dashboard] Supabase query failed, falling back to mock data:", err);
  }

  // ---- Fallback to mock data if Supabase returned empty ----
  if (chartData.length === 0) {
    const mockMetricArray = mockMetrics["athlete-1"] ?? [];
    chartData = mockMetricArray.map((m) => ({
      date: formatDate(m.date),
      ACWR: parseFloat(m.acwr.toFixed(2)),
      NRS: parseFloat(m.nrs.toFixed(1)),
      HRV: parseFloat((m.hrv / 10).toFixed(2)),
    }));
  }

  if (triageEntries.length === 0) {
    triageEntries = mockTriageEntries;
    criticalCount = mockTriageEntries.filter((e) => e.priority === "critical").length;
    watchlistCount = mockTriageEntries.filter((e) => e.priority === "watchlist").length;
  }

  if (totalAthletes === 0) {
    totalAthletes = 6; // mock athlete count
  }

  if (avgHp === 0) {
    avgHp = 72; // mock average
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
    />
  );
}

export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
// import { mockAthletes, mockAuditLogs, mockEscalations } from "@/lib/mock-data";
import { StatsClient } from "./StatsClient";
import type { Athlete, AuditLog, EscalationRecord, Role } from "@/types";

export interface InjuryDistributionItem {
  label: string;
  count: number;
}

export interface ACWRTrendItem {
  week: string;
  acwr: number;
}

export interface HPDistributionItem {
  range: string;
  count: number;
}

export default async function StatsPage() {
  let athletes: Athlete[] = [];
  let auditLogs: AuditLog[] = [];
  let escalations: EscalationRecord[] = [];
  let injuryDistribution: InjuryDistributionItem[] = [];
  let acwrTrend: ACWRTrendItem[] = [];
  let hpDistribution: HPDistributionItem[] = [];

  try {
    const supabase = await createClient();

    // Fetch active athletes
    const { data: athleteRows, error: athleteError } = await supabase
      .from("athletes")
      .select("*")
      .eq("is_active", true)
      .order("name");

    if (!athleteError && athleteRows && athleteRows.length > 0) {
      athletes = athleteRows as Athlete[];
    }

    // Fetch audit logs
    const { data: logRows, error: logError } = await supabase
      .from("audit_logs")
      .select("*")
      .order("timestamp", { ascending: false })
      .limit(50);

    if (!logError && logRows && logRows.length > 0) {
      auditLogs = logRows as AuditLog[];
    }

    // Build escalation-like records from daily_metrics where acwr > 1.3 or nrs_pain >= 7
    const { data: metricRows, error: metricError } = await supabase
      .from("daily_metrics")
      .select("*")
      .or("acwr.gt.1.3,nrs_pain.gte.7")
      .order("metric_date", { ascending: false })
      .limit(20);

    if (!metricError && metricRows && metricRows.length > 0) {
      escalations = metricRows.map((row, idx) => ({
        id: row.id ?? String(idx),
        created_at: row.metric_date ?? new Date().toISOString(),
        from_staff_id: row.staff_id ?? "",
        from_staff_name: row.staff_name ?? "Staff",
        from_role: (row.staff_role ?? "AT") as Role,
        to_roles: ["PT"] as Role[],
        athlete_id: row.athlete_id ?? "",
        athlete_name: row.athlete_name ?? "—",
        severity: (row.acwr > 1.5 || row.nrs_pain >= 8 ? "urgent" : "high") as EscalationRecord["severity"],
        message: `ACWR: ${row.acwr ?? "—"} / NRS: ${row.nrs_pain ?? "—"}`,
        audit_log_id: row.id ?? "",
        acknowledged_at: row.resolved_at ?? undefined,
        acknowledged_by_name: row.resolved_by ?? undefined,
      }));
    }

    // ── Injury distribution: count athletes by status ──────────────────
    if (athletes.length > 0) {
      const statusCounts: Record<string, number> = {};
      for (const a of athletes) {
        statusCounts[a.status] = (statusCounts[a.status] ?? 0) + 1;
      }
      const labelMap: Record<string, string> = {
        critical: "Critical（要対応）",
        watchlist: "Watchlist（観察中）",
        normal: "Normal（問題なし）",
      };
      injuryDistribution = Object.entries(statusCounts).map(([status, count]) => ({
        label: labelMap[status] ?? status,
        count,
      }));
    }

    // ── ACWR trend: last 8 weeks average acwr per week ─────────────────
    const eightWeeksAgo = new Date();
    eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);
    const cutoff = eightWeeksAgo.toISOString().split("T")[0];

    const { data: acwrRows } = await supabase
      .from("daily_metrics")
      .select("date, acwr")
      .gte("date", cutoff)
      .order("date", { ascending: true });

    if (acwrRows && acwrRows.length > 0) {
      // Group by week (ISO week label)
      const weekMap: Record<string, { sum: number; count: number }> = {};
      for (const row of acwrRows) {
        const d = new Date(row.date);
        // Use Monday-based week start
        const dayOfWeek = d.getDay() === 0 ? 6 : d.getDay() - 1;
        const monday = new Date(d);
        monday.setDate(d.getDate() - dayOfWeek);
        const weekLabel = `${monday.getMonth() + 1}/${monday.getDate()}週`;
        if (!weekMap[weekLabel]) weekMap[weekLabel] = { sum: 0, count: 0 };
        weekMap[weekLabel].sum += Number(row.acwr ?? 0);
        weekMap[weekLabel].count += 1;
      }
      acwrTrend = Object.entries(weekMap)
        .slice(-8)
        .map(([week, { sum, count }]) => ({
          week,
          acwr: Math.round((sum / count) * 100) / 100,
        }));
    }

    // ── HP distribution: count athletes by hp ranges ───────────────────
    if (athletes.length > 0) {
      const ranges = [
        { range: "0-39", min: 0, max: 39 },
        { range: "40-59", min: 40, max: 59 },
        { range: "60-74", min: 60, max: 74 },
        { range: "75-89", min: 75, max: 89 },
        { range: "90-100", min: 90, max: 100 },
      ];
      hpDistribution = ranges.map(({ range, min, max }) => ({
        range,
        count: athletes.filter((a) => a.hp >= min && a.hp <= max).length,
      }));
    }
  } catch (err) {
    console.error("[stats] Supabase query failed:", err);
    // Return empty arrays — no mock fallback
  }

  return (
    <StatsClient
      athletes={athletes}
      auditLogs={auditLogs}
      escalations={escalations}
      injuryDistribution={injuryDistribution}
      acwrTrend={acwrTrend}
      hpDistribution={hpDistribution}
    />
  );
}

import { createClient } from "@/lib/supabase/server";
import { mockTriageEntries, mockEscalations, mockStaff } from "@/lib/mock-data";
import { TriageClient } from "./TriageClient";
import type { TriageEntry, TriggerType, Priority, DailyMetric } from "@/types";

// Thresholds (mirrors /api/triage/route.ts)
const NRS_SPIKE_THRESHOLD = 3;
const HRV_DROP_PERCENT = 0.15;
const ACWR_CRITICAL = 1.5;
const ACWR_WATCHLIST = 1.3;
const NRS_CRITICAL = 6;
const NRS_WATCHLIST = 4;
const HRV_BASELINE_DROP_CRITICAL = 0.20;
const SUBJECTIVE_DISCREPANCY_THRESHOLD = 2;

function sevenDayAvg(
  metrics: DailyMetric[],
  field: keyof Pick<DailyMetric, "nrs" | "hrv" | "acwr" | "subjective_condition">
): number {
  const recent = metrics.slice(-7);
  if (recent.length === 0) return 0;
  return recent.reduce((s, m) => s + (m[field] as number), 0) / recent.length;
}

function computeTriageEntry(
  athlete: { id: string; name: string; position: string },
  metrics: DailyMetric[]
): TriageEntry {
  const latest = metrics[metrics.length - 1];

  if (!latest) {
    return {
      athlete_id: athlete.id,
      athlete_name: athlete.name,
      position: athlete.position ?? "",
      priority: "normal",
      triggers: [],
      nrs: 0,
      hrv: 0,
      acwr: 0,
      last_updated: new Date().toISOString(),
    };
  }

  const avgNrs = sevenDayAvg(metrics.slice(0, -1), "nrs");
  const avgHrv = sevenDayAvg(metrics.slice(0, -1), "hrv");
  const avgAcwr = sevenDayAvg(metrics.slice(0, -1), "acwr");
  const triggers: TriggerType[] = [];

  if (latest.nrs - avgNrs >= NRS_SPIKE_THRESHOLD) triggers.push("nrs_spike");
  if (avgHrv > 0 && (avgHrv - latest.hrv) / avgHrv >= HRV_DROP_PERCENT) triggers.push("hrv_drop");
  if (latest.acwr > ACWR_WATCHLIST) triggers.push("acwr_exceeded");

  const nrsNorm = latest.nrs / 10;
  const subjectiveNorm = 1 - (latest.subjective_condition - 1) / 4;
  if (Math.abs(nrsNorm - subjectiveNorm) >= SUBJECTIVE_DISCREPANCY_THRESHOLD / 10) {
    triggers.push("subjective_objective_discrepancy");
  }

  if (avgHrv > 0 && (avgHrv - latest.hrv) / avgHrv >= HRV_BASELINE_DROP_CRITICAL) {
    if (!triggers.includes("hrv_drop")) triggers.push("baseline_deviation");
  } else if (Math.abs(latest.acwr - avgAcwr) > 0.3) {
    triggers.push("baseline_deviation");
  }

  let priority: Priority = "normal";
  if (
    latest.nrs >= NRS_CRITICAL ||
    latest.acwr > ACWR_CRITICAL ||
    (avgHrv > 0 && (avgHrv - latest.hrv) / avgHrv >= HRV_BASELINE_DROP_CRITICAL)
  ) {
    priority = "critical";
  } else if (latest.nrs >= NRS_WATCHLIST || latest.acwr > ACWR_WATCHLIST || triggers.length > 0) {
    priority = "watchlist";
  }

  return {
    athlete_id: athlete.id,
    athlete_name: athlete.name,
    position: athlete.position ?? "",
    priority,
    triggers,
    nrs: latest.nrs,
    hrv: latest.hrv,
    acwr: latest.acwr,
    last_updated: latest.date,
  };
}

export default async function TriagePage() {
  let triageEntries: TriageEntry[] = [];
  let staffMembers: { role: string; name: string }[] = [];
  let currentStaffName = "スタッフ";
  let currentStaffRole = "AT";
  // athlete_id -> 未解決の最新 triage.id
  const triageIdMap: Record<string, string> = {};

  try {
    if (
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ) {
      const supabase = await createClient();

      // Fetch active athletes
      const { data: athletes, error: athletesError } = await supabase
        .from("athletes")
        .select("id, name, position")
        .eq("is_active", true);

      if (!athletesError && athletes && athletes.length > 0) {
        const athleteIds = athletes.map((a) => a.id);

        // Fetch last 14 days of metrics
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 14);
        const cutoff = cutoffDate.toISOString().split("T")[0];

        const { data: metricsRows } = await supabase
          .from("daily_metrics")
          .select("id, athlete_id, date, nrs, hrv, acwr, sleep_score, subjective_condition, hp_computed")
          .in("athlete_id", athleteIds)
          .gte("date", cutoff)
          .order("date", { ascending: true });

        // Group metrics by athlete_id
        const metricsByAthlete: Record<string, DailyMetric[]> = {};
        for (const row of metricsRows ?? []) {
          if (!metricsByAthlete[row.athlete_id]) {
            metricsByAthlete[row.athlete_id] = [];
          }
          metricsByAthlete[row.athlete_id].push({
            id: row.id,
            athlete_id: row.athlete_id,
            date: row.date,
            nrs: Number(row.nrs ?? 0),
            hrv: Number(row.hrv ?? 0),
            acwr: Number(row.acwr ?? 0),
            sleep_score: Number(row.sleep_score ?? 0),
            subjective_condition: Number(row.subjective_condition ?? 3),
            hp_computed: Number(row.hp_computed ?? 0),
          });
        }

        const entries = athletes.map((athlete) =>
          computeTriageEntry(athlete, metricsByAthlete[athlete.id] ?? [])
        );

        const priorityOrder: Record<Priority, number> = { critical: 0, watchlist: 1, normal: 2 };
        entries.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

        triageEntries = entries;

        // Fetch unresolved triage DB entries to populate triageIdMap
        // (athlete_id -> 最新の未解決 triage.id)
        const { data: triageRows } = await supabase
          .from("triage")
          .select("id, athlete_id, created_at")
          .in("athlete_id", athleteIds)
          .is("resolved_at", null)
          .order("created_at", { ascending: false });

        // 各 athlete の最新エントリのみ保持
        for (const row of triageRows ?? []) {
          if (!triageIdMap[row.athlete_id]) {
            triageIdMap[row.athlete_id] = row.id;
          }
        }
      }

      // Fetch staff for escalation modal
      const { data: staffRows } = await supabase
        .from("staff")
        .select("name, role")
        .eq("is_active", true);

      if (staffRows && staffRows.length > 0) {
        staffMembers = staffRows.map((s) => ({ role: s.role, name: s.name }));
      }

      // Try to get current user's staff record
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: staffRow } = await supabase
          .from("staff")
          .select("name, role")
          .eq("id", user.id)
          .single();
        if (staffRow) {
          currentStaffName = staffRow.name;
          currentStaffRole = staffRow.role;
        }
      }
    }
  } catch (err) {
    console.warn("[triage-page] Supabase query failed, falling back to mock data:", err);
  }

  // Fallback to mock data if Supabase returned empty
  if (triageEntries.length === 0) {
    triageEntries = mockTriageEntries;
  }

  if (staffMembers.length === 0) {
    staffMembers = mockStaff.map((s) => ({ role: s.role, name: s.name }));
    currentStaffName = mockStaff[1]?.name ?? "スタッフ";
    currentStaffRole = mockStaff[1]?.role ?? "AT";
  }

  return (
    <TriageClient
      initialEntries={triageEntries}
      initialEscalations={mockEscalations}
      staffMembers={staffMembers}
      currentStaffName={currentStaffName}
      currentStaffRole={currentStaffRole}
      triageIdMap={triageIdMap}
    />
  );
}

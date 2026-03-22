import { NextRequest, NextResponse } from "next/server";
import type { TriageEntry, TriggerType, Priority, DailyMetric } from "@/types";
// import { mockAthletes, mockMetrics } from "@/lib/mock-data"; // removed: no mock fallback
import { createClient } from "@/lib/supabase/server";

// ============================================================
// Threshold constants
// ============================================================
const NRS_SPIKE_THRESHOLD = 3;      // NRS increase vs 7-day avg
const HRV_DROP_PERCENT = 0.15;      // 15% drop vs 7-day avg
const ACWR_CRITICAL = 1.5;
const ACWR_WATCHLIST = 1.3;
const NRS_CRITICAL = 6;
const NRS_WATCHLIST = 4;
const HRV_BASELINE_DROP_CRITICAL = 0.20; // 20% below baseline = critical
const SUBJECTIVE_DISCREPANCY_THRESHOLD = 2; // diff between subjective_condition scale and nrs scale

// ============================================================
// Helper: compute 7-day rolling average for a metric
// ============================================================
function sevenDayAvg(
  metrics: DailyMetric[],
  field: keyof Pick<DailyMetric, "nrs" | "hrv" | "acwr" | "subjective_condition">
): number {
  const recent = metrics.slice(-7);
  if (recent.length === 0) return 0;
  return recent.reduce((s, m) => s + (m[field] as number), 0) / recent.length;
}

// ============================================================
// Compute triage entry from athlete + metrics arrays
// ============================================================
function computeTriageEntryFromData(
  athlete: {
    id: string;
    name: string;
    position: string;
    status?: Priority;
    nrs?: number;
    hrv?: number;
    acwr?: number;
    last_updated?: string;
  },
  metrics: DailyMetric[]
): TriageEntry {
  const latest = metrics[metrics.length - 1];

  if (!latest) {
    return {
      athlete_id: athlete.id,
      athlete_name: athlete.name,
      position: athlete.position ?? "",
      priority: (athlete.status as Priority) ?? "normal",
      triggers: [],
      nrs: athlete.nrs ?? 0,
      hrv: athlete.hrv ?? 0,
      acwr: athlete.acwr ?? 0,
      last_updated: athlete.last_updated ?? new Date().toISOString(),
    };
  }

  const avgNrs = sevenDayAvg(metrics.slice(0, -1), "nrs");
  const avgHrv = sevenDayAvg(metrics.slice(0, -1), "hrv");
  const avgAcwr = sevenDayAvg(metrics.slice(0, -1), "acwr");

  const triggers: TriggerType[] = [];

  // NRS spike
  if (latest.nrs - avgNrs >= NRS_SPIKE_THRESHOLD) {
    triggers.push("nrs_spike");
  }

  // HRV drop
  if (avgHrv > 0 && (avgHrv - latest.hrv) / avgHrv >= HRV_DROP_PERCENT) {
    triggers.push("hrv_drop");
  }

  // ACWR exceeded
  if (latest.acwr > ACWR_WATCHLIST) {
    triggers.push("acwr_exceeded");
  }

  // Subjective / objective discrepancy
  const nrsNorm = latest.nrs / 10;
  const subjectiveNorm = 1 - (latest.subjective_condition - 1) / 4;
  if (Math.abs(nrsNorm - subjectiveNorm) >= SUBJECTIVE_DISCREPANCY_THRESHOLD / 10) {
    triggers.push("subjective_objective_discrepancy");
  }

  // Baseline deviation
  if (avgHrv > 0 && (avgHrv - latest.hrv) / avgHrv >= HRV_BASELINE_DROP_CRITICAL) {
    if (!triggers.includes("hrv_drop")) {
      triggers.push("baseline_deviation");
    }
  } else if (Math.abs(latest.acwr - avgAcwr) > 0.3) {
    triggers.push("baseline_deviation");
  }

  // Determine priority
  let priority: Priority = "normal";
  if (
    latest.nrs >= NRS_CRITICAL ||
    latest.acwr > ACWR_CRITICAL ||
    (avgHrv > 0 && (avgHrv - latest.hrv) / avgHrv >= HRV_BASELINE_DROP_CRITICAL)
  ) {
    priority = "critical";
  } else if (
    latest.nrs >= NRS_WATCHLIST ||
    latest.acwr > ACWR_WATCHLIST ||
    triggers.length > 0
  ) {
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

// ============================================================
// Persist triage entries to DB (fire-and-forget, non-blocking)
// ============================================================
async function persistTriageEntries(
  entries: TriageEntry[],
  orgId: string,
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<void> {
  // Map TriggerType → triage.trigger_type CHECK constraint values
  const TRIGGER_MAP: Partial<Record<TriggerType, string>> = {
    nrs_spike: "nrs_spike",
    hrv_drop: "hrv_drop",
    acwr_exceeded: "acwr_excess",
    subjective_objective_discrepancy: "subjective_objective_divergence",
  };

  const THRESHOLD_MAP: Record<string, number> = {
    nrs_spike: NRS_SPIKE_THRESHOLD,
    hrv_drop: HRV_DROP_PERCENT,
    acwr_excess: ACWR_WATCHLIST,
    subjective_objective_divergence: SUBJECTIVE_DISCREPANCY_THRESHOLD / 10,
  };

  const METRIC_VALUE_MAP = (entry: TriageEntry, trigger: string): number => {
    if (trigger === "nrs_spike") return entry.nrs;
    if (trigger === "hrv_drop") return entry.hrv;
    if (trigger === "acwr_excess") return entry.acwr;
    if (trigger === "subjective_objective_divergence") return entry.nrs / 10;
    return 0;
  };

  const rows: Array<{
    athlete_id: string;
    org_id: string;
    trigger_type: string;
    severity: string;
    metric_value: number;
    threshold_value: number;
  }> = [];

  for (const entry of entries) {
    if (entry.priority === "normal") continue;

    for (const trigger of entry.triggers) {
      const dbTrigger = TRIGGER_MAP[trigger];
      if (!dbTrigger) continue; // baseline_deviation はtriageテーブル対象外

      rows.push({
        athlete_id: entry.athlete_id,
        org_id: orgId,
        trigger_type: dbTrigger,
        severity: entry.priority === "critical" ? "critical" : "watchlist",
        metric_value: METRIC_VALUE_MAP(entry, dbTrigger),
        threshold_value: THRESHOLD_MAP[dbTrigger] ?? 0,
      });
    }
  }

  if (rows.length === 0) return;

  const { error } = await supabase.from("triage").insert(rows);
  if (error) {
    console.warn("[triage] Failed to persist triage entries:", error.message);
  }
}

// ============================================================
// GET /api/triage?team_id=xxx
// ============================================================
export async function GET(request: NextRequest) {
  try {
    // ---- Auth check (Critical fix: medical PII must be protected) ----
    const supabaseAuth = await createClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const team_id = searchParams.get("team_id");

    if (!team_id) {
      return NextResponse.json(
        { error: "team_id query parameter is required" },
        { status: 400 }
      );
    }

    // ---- Try Supabase first ----
    try {
      const supabase = await createClient();

      // Fetch athletes for the team
      const { data: athletes, error: athletesError } = await supabase
        .from("athletes")
        .select("id, name, position, org_id")
        .eq("team_id", team_id)
        .eq("is_active", true);

      if (athletesError) {
        throw athletesError;
      }

      // If Supabase returned athletes, use real metrics
      if (athletes && athletes.length > 0) {
        const athleteIds = athletes.map((a) => a.id);
        const orgId: string = athletes[0].org_id as string;

        // Fetch last 14 days of metrics for all athletes in team
        const fourteenDaysAgo = new Date();
        fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
        const cutoff = fourteenDaysAgo.toISOString().split("T")[0];

        const { data: metricsRows, error: metricsError } = await supabase
          .from("daily_metrics")
          .select("id, athlete_id, date, nrs, hrv, acwr, sleep_score, subjective_condition, hp_computed")
          .in("athlete_id", athleteIds)
          .gte("date", cutoff)
          .order("date", { ascending: true });

        if (metricsError) {
          throw metricsError;
        }

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

        const entries: TriageEntry[] = athletes.map((athlete) => {
          const metrics = metricsByAthlete[athlete.id] ?? [];
          return computeTriageEntryFromData(athlete as { id: string; name: string; position: string }, metrics);
        });

        const priorityOrder: Record<Priority, number> = {
          critical: 0,
          watchlist: 1,
          normal: 2,
        };
        entries.sort(
          (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
        );

        // Persist non-normal entries to triage table (fire-and-forget)
        persistTriageEntries(entries, orgId, supabase).catch((e) =>
          console.warn("[triage] persistTriageEntries error:", e)
        );

        return NextResponse.json({
          team_id,
          computed_at: new Date().toISOString(),
          entries,
        });
      }

      // Supabase returned zero athletes — return empty triage array
      console.warn("[triage] No athletes found in Supabase for team_id:", team_id);
      return NextResponse.json({ entries: [], fallback: false });
    } catch (supabaseErr) {
      console.error("[triage] Supabase query failed:", supabaseErr);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  } catch (err) {
    console.error("[triage]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

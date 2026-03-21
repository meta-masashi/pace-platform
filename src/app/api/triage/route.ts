import { NextRequest, NextResponse } from "next/server";
import type { TriageEntry, TriggerType, Priority, DailyMetric } from "@/types";
import { mockAthletes, mockMetrics } from "@/lib/mock-data";

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
// Compute triage entry for a single athlete
// ============================================================
function computeTriageEntry(
  athleteId: string,
  teamId: string
): TriageEntry | null {
  const athlete = mockAthletes.find(
    (a) => a.id === athleteId && a.team_id === teamId
  );
  if (!athlete) return null;

  const metrics = mockMetrics[athleteId] ?? [];
  const latest = metrics[metrics.length - 1];
  if (!latest) {
    // No metrics at all — use athlete snapshot values
    return {
      athlete_id: athleteId,
      athlete_name: athlete.name,
      position: athlete.position,
      priority: athlete.status,
      triggers: [],
      nrs: athlete.nrs,
      hrv: athlete.hrv,
      acwr: athlete.acwr,
      last_updated: athlete.last_updated,
    };
  }

  const avgNrs = sevenDayAvg(metrics.slice(0, -1), "nrs");
  const avgHrv = sevenDayAvg(metrics.slice(0, -1), "hrv");
  const avgAcwr = sevenDayAvg(metrics.slice(0, -1), "acwr");
  const avgSubjective = sevenDayAvg(metrics.slice(0, -1), "subjective_condition");

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
  // Normalise both to 0-1 scale to compare
  const nrsNorm = latest.nrs / 10;
  const subjectiveNorm = 1 - (latest.subjective_condition - 1) / 4; // invert: 5=best -> 0, 1=worst -> 1
  if (Math.abs(nrsNorm - subjectiveNorm) >= SUBJECTIVE_DISCREPANCY_THRESHOLD / 10) {
    triggers.push("subjective_objective_discrepancy");
  }

  // Baseline deviation (HRV drop >= 20%)
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

  // Use athlete's stored inference label if available
  return {
    athlete_id: athleteId,
    athlete_name: athlete.name,
    position: athlete.position,
    priority,
    triggers,
    nrs: latest.nrs,
    hrv: latest.hrv,
    acwr: latest.acwr,
    pace_inference_label: athlete.status !== "normal" ? undefined : undefined,
    last_updated: latest.date,
  };
}

// ============================================================
// Route handler
// ============================================================
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const team_id = searchParams.get("team_id");

    if (!team_id) {
      return NextResponse.json(
        { error: "team_id query parameter is required" },
        { status: 400 }
      );
    }

    const teamAthletes = mockAthletes.filter((a) => a.team_id === team_id);
    if (teamAthletes.length === 0) {
      return NextResponse.json(
        { error: `No athletes found for team_id: ${team_id}` },
        { status: 404 }
      );
    }

    const entries: TriageEntry[] = teamAthletes
      .map((a) => computeTriageEntry(a.id, team_id))
      .filter((e): e is TriageEntry => e !== null);

    // Sort by priority: critical > watchlist > normal
    const priorityOrder: Record<Priority, number> = {
      critical: 0,
      watchlist: 1,
      normal: 2,
    };

    entries.sort(
      (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
    );

    return NextResponse.json({
      team_id,
      computed_at: new Date().toISOString(),
      entries,
    });
  } catch (err) {
    console.error("[triage]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

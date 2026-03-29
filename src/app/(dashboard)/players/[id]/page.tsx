import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { PlayerDetailClient } from "./PlayerDetailClient";
import type { Athlete, Workout, DiagnosisResult, Priority } from "@/types";

const NRS_CRITICAL = 6;
const ACWR_CRITICAL = 1.5;
const NRS_WATCHLIST = 4;
const ACWR_WATCHLIST = 1.3;

function computeStatus(nrs: number, acwr: number): Priority {
  if (nrs >= NRS_CRITICAL || acwr > ACWR_CRITICAL) return "critical";
  if (nrs >= NRS_WATCHLIST || acwr > ACWR_WATCHLIST) return "watchlist";
  return "normal";
}

export default async function PlayerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let athlete: Athlete | null = null;
  let chartData: { date: string; NRS: number; HRV: number; ACWR: number }[] = [];
  let differentials: DiagnosisResult[] = [];
  let workout: Workout | null = null;

  try {
    if (
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ) {
      const supabase = await createClient();

      // Fetch the athlete
      const { data: athleteRow, error: athleteError } = await supabase
        .from("athletes")
        .select("id, org_id, team_id, name, position, number, age, sex, profile_photo")
        .eq("id", id)
        .single();

      if (!athleteError && athleteRow) {
        // Fetch last 14 days of daily_metrics for this athlete
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 13);
        const cutoff = cutoffDate.toISOString().split("T")[0];

        const { data: metricsRows } = await supabase
          .from("daily_metrics")
          .select("date, nrs, hrv, acwr, hp_computed")
          .eq("athlete_id", id)
          .gte("date", cutoff)
          .order("date", { ascending: true });

        // Build chart data
        if (metricsRows && metricsRows.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          chartData = metricsRows.map((m: any) => ({
            date: formatDate(m.date),
            NRS: parseFloat(Number(m.nrs ?? 0).toFixed(1)),
            HRV: parseFloat(Number(m.hrv ?? 0).toFixed(1)),
            ACWR: parseFloat(Number(m.acwr ?? 0).toFixed(2)),
          }));
        }

        // Latest metrics for current values
        const latestMetric = metricsRows && metricsRows.length > 0
          ? metricsRows[metricsRows.length - 1]
          : null;

        const nrs = Number(latestMetric?.nrs ?? 0);
        const hrv = Number(latestMetric?.hrv ?? 0);
        const acwr = Number(latestMetric?.acwr ?? 0);
        const hp = Number(latestMetric?.hp_computed ?? 0);

        athlete = {
          id: athleteRow.id,
          org_id: athleteRow.org_id,
          team_id: athleteRow.team_id ?? "",
          name: athleteRow.name,
          position: athleteRow.position ?? "",
          number: athleteRow.number ?? 0,
          age: athleteRow.age ?? 0,
          sex: athleteRow.sex ?? "male",
          profile_photo: athleteRow.profile_photo ?? undefined,
          status: computeStatus(nrs, acwr),
          hp,
          nrs,
          hrv,
          acwr,
          last_updated: latestMetric?.date ?? new Date().toISOString(),
        };

        // Fetch latest assessment for differentials
        const { data: assessmentRows } = await supabase
          .from("assessments")
          .select("differentials, primary_diagnosis_code, primary_diagnosis_label, primary_diagnosis_confidence")
          .eq("athlete_id", id)
          .eq("status", "completed")
          .order("completed_at", { ascending: false })
          .limit(1);

        if (assessmentRows && assessmentRows.length > 0) {
          const assessment = assessmentRows[0];
          const rawDifferentials = assessment.differentials as Array<{
            diagnosis_code: string;
            label: string;
            probability: number;
          }> | null;

          if (rawDifferentials && rawDifferentials.length > 0) {
            differentials = rawDifferentials;
          }
        }

        // Fetch latest workout for this athlete
        const { data: workoutRows } = await supabase
          .from("workouts")
          .select("id, athlete_id, team_id, workout_type, generated_by_ai, menu, total_duration_min, notes, approved_by_staff_id, approved_at, distributed_at, generated_at")
          .eq("athlete_id", id)
          .order("generated_at", { ascending: false })
          .limit(1);

        if (workoutRows && workoutRows.length > 0) {
          const w = workoutRows[0];
          workout = {
            id: w.id,
            athlete_id: w.athlete_id ?? undefined,
            team_id: w.team_id ?? undefined,
            type: w.workout_type as "individual" | "team",
            generated_by_ai: w.generated_by_ai,
            generated_at: w.generated_at,
            approved_by_staff_id: w.approved_by_staff_id ?? undefined,
            approved_at: w.approved_at ?? undefined,
            distributed_at: w.distributed_at ?? undefined,
            menu: (w.menu as Workout["menu"]) ?? [],
            total_duration_min: w.total_duration_min ?? 0,
            notes: w.notes ?? undefined,
          };
        }
      }
    }
  } catch (err) {
    console.warn("[player-detail] Supabase query failed:", err);
  }

  // Show 404 if athlete not found
  if (!athlete) {
    notFound();
  }

  return (
    <PlayerDetailClient
      athlete={athlete}
      chartData={chartData}
      differentials={differentials}
      workout={workout}
    />
  );
}

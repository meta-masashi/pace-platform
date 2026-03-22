import { createClient } from "@/lib/supabase/server";
import { getCurrentStaff } from "@/lib/auth";
import { mockRehabPrograms, mockAthletes, mockRehabWorkout } from "@/lib/mock-data";
import { RehabDetailClient } from "./RehabDetailClient";
import type { RehabProgram, Workout, RehabPhase, ApprovalStatus } from "@/types";

export default async function RehabDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let program: RehabProgram | null = null;
  let athleteName = "—";
  let workout: Workout | null = null;
  let currentStaffRole = "AT";

  // Get current staff role
  const staff = await getCurrentStaff();
  if (staff) {
    currentStaffRole = staff.role;
  }

  try {
    if (
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ) {
      const supabase = await createClient();

      // Fetch the rehab program with all new fields
      const { data: row, error } = await supabase
        .from("rehab_programs")
        .select(`
          id, athlete_id, diagnosis_code, diagnosis_label, current_phase,
          start_date, estimated_rtp_date, status,
          approval_status, doctor_name, doctor_institution, approved_by, approved_at,
          diagnosis_confirmed_at, rejection_reason, diagnosis_document_url,
          rom, swelling_grade, lsi_percent
        `)
        .eq("id", id)
        .single();

      if (!error && row) {
        program = {
          id: row.id,
          athlete_id: row.athlete_id,
          diagnosis_code: row.diagnosis_code ?? undefined,
          diagnosis_label: row.diagnosis_label,
          current_phase: row.current_phase as RehabPhase,
          start_date: row.start_date,
          estimated_rtp_date: row.estimated_rtp_date ?? undefined,
          status: row.status as RehabProgram["status"],
          approval_status: (row.approval_status ?? "pending") as ApprovalStatus,
          doctor_name: row.doctor_name ?? undefined,
          doctor_institution: row.doctor_institution ?? undefined,
          approved_by: row.approved_by ?? undefined,
          approved_at: row.approved_at ?? undefined,
          diagnosis_confirmed_at: row.diagnosis_confirmed_at ?? undefined,
          rejection_reason: row.rejection_reason ?? undefined,
          diagnosis_document_url: row.diagnosis_document_url ?? undefined,
          rom: row.rom != null ? Number(row.rom) : undefined,
          swelling_grade: row.swelling_grade != null ? row.swelling_grade : undefined,
          lsi_percent: row.lsi_percent != null ? Number(row.lsi_percent) : undefined,
        };

        // Fetch athlete name
        const { data: athleteRow } = await supabase
          .from("athletes")
          .select("name")
          .eq("id", row.athlete_id)
          .single();

        if (athleteRow) {
          athleteName = athleteRow.name;
        }

        // Fetch latest workout for this athlete
        const { data: workoutRows } = await supabase
          .from("workouts")
          .select("id, athlete_id, team_id, workout_type, generated_by_ai, menu, total_duration_min, notes, approved_by_staff_id, approved_at, distributed_at, generated_at")
          .eq("athlete_id", row.athlete_id)
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
    console.warn("[rehab-detail] Supabase query failed, falling back to mock data:", err);
  }

  // Fallback to mock data if Supabase returned empty
  if (!program) {
    const mockProgram = mockRehabPrograms.find((p) => p.id === id) ?? mockRehabPrograms[0];
    program = mockProgram;
    athleteName =
      mockAthletes.find((a) => a.id === mockProgram.athlete_id)?.name ?? "—";
  }

  if (!workout) {
    workout = mockRehabWorkout;
  }

  return (
    <RehabDetailClient
      program={program}
      athleteName={athleteName}
      workout={workout}
      currentStaffRole={currentStaffRole}
    />
  );
}

export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { mockRehabPrograms, mockAthletes } from "@/lib/mock-data";
import type { RehabProgram, RehabPhase, ApprovalStatus, Athlete } from "@/types";
import { RehabilitationClient } from "./RehabilitationClient";

interface ProgramWithAthlete {
  program: RehabProgram;
  athleteName: string;
}

export default async function RehabilitationPage() {
  let items: ProgramWithAthlete[] = [];
  let athletes: Pick<Athlete, "id" | "name">[] = [];

  try {
    if (
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ) {
      const supabase = await createClient();

      // Fetch rehab programs with all new fields
      const { data: rows, error } = await supabase
        .from("rehab_programs")
        .select(`
          id, athlete_id, diagnosis_code, diagnosis_label, current_phase,
          start_date, estimated_rtp_date, status,
          approval_status, doctor_name, doctor_institution, approved_at,
          diagnosis_confirmed_at, rejection_reason, diagnosis_document_url,
          rom, swelling_grade, lsi_percent
        `)
        .order("start_date", { ascending: false });

      if (!error && rows && rows.length > 0) {
        const athleteIds = [...new Set(rows.map((r) => r.athlete_id))];

        const { data: athleteRows } = await supabase
          .from("athletes")
          .select("id, name")
          .in("id", athleteIds);

        const athleteMap: Record<string, string> = {};
        for (const a of athleteRows ?? []) {
          athleteMap[a.id] = a.name;
        }

        items = rows.map((r) => ({
          program: {
            id: r.id,
            athlete_id: r.athlete_id,
            diagnosis_code: r.diagnosis_code ?? undefined,
            diagnosis_label: r.diagnosis_label,
            current_phase: r.current_phase as RehabPhase,
            start_date: r.start_date,
            estimated_rtp_date: r.estimated_rtp_date ?? undefined,
            status: r.status as RehabProgram["status"],
            approval_status: (r.approval_status ?? "pending") as ApprovalStatus,
            doctor_name: r.doctor_name ?? undefined,
            doctor_institution: r.doctor_institution ?? undefined,
            approved_at: r.approved_at ?? undefined,
            diagnosis_confirmed_at: r.diagnosis_confirmed_at ?? undefined,
            rejection_reason: r.rejection_reason ?? undefined,
            diagnosis_document_url: r.diagnosis_document_url ?? undefined,
            rom: r.rom != null ? Number(r.rom) : undefined,
            swelling_grade: r.swelling_grade != null ? r.swelling_grade : undefined,
            lsi_percent: r.lsi_percent != null ? Number(r.lsi_percent) : undefined,
          },
          athleteName: athleteMap[r.athlete_id] ?? "—",
        }));

        // Fetch athletes for dropdown
        const { data: allAthletes } = await supabase
          .from("athletes")
          .select("id, name")
          .eq("is_active", true)
          .order("name");

        athletes = (allAthletes ?? []).map((a) => ({ id: a.id, name: a.name }));
      }
    }
  } catch (err) {
    console.warn("[rehabilitation] Supabase query failed, falling back to mock data:", err);
  }

  // Fallback to mock data if Supabase returned empty
  if (items.length === 0) {
    items = mockRehabPrograms.map((program) => ({
      program,
      athleteName: mockAthletes.find((a) => a.id === program.athlete_id)?.name ?? "—",
    }));
    athletes = mockAthletes.map((a) => ({ id: a.id, name: a.name }));
  }

  return <RehabilitationClient items={items} athletes={athletes} />;
}

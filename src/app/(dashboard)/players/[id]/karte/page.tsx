import { createClient } from "@/lib/supabase/server";
import { mockAthletes, mockRehabPrograms } from "@/lib/mock-data";
import { KarteClient } from "./KarteClient";
import type { Athlete, RehabProgram, SoapNote, RehabPhase, Priority } from "@/types";

const NRS_CRITICAL = 6;
const ACWR_CRITICAL = 1.5;
const NRS_WATCHLIST = 4;
const ACWR_WATCHLIST = 1.3;

function computeStatus(nrs: number, acwr: number): Priority {
  if (nrs >= NRS_CRITICAL || acwr > ACWR_CRITICAL) return "critical";
  if (nrs >= NRS_WATCHLIST || acwr > ACWR_WATCHLIST) return "watchlist";
  return "normal";
}

export default async function KartePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let athlete: Athlete | null = null;
  let soapNotes: SoapNote[] = [];
  let rehabProgram: RehabProgram | null = null;

  try {
    if (
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ) {
      const supabase = await createClient();

      // Fetch athlete
      const { data: athleteRow, error: athleteError } = await supabase
        .from("athletes")
        .select("id, org_id, team_id, name, position, number, age, sex, profile_photo")
        .eq("id", id)
        .single();

      if (!athleteError && athleteRow) {
        // Latest daily metric for KPIs
        const { data: latestMetricRows } = await supabase
          .from("daily_metrics")
          .select("date, nrs, hrv, acwr, hp_computed")
          .eq("athlete_id", id)
          .order("date", { ascending: false })
          .limit(1);

        const latestMetric =
          latestMetricRows && latestMetricRows.length > 0
            ? latestMetricRows[0]
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

        // Fetch last 10 SOAP notes (graceful fallback if table doesn't exist)
        try {
          const { data: soapRows } = await supabase
            .from("soap_notes")
            .select("id, athlete_id, staff_id, s_text, o_text, a_text, p_text, created_at, ai_assisted")
            .eq("athlete_id", id)
            .order("created_at", { ascending: false })
            .limit(10);

          if (soapRows && soapRows.length > 0) {
            soapNotes = soapRows.map((r) => ({
              id: r.id,
              athlete_id: r.athlete_id,
              staff_id: r.staff_id ?? "",
              s_text: r.s_text ?? "",
              o_text: r.o_text ?? "",
              a_text: r.a_text ?? "",
              p_text: r.p_text ?? "",
              created_at: r.created_at,
              ai_assisted: r.ai_assisted ?? false,
            }));
          }
        } catch {
          // table may not exist yet
        }

        // Fetch active rehab program
        try {
          const { data: rehabRows } = await supabase
            .from("rehab_programs")
            .select(
              "id, athlete_id, diagnosis_code, diagnosis_label, current_phase, start_date, estimated_rtp_date, status, rom, swelling_grade, lsi_percent"
            )
            .eq("athlete_id", id)
            .eq("status", "active")
            .order("start_date", { ascending: false })
            .limit(1);

          if (rehabRows && rehabRows.length > 0) {
            const r = rehabRows[0];
            rehabProgram = {
              id: r.id,
              athlete_id: r.athlete_id,
              diagnosis_code: r.diagnosis_code ?? "",
              diagnosis_label: r.diagnosis_label,
              current_phase: r.current_phase as RehabPhase,
              start_date: r.start_date,
              estimated_rtp_date: r.estimated_rtp_date ?? "",
              status: r.status as RehabProgram["status"],
              rom: r.rom != null ? Number(r.rom) : undefined,
              swelling_grade: r.swelling_grade != null ? r.swelling_grade : undefined,
              lsi_percent: r.lsi_percent != null ? Number(r.lsi_percent) : undefined,
            };
          }
        } catch {
          // table may not exist yet
        }
      }
    }
  } catch (err) {
    console.warn("[karte] Supabase query failed, falling back to mock data:", err);
  }

  // Fallback to mock data
  if (!athlete) {
    const mockAthlete = mockAthletes.find((a) => a.id === id) ?? mockAthletes[0];
    athlete = mockAthlete;
  }

  if (!rehabProgram) {
    const mockProgram = mockRehabPrograms.find((p) => p.athlete_id === athlete!.id);
    rehabProgram = mockProgram ?? null;
  }

  return (
    <KarteClient
      athlete={athlete}
      soapNotes={soapNotes}
      rehabProgram={rehabProgram}
    />
  );
}

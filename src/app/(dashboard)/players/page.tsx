export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { PlayersClient } from "./PlayersClient";
import type { Athlete, Priority } from "@/types";

// Thresholds for computing status from daily_metrics
const NRS_CRITICAL = 6;
const ACWR_CRITICAL = 1.5;
const NRS_WATCHLIST = 4;
const ACWR_WATCHLIST = 1.3;

function computeStatus(nrs: number, acwr: number): Priority {
  if (nrs >= NRS_CRITICAL || acwr > ACWR_CRITICAL) return "critical";
  if (nrs >= NRS_WATCHLIST || acwr > ACWR_WATCHLIST) return "watchlist";
  return "normal";
}

export default async function PlayersPage() {
  let athletes: Athlete[] = [];

  try {
    if (
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ) {
      const supabase = await createClient();

      // Fetch active athletes
      const { data: rows, error } = await supabase
        .from("athletes")
        .select("id, org_id, team_id, name, position, number, age, sex, profile_photo, is_active")
        .eq("is_active", true)
        .order("number", { ascending: true });

      if (error) throw error;

      if (rows && rows.length > 0) {
        const athleteIds = rows.map((r) => r.id);

        // Fetch the most recent daily_metrics per athlete
        const { data: metricsRows } = await supabase
          .from("daily_metrics")
          .select("athlete_id, date, nrs, hrv, acwr, hp_computed")
          .in("athlete_id", athleteIds)
          .order("date", { ascending: false });

        // Keep only the latest metric per athlete
        const latestMetric: Record<
          string,
          { nrs: number; hrv: number; acwr: number; hp_computed: number; date: string }
        > = {};

        for (const m of metricsRows ?? []) {
          if (!latestMetric[m.athlete_id]) {
            latestMetric[m.athlete_id] = {
              nrs: Number(m.nrs ?? 0),
              hrv: Number(m.hrv ?? 0),
              acwr: Number(m.acwr ?? 0),
              hp_computed: Number(m.hp_computed ?? 0),
              date: m.date,
            };
          }
        }

        athletes = rows.map((r) => {
          const latest = latestMetric[r.id];
          const nrs = latest?.nrs ?? 0;
          const hrv = latest?.hrv ?? 0;
          const acwr = latest?.acwr ?? 0;
          const hp = latest?.hp_computed ?? 0;
          const status = computeStatus(nrs, acwr);

          return {
            id: r.id,
            org_id: r.org_id,
            team_id: r.team_id ?? "",
            name: r.name,
            position: r.position ?? "",
            number: r.number ?? 0,
            age: r.age ?? 0,
            sex: r.sex ?? "male",
            profile_photo: r.profile_photo ?? undefined,
            status,
            hp,
            nrs,
            hrv,
            acwr,
            last_updated: latest?.date ?? new Date().toISOString(),
          } satisfies Athlete;
        });
      }
    }
  } catch (err) {
    console.warn("[players] Supabase query failed:", err);
  }

  return <PlayersClient athletes={athletes} />;
}

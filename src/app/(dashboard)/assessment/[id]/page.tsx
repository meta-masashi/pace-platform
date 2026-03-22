export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { mockAthletes } from "@/lib/mock-data";
import { AssessmentClient } from "./AssessmentClient";
import type { Athlete } from "@/types";

export default async function AssessmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let athlete: Athlete | null = null;

  try {
    const supabase = await createClient();

    const { data: row, error } = await supabase
      .from("athletes")
      .select("*")
      .eq("id", id)
      .single();

    if (!error && row) {
      athlete = row as Athlete;
    }
  } catch (err) {
    console.warn("[assessment/id] Supabase query failed, falling back to mock data:", err);
  }

  // Fall back to mock data if Supabase returned empty
  if (!athlete) {
    athlete = mockAthletes.find((a) => a.id === id) ?? mockAthletes[0];
  }

  return <AssessmentClient athlete={athlete} />;
}

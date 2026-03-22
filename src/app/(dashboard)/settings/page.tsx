export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { mockStaff } from "@/lib/mock-data";
import { SettingsClient } from "./SettingsClient";
import type { Staff } from "@/types";

export default async function SettingsPage() {
  let staff: Staff[] = [];

  try {
    const supabase = await createClient();

    const { data: staffRows, error } = await supabase
      .from("staff")
      .select("*")
      .order("name");

    if (!error && staffRows && staffRows.length > 0) {
      staff = staffRows as Staff[];
    }
  } catch (err) {
    console.warn("[settings] Supabase query failed, falling back to mock data:", err);
  }

  // Fall back to mock data if Supabase returned empty
  if (staff.length === 0) staff = mockStaff;

  return <SettingsClient staff={staff} />;
}

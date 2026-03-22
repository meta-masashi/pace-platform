export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
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
    console.warn("[settings] Supabase query failed:", err);
  }

  return <SettingsClient staff={staff} />;
}

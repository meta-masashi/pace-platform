import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Staff } from "@/types";

/**
 * Returns the Supabase Auth user for the current request (server component / API route).
 * Does NOT hit the staff table. Returns null when Supabase is not configured.
 */
export async function getCurrentUser(): Promise<User | null> {
  // Dev fallback: if Supabase env vars are not set, return null gracefully
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return null;
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  } catch {
    return null;
  }
}

/**
 * Returns the Staff record for the currently authenticated user.
 * The staff table uses auth.uid() as its primary key (id = auth user id).
 *
 * Falls back to mockStaff[0] when Supabase is not configured so the
 * dev experience without a live Supabase project remains intact.
 */
export async function getCurrentStaff(): Promise<Staff | null> {
  // If Supabase env vars are not set, return null
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return null;
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    // The staff.id == auth.users.id (see 001_schema.sql)
    const { data: staffRow, error } = await supabase
      .from("staff")
      .select("id, org_id, team_id, name, email, role, is_leader, is_active, avatar_url")
      .eq("id", user.id)
      .single();

    if (error || !staffRow) {
      // Staff record not found — return a minimal Staff shaped from auth session
      return {
        id: user.id,
        org_id: "",
        team_id: "",
        name: user.user_metadata?.name ?? user.email ?? "Unknown",
        email: user.email ?? "",
        role: (user.user_metadata?.role as Staff["role"]) ?? "AT",
        is_leader: false,
        is_active: true,
      };
    }

    return staffRow as Staff;
  } catch {
    // If anything goes wrong (network, missing table, etc.) return null
    return null;
  }
}

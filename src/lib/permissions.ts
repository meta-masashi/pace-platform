/**
 * Role-based permission helpers for PACE Platform.
 *
 * Permission model:
 *   master  — full access (all create/edit/delete + org admin)
 *   AT      — athletic trainer: read all, write own assessments/soap/locks(soft)
 *   PT      — physiotherapist: read all, write own rehab programs/soap
 *   S&C     — strength & conditioning: read metrics, write workouts
 *
 * Usage in API routes (see ADR-002 standard pattern):
 *   const staff = await getStaffWithRole(user.id);
 *   if (!hasPermission(staff.role, "soap:write")) return 403;
 */

import { createClient } from "@/lib/supabase/server";
import type { Role, Staff } from "@/types";

// ---------------------------------------------------------------------------
// Permission constants
// ---------------------------------------------------------------------------

export type Permission =
  // Assessment & clinical
  | "assessment:read"
  | "assessment:write"
  | "soap:read"
  | "soap:write"
  // Locks
  | "lock:soft"       // any staff can issue soft lock
  | "lock:hard"       // master only
  // Rehab
  | "rehab:read"
  | "rehab:write"
  // Workouts / team training
  | "workout:read"
  | "workout:write"
  | "workout:approve"
  // Athletes & metrics
  | "athlete:read"
  | "athlete:write"
  | "metrics:read"
  | "metrics:write"
  // Triage
  | "triage:read"
  | "triage:resolve"
  // Audit logs
  | "audit:read"
  // Org admin
  | "org:admin"
  | "staff:invite"
  | "staff:manage";

/**
 * Permission matrix per role.
 * Entries not listed are implicitly DENIED.
 */
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  master: [
    "assessment:read", "assessment:write",
    "soap:read", "soap:write",
    "lock:soft", "lock:hard",
    "rehab:read", "rehab:write",
    "workout:read", "workout:write", "workout:approve",
    "athlete:read", "athlete:write",
    "metrics:read", "metrics:write",
    "triage:read", "triage:resolve",
    "audit:read",
    "org:admin", "staff:invite", "staff:manage",
  ],
  AT: [
    "assessment:read", "assessment:write",
    "soap:read", "soap:write",
    "lock:soft",
    "rehab:read",
    "workout:read",
    "athlete:read",
    "metrics:read", "metrics:write",
    "triage:read", "triage:resolve",
  ],
  PT: [
    "assessment:read", "assessment:write",
    "soap:read", "soap:write",
    "lock:soft",
    "rehab:read", "rehab:write",
    "workout:read",
    "athlete:read",
    "metrics:read",
    "triage:read", "triage:resolve",
  ],
  "S&C": [
    "workout:read", "workout:write",
    "athlete:read",
    "metrics:read", "metrics:write",
    "triage:read",
  ],
};

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the given role has the requested permission.
 */
export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/**
 * Returns all permissions granted to a role (useful for client-side capability checks).
 */
export function getPermissions(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

/**
 * Fetches the Staff record for a given auth user ID.
 * Returns null if the user is not in the staff table.
 *
 * NOTE: Uses the server Supabase client (cookies-based), so this is safe to
 * call from API Route handlers after JWT verification.
 */
export async function getStaffWithRole(userId: string): Promise<Staff | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("staff")
      .select("id, org_id, team_id, name, email, role, is_leader, is_active, avatar_url")
      .eq("id", userId)
      .eq("is_active", true)
      .single();

    if (error || !data) return null;
    return data as Staff;
  } catch {
    return null;
  }
}

/**
 * Convenience: checks if the authenticated user has a permission.
 * Combines getStaffWithRole + hasPermission into a single call.
 *
 * @returns { allowed: boolean; staff: Staff | null }
 */
export async function checkPermission(
  userId: string,
  permission: Permission
): Promise<{ allowed: boolean; staff: Staff | null }> {
  const staff = await getStaffWithRole(userId);
  if (!staff) return { allowed: false, staff: null };
  return { allowed: hasPermission(staff.role, permission), staff };
}

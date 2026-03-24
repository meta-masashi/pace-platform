/**
 * Audit log writer for PACE Platform.
 *
 * Every state-mutating API Route MUST call logAudit() so that:
 *   - CDS disclaimer acceptance is recorded per operation
 *   - Medical actions are traceable for compliance
 *   - AI-assisted decisions are distinguishable from manual ones
 *
 * The audit_logs table is insert-only from non-master staff (see 002_rls.sql).
 * This helper uses the service-role client to bypass RLS on insert so that
 * API routes don't need the anon client to have insert rights.
 */

import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { AuditActionType, Role } from "@/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuditPayload {
  /** The staff ID performing the action (= auth.uid()) */
  actor_id: string;
  actor_name?: string;
  actor_role?: Role;

  /** The type of action being logged */
  action: AuditActionType;

  /** Optional athlete context */
  athlete_id?: string;
  athlete_name?: string;

  /** Whether this action involved AI assistance */
  ai_assisted?: boolean;

  /** Whether the CDS disclaimer was shown to the user before the action */
  disclaimer_shown?: boolean;

  /** Freeform details (JSON-serializable) */
  details?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key);
}

// Current CDS engine version — bump when the Bayesian model or LLM prompt
// changes in a breaking way so audit records remain interpretable.
const CDS_VERSION =
  process.env.NEXT_PUBLIC_CDS_VERSION ?? "pace-v2.0";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Write a row to the audit_logs table.
 *
 * Errors are swallowed and logged to stderr so that an audit write failure
 * never causes the primary API operation to fail. However, failures are
 * counted so that monitoring can alert on persistent audit issues.
 */
export async function logAudit(payload: AuditPayload): Promise<void> {
  const supabase = getServiceClient();
  if (!supabase) {
    // No Supabase in dev/test — skip silently
    return;
  }

  const row = {
    staff_id: payload.actor_id,
    staff_name: payload.actor_name ?? "unknown",
    staff_role: payload.actor_role ?? "AT",
    action_type: payload.action,
    athlete_id: payload.athlete_id ?? null,
    athlete_name: payload.athlete_name ?? null,
    ai_assisted: payload.ai_assisted ?? false,
    disclaimer_shown: payload.disclaimer_shown ?? false,
    cds_version: CDS_VERSION,
    notes: payload.details ? JSON.stringify(payload.details) : null,
    timestamp: new Date().toISOString(),
  };

  try {
    const { error } = await supabase.from("audit_logs").insert(row);
    if (error) {
      console.error("[audit] insert failed:", error.message, "| payload:", JSON.stringify(row));
    }
  } catch (err) {
    console.error("[audit] unexpected error:", err);
  }
}

/**
 * Convenience: logs an AI-assisted action with disclaimer already set to true.
 * Use this for any route that calls Gemini or the Bayesian engine.
 */
export async function logAiAction(
  actorId: string,
  action: AuditActionType,
  extra?: Omit<AuditPayload, "actor_id" | "action" | "ai_assisted" | "disclaimer_shown">
): Promise<void> {
  return logAudit({
    actor_id: actorId,
    action,
    ai_assisted: true,
    disclaimer_shown: true,
    ...extra,
  });
}

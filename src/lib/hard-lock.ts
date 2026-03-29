/**
 * Hard Lock validation utility.
 *
 * Fetches active locks from the `athlete_locks` Supabase table.
 * Falls back to an empty array (no locks = no blocks) when Supabase is
 * unavailable or env vars are absent, so dev/test environments without
 * a database still work safely.
 *
 * Mock data has been fully removed (防壁1: モック実装の完全排除).
 */

import { createClient } from "@/lib/supabase/server";
import type { AthleteLock } from "@/types";

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface HardLockResult {
  /** Tags that are blocked for this athlete */
  blocked: string[];
  /** The full lock records that triggered each block (for audit purposes) */
  violations: AthleteLock[];
}

// ---------------------------------------------------------------------------
// Internal: fetch active hard locks from Supabase
// ---------------------------------------------------------------------------

async function fetchActiveLocks(athleteId: string): Promise<AthleteLock[]> {
  try {
    const supabase = await createClient();
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from("athlete_locks")
      .select("id, athlete_id, set_by_staff_id, lock_type, tag, reason, set_at, expires_at")
      .eq("athlete_id", athleteId)
      .eq("lock_type", "hard")
      .eq("is_active", true)
      .or(`expires_at.is.null,expires_at.gt.${now}`);

    if (error) {
      console.warn("[hard-lock] Supabase query failed:", error.message);
      // 防壁4: フォールバック — Supabase未設定 / 接続失敗時は空配列（ブロックなし）で安全側に倒す
      return [];
    }

    return (data ?? []).map((row: any) => ({
      id: row.id as string,
      athlete_id: row.athlete_id as string,
      set_by_staff_id: row.set_by_staff_id as string,
      lock_type: row.lock_type as "hard" | "soft",
      tag: row.tag as string,
      reason: row.reason as string,
      set_at: row.set_at as string,
      expires_at: row.expires_at as string | undefined,
    }));
  } catch (err) {
    // Supabase env vars absent or network failure — safe fallback
    console.warn("[hard-lock] Could not reach Supabase, falling back to empty lock set:", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate exercise tags against an athlete's active Hard Locks.
 *
 * Returns the subset of `exerciseTags` that are blocked and the
 * corresponding lock records. A tag is blocked if any active hard lock
 * for the athlete matches that tag (case-insensitive).
 *
 * @param athleteId    The athlete whose locks to check
 * @param exerciseTags The proposed exercise/training tags to validate
 */
export async function validateHardLocks(
  athleteId: string,
  exerciseTags: string[]
): Promise<HardLockResult> {
  const activeLocks = await fetchActiveLocks(athleteId);
  const lockedTags = new Set(activeLocks.map((l) => l.tag.toLowerCase()));

  const blocked: string[] = [];
  const violations: AthleteLock[] = [];

  for (const tag of exerciseTags) {
    if (lockedTags.has(tag.toLowerCase())) {
      blocked.push(tag);
      const lock = activeLocks.find(
        (l) => l.tag.toLowerCase() === tag.toLowerCase()
      );
      if (lock && !violations.find((v) => v.id === lock.id)) {
        violations.push(lock);
      }
    }
  }

  return { blocked, violations };
}

/**
 * Convenience helper: returns true if ANY of the given tags are hard-locked
 * for this athlete. Useful as a quick pre-flight check.
 */
export async function hasHardLockViolation(
  athleteId: string,
  exerciseTags: string[]
): Promise<boolean> {
  const { blocked } = await validateHardLocks(athleteId, exerciseTags);
  return blocked.length > 0;
}

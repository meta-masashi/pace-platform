/**
 * Hard Lock validation utility.
 *
 * For MVP, locks are sourced from the in-memory mock store.
 * The interface is designed so that switching to a Supabase query
 * later is a single-file change (replace the mock lookup below
 * with a `supabase.from('athlete_locks').select(...)` call).
 */

import type { AthleteLock } from "@/types";

// ---------------------------------------------------------------------------
// MVP mock lock store — mirrors what would live in the `athlete_locks` table.
// ---------------------------------------------------------------------------

const MOCK_HARD_LOCKS: AthleteLock[] = [
  {
    id: "lock-1",
    athlete_id: "athlete-1",
    set_by_staff_id: "staff-2",
    lock_type: "hard",
    tag: "ankle_impact",
    reason: "Grade 2 右足関節捻挫 — 荷重衝撃禁止",
    set_at: "2026-03-20T10:00:00",
    expires_at: "2026-04-03T10:00:00",
  },
  {
    id: "lock-2",
    athlete_id: "athlete-1",
    set_by_staff_id: "staff-2",
    lock_type: "hard",
    tag: "bilateral_jump",
    reason: "両脚ジャンプ着地禁止 — リハPhase 1",
    set_at: "2026-03-20T10:00:00",
    expires_at: "2026-04-03T10:00:00",
  },
  {
    id: "lock-3",
    athlete_id: "athlete-2",
    set_by_staff_id: "staff-3",
    lock_type: "hard",
    tag: "knee_flexion_load",
    reason: "膝蓋腱症 — 深屈曲負荷禁止",
    set_at: "2026-03-19T09:00:00",
  },
];

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface HardLockResult {
  /** Tags that are blocked for this athlete */
  blocked: string[];
  /** The full lock records that triggered each block (for audit purposes) */
  violations: AthleteLock[];
}

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
  // --------------------------------------------------------------------------
  // Data source — swap this block for a Supabase query when ready:
  //
  //   const { data, error } = await supabase
  //     .from('athlete_locks')
  //     .select('*')
  //     .eq('athlete_id', athleteId)
  //     .eq('lock_type', 'hard')
  //     .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);
  //   const activeLocks: AthleteLock[] = data ?? [];
  // --------------------------------------------------------------------------

  const now = new Date();

  const activeLocks: AthleteLock[] = MOCK_HARD_LOCKS.filter((lock) => {
    if (lock.athlete_id !== athleteId) return false;
    if (lock.lock_type !== "hard") return false;
    if (lock.expires_at && new Date(lock.expires_at) <= now) return false;
    return true;
  });

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

-- Migration: Add baseline reset timestamp to athlete_condition_cache
-- When set, Node 1 maturation mode uses only data after this timestamp.
-- Triggered by coach via "Season Start / Rehab Return" action.

ALTER TABLE athlete_condition_cache
  ADD COLUMN IF NOT EXISTS baseline_reset_at TIMESTAMPTZ DEFAULT NULL;

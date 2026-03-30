-- Migration: Add calibration timestamp to athlete_condition_cache
-- Used to trigger Z-Score baseline refresh every 3 months.

ALTER TABLE athlete_condition_cache
  ADD COLUMN IF NOT EXISTS last_calibration_at TIMESTAMPTZ DEFAULT NULL;

-- Migration: Add menstrual phase tracking to daily_metrics
-- For female athletes, tracks cycle phase for RED-S detection (90+ days amenorrhea).

ALTER TABLE daily_metrics
  ADD COLUMN IF NOT EXISTS menstrual_phase VARCHAR(20) DEFAULT NULL;

-- Validate allowed values at application level:
-- 'menstrual' | 'follicular' | 'ovulatory' | 'luteal' | 'none' | NULL
COMMENT ON COLUMN daily_metrics.menstrual_phase IS 'Menstrual cycle phase: menstrual/follicular/ovulatory/luteal/none/NULL';

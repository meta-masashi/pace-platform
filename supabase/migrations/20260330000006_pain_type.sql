-- Migration: Add pain type classification to daily_metrics
-- Tracks traumatic vs overuse pain for contact sport differentiation.

ALTER TABLE daily_metrics
  ADD COLUMN IF NOT EXISTS pain_type VARCHAR(20) DEFAULT NULL;

-- Allowed values: 'traumatic' | 'overuse' | NULL
COMMENT ON COLUMN daily_metrics.pain_type IS 'Pain origin type: traumatic (contact/impact) or overuse (repetitive strain)';

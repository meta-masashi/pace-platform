-- Migration: Add NSAID medication flag to daily_metrics
-- Allows masking Pain NRS P1 check when athlete has taken analgesics in the past 24h.

ALTER TABLE daily_metrics
  ADD COLUMN IF NOT EXISTS medication_nsaid_24h BOOLEAN NOT NULL DEFAULT false;

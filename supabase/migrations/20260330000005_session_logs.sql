-- Migration: Create session_logs table for multi-session support
-- Enables tracking multiple training sessions per day (e.g., double-split sessions).
-- daily_metrics remains the daily aggregate (backward compatible).

CREATE TABLE IF NOT EXISTS session_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  session_number SMALLINT NOT NULL DEFAULT 1,
  session_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  srpe NUMERIC(6,1) NOT NULL DEFAULT 0,
  training_duration_min NUMERIC(6,1) NOT NULL DEFAULT 0,
  session_load NUMERIC(10,1) NOT NULL DEFAULT 0,
  objective_load_metrics JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (athlete_id, session_date, session_number)
);

-- Index for efficient athlete+date queries
CREATE INDEX IF NOT EXISTS idx_session_logs_athlete_date
  ON session_logs (athlete_id, session_date DESC);

-- RLS
ALTER TABLE session_logs ENABLE ROW LEVEL SECURITY;

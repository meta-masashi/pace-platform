-- Migration: Coaching history table
-- Stores daily AI coaching advice to prevent repetitive suggestions
-- and enable context-aware personalized recommendations.

CREATE TABLE IF NOT EXISTS coaching_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  org_id UUID NOT NULL,
  coaching_date DATE NOT NULL,
  advice_text TEXT NOT NULL,
  context_snapshot JSONB DEFAULT NULL,  -- conditioning score, acwr, etc at time of advice
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (athlete_id, coaching_date)
);

CREATE INDEX IF NOT EXISTS idx_coaching_history_athlete_date
  ON coaching_history (athlete_id, coaching_date DESC);

ALTER TABLE coaching_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY coaching_history_select ON coaching_history
  FOR SELECT USING (org_id = get_my_org_id() OR athlete_id IN (SELECT id FROM athletes WHERE user_id = auth.uid()));

CREATE POLICY coaching_history_insert ON coaching_history
  FOR INSERT WITH CHECK (org_id = get_my_org_id());

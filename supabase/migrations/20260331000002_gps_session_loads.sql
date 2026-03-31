-- Migration: GPS external load data table
-- Evidence: Hickey (2021) Level 2b, Matas-Bustos (2025) Level 2b

CREATE TABLE IF NOT EXISTS gps_session_loads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  org_id UUID NOT NULL,
  session_date DATE NOT NULL,
  total_distance_km NUMERIC(6,2),
  high_speed_running_m NUMERIC(8,1),    -- >18km/h
  sprint_distance_m NUMERIC(8,1),       -- >24km/h
  acceleration_count INTEGER,           -- >2m/s²
  deceleration_count INTEGER,           -- <-2m/s²
  player_load NUMERIC(8,2),             -- 3軸複合 (Catapult)
  source VARCHAR(50) DEFAULT 'manual',  -- 'catapult', 'statsports', 'manual'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (athlete_id, session_date)
);

CREATE INDEX IF NOT EXISTS idx_gps_loads_athlete_date
  ON gps_session_loads(athlete_id, session_date DESC);

ALTER TABLE gps_session_loads ENABLE ROW LEVEL SECURITY;

CREATE POLICY gps_loads_select ON gps_session_loads
  FOR SELECT USING (org_id = get_my_org_id());

CREATE POLICY gps_loads_insert ON gps_session_loads
  FOR INSERT WITH CHECK (org_id = get_my_org_id());

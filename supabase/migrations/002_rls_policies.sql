-- =============================================================
-- PACE Platform — 002_rls_policies.sql
-- Row Level Security policies for all tables
-- Idempotent: DROP POLICY IF EXISTS before CREATE POLICY
-- =============================================================

-- =============================================================
-- Enable RLS on all tables
-- =============================================================
ALTER TABLE organizations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams               ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff               ENABLE ROW LEVEL SECURITY;
ALTER TABLE athletes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_metrics       ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_nodes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE athlete_locks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercises            ENABLE ROW LEVEL SECURITY;
ALTER TABLE rehab_programs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE rehab_gates         ENABLE ROW LEVEL SECURITY;
ALTER TABLE workouts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE soap_notes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records  ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels            ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages            ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalation_records  ENABLE ROW LEVEL SECURITY;
ALTER TABLE rtp_injury_nodes    ENABLE ROW LEVEL SECURITY;

-- =============================================================
-- HELPER FUNCTIONS
-- =============================================================

-- Returns the org_id for the currently authenticated staff user
CREATE OR REPLACE FUNCTION get_my_org_id()
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM staff WHERE id = auth.uid() AND is_active = true LIMIT 1;
$$;

COMMENT ON FUNCTION get_my_org_id() IS
  'Returns org_id for current auth.uid() from staff table. Returns NULL if not found.';

-- Returns the role for the currently authenticated staff user
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role::text FROM staff WHERE id = auth.uid() AND is_active = true LIMIT 1;
$$;

COMMENT ON FUNCTION get_my_role() IS
  'Returns role text for current auth.uid() from staff table.';

-- Returns true if current user has the specified role
CREATE OR REPLACE FUNCTION has_role(check_role TEXT)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM staff
    WHERE id = auth.uid()
      AND role::text = check_role
      AND is_active = true
  );
$$;

-- Returns true if current user is a master
CREATE OR REPLACE FUNCTION is_master()
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT has_role('master');
$$;

-- Returns true if current user can write clinical data (AT or master)
CREATE OR REPLACE FUNCTION is_clinical()
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM staff
    WHERE id = auth.uid()
      AND role::text IN ('master', 'AT', 'PT')
      AND is_active = true
  );
$$;

-- =============================================================
-- ORGANIZATIONS
-- =============================================================
DROP POLICY IF EXISTS "org_select" ON organizations;
CREATE POLICY "org_select" ON organizations
  FOR SELECT USING (id = get_my_org_id());

DROP POLICY IF EXISTS "org_insert" ON organizations;
CREATE POLICY "org_insert" ON organizations
  FOR INSERT WITH CHECK (is_master());

DROP POLICY IF EXISTS "org_update" ON organizations;
CREATE POLICY "org_update" ON organizations
  FOR UPDATE USING (id = get_my_org_id() AND is_master());

-- =============================================================
-- TEAMS
-- =============================================================
DROP POLICY IF EXISTS "teams_select" ON teams;
CREATE POLICY "teams_select" ON teams
  FOR SELECT USING (org_id = get_my_org_id());

DROP POLICY IF EXISTS "teams_insert" ON teams;
CREATE POLICY "teams_insert" ON teams
  FOR INSERT WITH CHECK (org_id = get_my_org_id() AND is_master());

DROP POLICY IF EXISTS "teams_update" ON teams;
CREATE POLICY "teams_update" ON teams
  FOR UPDATE USING (org_id = get_my_org_id() AND is_master());

DROP POLICY IF EXISTS "teams_delete" ON teams;
CREATE POLICY "teams_delete" ON teams
  FOR DELETE USING (org_id = get_my_org_id() AND is_master());

-- =============================================================
-- STAFF
-- Staff can read all staff in their org.
-- Only master can insert/delete staff.
-- Staff can update their own record; master can update any.
-- =============================================================
DROP POLICY IF EXISTS "staff_select" ON staff;
CREATE POLICY "staff_select" ON staff
  FOR SELECT USING (org_id = get_my_org_id());

DROP POLICY IF EXISTS "staff_insert" ON staff;
CREATE POLICY "staff_insert" ON staff
  FOR INSERT WITH CHECK (org_id = get_my_org_id() AND is_master());

DROP POLICY IF EXISTS "staff_update" ON staff;
CREATE POLICY "staff_update" ON staff
  FOR UPDATE USING (
    org_id = get_my_org_id()
    AND (id = auth.uid() OR is_master())
  );

DROP POLICY IF EXISTS "staff_delete" ON staff;
CREATE POLICY "staff_delete" ON staff
  FOR DELETE USING (org_id = get_my_org_id() AND is_master());

-- =============================================================
-- ATHLETES
-- All roles can read athletes in their org.
-- Only master can create/delete athletes; AT can update status fields.
-- =============================================================
DROP POLICY IF EXISTS "athletes_select" ON athletes;
CREATE POLICY "athletes_select" ON athletes
  FOR SELECT USING (org_id = get_my_org_id());

DROP POLICY IF EXISTS "athletes_insert" ON athletes;
CREATE POLICY "athletes_insert" ON athletes
  FOR INSERT WITH CHECK (org_id = get_my_org_id() AND is_master());

DROP POLICY IF EXISTS "athletes_update" ON athletes;
CREATE POLICY "athletes_update" ON athletes
  FOR UPDATE USING (
    org_id = get_my_org_id()
    AND (is_master() OR get_my_role() IN ('AT', 'PT'))
  );

DROP POLICY IF EXISTS "athletes_delete" ON athletes;
CREATE POLICY "athletes_delete" ON athletes
  FOR DELETE USING (org_id = get_my_org_id() AND is_master());

-- =============================================================
-- DAILY METRICS
-- All staff can read; AT and master can write.
-- =============================================================
DROP POLICY IF EXISTS "daily_metrics_select" ON daily_metrics;
CREATE POLICY "daily_metrics_select" ON daily_metrics
  FOR SELECT USING (
    athlete_id IN (SELECT id FROM athletes WHERE org_id = get_my_org_id())
  );

DROP POLICY IF EXISTS "daily_metrics_insert" ON daily_metrics;
CREATE POLICY "daily_metrics_insert" ON daily_metrics
  FOR INSERT WITH CHECK (
    athlete_id IN (SELECT id FROM athletes WHERE org_id = get_my_org_id())
    AND (is_master() OR get_my_role() = 'AT')
  );

DROP POLICY IF EXISTS "daily_metrics_update" ON daily_metrics;
CREATE POLICY "daily_metrics_update" ON daily_metrics
  FOR UPDATE USING (
    athlete_id IN (SELECT id FROM athletes WHERE org_id = get_my_org_id())
    AND (is_master() OR get_my_role() = 'AT')
  );

-- =============================================================
-- ASSESSMENT NODES
-- Shared knowledge base: all authenticated staff can read.
-- Only master can modify.
-- =============================================================
DROP POLICY IF EXISTS "assessment_nodes_select" ON assessment_nodes;
CREATE POLICY "assessment_nodes_select" ON assessment_nodes
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "assessment_nodes_insert" ON assessment_nodes;
CREATE POLICY "assessment_nodes_insert" ON assessment_nodes
  FOR INSERT WITH CHECK (is_master());

DROP POLICY IF EXISTS "assessment_nodes_update" ON assessment_nodes;
CREATE POLICY "assessment_nodes_update" ON assessment_nodes
  FOR UPDATE USING (is_master());

-- =============================================================
-- ASSESSMENTS
-- All staff can read assessments in their org.
-- AT and master can create/update assessments.
-- =============================================================
DROP POLICY IF EXISTS "assessments_select" ON assessments;
CREATE POLICY "assessments_select" ON assessments
  FOR SELECT USING (
    athlete_id IN (SELECT id FROM athletes WHERE org_id = get_my_org_id())
  );

DROP POLICY IF EXISTS "assessments_insert" ON assessments;
CREATE POLICY "assessments_insert" ON assessments
  FOR INSERT WITH CHECK (
    athlete_id IN (SELECT id FROM athletes WHERE org_id = get_my_org_id())
    AND staff_id = auth.uid()
    AND (is_master() OR get_my_role() = 'AT')
  );

DROP POLICY IF EXISTS "assessments_update" ON assessments;
CREATE POLICY "assessments_update" ON assessments
  FOR UPDATE USING (
    athlete_id IN (SELECT id FROM athletes WHERE org_id = get_my_org_id())
    AND (staff_id = auth.uid() OR is_master())
  );

-- =============================================================
-- ASSESSMENT SESSIONS
-- =============================================================
DROP POLICY IF EXISTS "assessment_sessions_all" ON assessment_sessions;
CREATE POLICY "assessment_sessions_all" ON assessment_sessions
  FOR ALL USING (
    assessment_id IN (
      SELECT id FROM assessments
      WHERE athlete_id IN (SELECT id FROM athletes WHERE org_id = get_my_org_id())
    )
  );

-- =============================================================
-- ATHLETE LOCKS
-- All staff can read locks in their org.
-- HARD locks: only master can create/modify.
-- SOFT locks: AT can create; master can modify.
-- =============================================================
DROP POLICY IF EXISTS "locks_select" ON athlete_locks;
CREATE POLICY "locks_select" ON athlete_locks
  FOR SELECT USING (
    athlete_id IN (SELECT id FROM athletes WHERE org_id = get_my_org_id())
  );

DROP POLICY IF EXISTS "locks_insert" ON athlete_locks;
CREATE POLICY "locks_insert" ON athlete_locks
  FOR INSERT WITH CHECK (
    athlete_id IN (SELECT id FROM athletes WHERE org_id = get_my_org_id())
    AND set_by_staff_id = auth.uid()
    AND (
      lock_type = 'soft'
      OR is_master()
    )
  );

DROP POLICY IF EXISTS "locks_update" ON athlete_locks;
CREATE POLICY "locks_update" ON athlete_locks
  FOR UPDATE USING (
    athlete_id IN (SELECT id FROM athletes WHERE org_id = get_my_org_id())
    AND (lock_type = 'soft' OR is_master())
  );

DROP POLICY IF EXISTS "locks_delete" ON athlete_locks;
CREATE POLICY "locks_delete" ON athlete_locks
  FOR DELETE USING (
    athlete_id IN (SELECT id FROM athletes WHERE org_id = get_my_org_id())
    AND is_master()
  );

-- =============================================================
-- EXERCISES
-- Public read for all staff; master-only write.
-- =============================================================
DROP POLICY IF EXISTS "exercises_select" ON exercises;
CREATE POLICY "exercises_select" ON exercises
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "exercises_write" ON exercises;
CREATE POLICY "exercises_write" ON exercises
  FOR ALL USING (is_master());

-- =============================================================
-- REHAB PROGRAMS
-- All staff can read; PT and master can create/update.
-- =============================================================
DROP POLICY IF EXISTS "rehab_programs_select" ON rehab_programs;
CREATE POLICY "rehab_programs_select" ON rehab_programs
  FOR SELECT USING (
    athlete_id IN (SELECT id FROM athletes WHERE org_id = get_my_org_id())
  );

DROP POLICY IF EXISTS "rehab_programs_insert" ON rehab_programs;
CREATE POLICY "rehab_programs_insert" ON rehab_programs
  FOR INSERT WITH CHECK (
    athlete_id IN (SELECT id FROM athletes WHERE org_id = get_my_org_id())
    AND (is_master() OR get_my_role() = 'PT')
  );

DROP POLICY IF EXISTS "rehab_programs_update" ON rehab_programs;
CREATE POLICY "rehab_programs_update" ON rehab_programs
  FOR UPDATE USING (
    athlete_id IN (SELECT id FROM athletes WHERE org_id = get_my_org_id())
    AND (is_master() OR get_my_role() = 'PT')
  );

-- =============================================================
-- REHAB GATES
-- =============================================================
DROP POLICY IF EXISTS "rehab_gates_select" ON rehab_gates;
CREATE POLICY "rehab_gates_select" ON rehab_gates
  FOR SELECT USING (
    program_id IN (
      SELECT id FROM rehab_programs
      WHERE athlete_id IN (SELECT id FROM athletes WHERE org_id = get_my_org_id())
    )
  );

DROP POLICY IF EXISTS "rehab_gates_write" ON rehab_gates;
CREATE POLICY "rehab_gates_write" ON rehab_gates
  FOR ALL USING (
    program_id IN (
      SELECT id FROM rehab_programs
      WHERE athlete_id IN (SELECT id FROM athletes WHERE org_id = get_my_org_id())
    )
    AND (is_master() OR get_my_role() = 'PT')
  );

-- =============================================================
-- WORKOUTS
-- All staff can read workouts in their org.
-- S&C and master can create; master approves/distributes.
-- =============================================================
DROP POLICY IF EXISTS "workouts_select" ON workouts;
CREATE POLICY "workouts_select" ON workouts
  FOR SELECT USING (
    (athlete_id IS NULL OR athlete_id IN (SELECT id FROM athletes WHERE org_id = get_my_org_id()))
    AND (team_id IS NULL OR team_id IN (SELECT id FROM teams WHERE org_id = get_my_org_id()))
  );

DROP POLICY IF EXISTS "workouts_insert" ON workouts;
CREATE POLICY "workouts_insert" ON workouts
  FOR INSERT WITH CHECK (
    (athlete_id IS NULL OR athlete_id IN (SELECT id FROM athletes WHERE org_id = get_my_org_id()))
    AND (team_id IS NULL OR team_id IN (SELECT id FROM teams WHERE org_id = get_my_org_id()))
    AND (is_master() OR get_my_role() IN ('S&C', 'PT', 'AT'))
  );

DROP POLICY IF EXISTS "workouts_update" ON workouts;
CREATE POLICY "workouts_update" ON workouts
  FOR UPDATE USING (
    (athlete_id IS NULL OR athlete_id IN (SELECT id FROM athletes WHERE org_id = get_my_org_id()))
    AND (team_id IS NULL OR team_id IN (SELECT id FROM teams WHERE org_id = get_my_org_id()))
    AND (is_master() OR get_my_role() = 'S&C')
  );

-- =============================================================
-- SOAP NOTES
-- All staff can read SOAP notes in their org.
-- PT and AT and master can create; only author or master can update.
-- =============================================================
DROP POLICY IF EXISTS "soap_notes_select" ON soap_notes;
CREATE POLICY "soap_notes_select" ON soap_notes
  FOR SELECT USING (
    athlete_id IN (SELECT id FROM athletes WHERE org_id = get_my_org_id())
  );

DROP POLICY IF EXISTS "soap_notes_insert" ON soap_notes;
CREATE POLICY "soap_notes_insert" ON soap_notes
  FOR INSERT WITH CHECK (
    athlete_id IN (SELECT id FROM athletes WHERE org_id = get_my_org_id())
    AND staff_id = auth.uid()
    AND (is_master() OR get_my_role() IN ('AT', 'PT'))
  );

DROP POLICY IF EXISTS "soap_notes_update" ON soap_notes;
CREATE POLICY "soap_notes_update" ON soap_notes
  FOR UPDATE USING (
    athlete_id IN (SELECT id FROM athletes WHERE org_id = get_my_org_id())
    AND (staff_id = auth.uid() OR is_master())
  );

-- =============================================================
-- SCHEDULE EVENTS
-- All staff can read; master and AT can create/update.
-- =============================================================
DROP POLICY IF EXISTS "schedule_events_select" ON schedule_events;
CREATE POLICY "schedule_events_select" ON schedule_events
  FOR SELECT USING (
    team_id IN (SELECT id FROM teams WHERE org_id = get_my_org_id())
  );

DROP POLICY IF EXISTS "schedule_events_insert" ON schedule_events;
CREATE POLICY "schedule_events_insert" ON schedule_events
  FOR INSERT WITH CHECK (
    team_id IN (SELECT id FROM teams WHERE org_id = get_my_org_id())
    AND created_by_staff_id = auth.uid()
  );

DROP POLICY IF EXISTS "schedule_events_update" ON schedule_events;
CREATE POLICY "schedule_events_update" ON schedule_events
  FOR UPDATE USING (
    team_id IN (SELECT id FROM teams WHERE org_id = get_my_org_id())
    AND (created_by_staff_id = auth.uid() OR is_master())
  );

DROP POLICY IF EXISTS "schedule_events_delete" ON schedule_events;
CREATE POLICY "schedule_events_delete" ON schedule_events
  FOR DELETE USING (
    team_id IN (SELECT id FROM teams WHERE org_id = get_my_org_id())
    AND is_master()
  );

-- =============================================================
-- ATTENDANCE RECORDS
-- All staff can read; AT and master can write.
-- =============================================================
DROP POLICY IF EXISTS "attendance_select" ON attendance_records;
CREATE POLICY "attendance_select" ON attendance_records
  FOR SELECT USING (
    event_id IN (
      SELECT id FROM schedule_events
      WHERE team_id IN (SELECT id FROM teams WHERE org_id = get_my_org_id())
    )
  );

DROP POLICY IF EXISTS "attendance_insert" ON attendance_records;
CREATE POLICY "attendance_insert" ON attendance_records
  FOR INSERT WITH CHECK (
    event_id IN (
      SELECT id FROM schedule_events
      WHERE team_id IN (SELECT id FROM teams WHERE org_id = get_my_org_id())
    )
    AND (is_master() OR get_my_role() = 'AT')
  );

DROP POLICY IF EXISTS "attendance_update" ON attendance_records;
CREATE POLICY "attendance_update" ON attendance_records
  FOR UPDATE USING (
    event_id IN (
      SELECT id FROM schedule_events
      WHERE team_id IN (SELECT id FROM teams WHERE org_id = get_my_org_id())
    )
    AND (is_master() OR get_my_role() = 'AT')
  );

-- =============================================================
-- CHANNELS
-- All staff can read their team's channels.
-- Master can create/modify channels.
-- =============================================================
DROP POLICY IF EXISTS "channels_select" ON channels;
CREATE POLICY "channels_select" ON channels
  FOR SELECT USING (
    team_id IN (SELECT id FROM teams WHERE org_id = get_my_org_id())
  );

DROP POLICY IF EXISTS "channels_insert" ON channels;
CREATE POLICY "channels_insert" ON channels
  FOR INSERT WITH CHECK (
    team_id IN (SELECT id FROM teams WHERE org_id = get_my_org_id())
    AND is_master()
  );

DROP POLICY IF EXISTS "channels_update" ON channels;
CREATE POLICY "channels_update" ON channels
  FOR UPDATE USING (
    team_id IN (SELECT id FROM teams WHERE org_id = get_my_org_id())
    AND is_master()
  );

-- =============================================================
-- MESSAGES
-- All staff can read/insert messages in their team's channels.
-- Users can only insert with their own staff_id.
-- =============================================================
DROP POLICY IF EXISTS "messages_select" ON messages;
CREATE POLICY "messages_select" ON messages
  FOR SELECT USING (
    channel_id IN (
      SELECT id FROM channels
      WHERE team_id IN (SELECT id FROM teams WHERE org_id = get_my_org_id())
    )
  );

DROP POLICY IF EXISTS "messages_insert" ON messages;
CREATE POLICY "messages_insert" ON messages
  FOR INSERT WITH CHECK (
    channel_id IN (
      SELECT id FROM channels
      WHERE team_id IN (SELECT id FROM teams WHERE org_id = get_my_org_id())
    )
    AND staff_id = auth.uid()
  );

DROP POLICY IF EXISTS "messages_update" ON messages;
CREATE POLICY "messages_update" ON messages
  FOR UPDATE USING (
    channel_id IN (
      SELECT id FROM channels
      WHERE team_id IN (SELECT id FROM teams WHERE org_id = get_my_org_id())
    )
    AND (staff_id = auth.uid() OR is_master())
  );

-- =============================================================
-- AUDIT LOGS
-- All staff can insert audit logs.
-- Only master can read all audit logs; AT/PT/S&C see only their own.
-- =============================================================
DROP POLICY IF EXISTS "audit_logs_select_master" ON audit_logs;
CREATE POLICY "audit_logs_select_master" ON audit_logs
  FOR SELECT USING (
    staff_id IN (SELECT id FROM staff WHERE org_id = get_my_org_id())
    AND (staff_id = auth.uid() OR is_master())
  );

DROP POLICY IF EXISTS "audit_logs_insert" ON audit_logs;
CREATE POLICY "audit_logs_insert" ON audit_logs
  FOR INSERT WITH CHECK (
    staff_id = auth.uid()
    AND staff_id IN (SELECT id FROM staff WHERE org_id = get_my_org_id())
  );

-- =============================================================
-- ESCALATION RECORDS
-- All staff in org can read escalations concerning their athletes.
-- AT and master can create escalations.
-- =============================================================
DROP POLICY IF EXISTS "escalation_select" ON escalation_records;
CREATE POLICY "escalation_select" ON escalation_records
  FOR SELECT USING (
    athlete_id IN (SELECT id FROM athletes WHERE org_id = get_my_org_id())
  );

DROP POLICY IF EXISTS "escalation_insert" ON escalation_records;
CREATE POLICY "escalation_insert" ON escalation_records
  FOR INSERT WITH CHECK (
    athlete_id IN (SELECT id FROM athletes WHERE org_id = get_my_org_id())
    AND from_staff_id = auth.uid()
    AND (is_master() OR get_my_role() IN ('AT', 'PT'))
  );

DROP POLICY IF EXISTS "escalation_update" ON escalation_records;
CREATE POLICY "escalation_update" ON escalation_records
  FOR UPDATE USING (
    athlete_id IN (SELECT id FROM athletes WHERE org_id = get_my_org_id())
  );

-- =============================================================
-- RTP INJURY NODES
-- Public read for all authenticated staff.
-- =============================================================
DROP POLICY IF EXISTS "rtp_nodes_select" ON rtp_injury_nodes;
CREATE POLICY "rtp_nodes_select" ON rtp_injury_nodes
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "rtp_nodes_write" ON rtp_injury_nodes;
CREATE POLICY "rtp_nodes_write" ON rtp_injury_nodes
  FOR ALL USING (is_master());

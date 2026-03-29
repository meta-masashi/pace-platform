-- =============================================================
-- PACE Platform — 001_initial_schema.sql
-- Full PostgreSQL schema matching src/types/index.ts exactly
-- Idempotent: uses IF NOT EXISTS / CREATE OR REPLACE throughout
-- =============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";  -- uuid_generate_v4() fallback

-- =============================================================
-- ENUMS
-- =============================================================

DO $$ BEGIN
  CREATE TYPE role_type AS ENUM ('master', 'AT', 'PT', 'S&C');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE priority_type AS ENUM ('critical', 'watchlist', 'normal');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE sex_type AS ENUM ('male', 'female');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE lock_type AS ENUM ('hard', 'soft');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE assessment_type AS ENUM ('F1_Acute', 'F2_Chronic', 'F3_Performance');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE assessment_status_type AS ENUM ('in_progress', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE answer_value_type AS ENUM ('yes', 'no', 'unclear');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE rehab_phase AS ENUM ('1', '2', '3', '4');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE rehab_status_type AS ENUM ('active', 'completed', 'on_hold');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE workout_type AS ENUM ('individual', 'team');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE event_type AS ENUM ('practice', 'match', 'recovery', 'meeting', 'off');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE attendance_status AS ENUM ('present', 'absent', 'late', 'injured_out');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE escalation_severity AS ENUM ('urgent', 'high', 'routine');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE audit_action_type AS ENUM (
    'assessment_completed',
    'menu_approved',
    'soap_saved',
    'lock_issued',
    'escalation_sent',
    'differential_viewed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE plan_type AS ENUM ('pro', 'standard');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================
-- TABLE: organizations
-- =============================================================
CREATE TABLE IF NOT EXISTS organizations (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL,
  plan         plan_type   NOT NULL DEFAULT 'pro',
  athlete_limit INT        NOT NULL DEFAULT 30,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE organizations IS 'Multi-tenant root. Each sports club/team owner is one org.';
COMMENT ON COLUMN organizations.plan IS 'Subscription tier: pro or standard';
COMMENT ON COLUMN organizations.athlete_limit IS 'Maximum number of athletes allowed per plan';

-- =============================================================
-- TABLE: teams
-- =============================================================
CREATE TABLE IF NOT EXISTS teams (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE teams IS 'A group of athletes belonging to one organization.';

CREATE INDEX IF NOT EXISTS idx_teams_org_id ON teams(org_id);

-- =============================================================
-- TABLE: staff
-- =============================================================
-- Note: id is linked to auth.users; seed data may use text-based IDs
-- For development, staff.id does NOT necessarily reference auth.users
-- so we keep it as UUID primary key (not FK) to allow seed inserts.
CREATE TABLE IF NOT EXISTS staff (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  team_id     UUID        REFERENCES teams(id) ON DELETE SET NULL,
  name        TEXT        NOT NULL,
  email       TEXT        NOT NULL,
  role        role_type   NOT NULL,
  is_leader   BOOLEAN     NOT NULL DEFAULT false,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE staff IS 'Athletic trainers, PTs, S&C coaches, and master users per org.';
COMMENT ON COLUMN staff.role IS 'master=全権限, AT=アスレティックトレーナー, PT=理学療法士, S&C=ストレングスコーチ';

CREATE INDEX IF NOT EXISTS idx_staff_org_id  ON staff(org_id);
CREATE INDEX IF NOT EXISTS idx_staff_team_id ON staff(team_id);
CREATE INDEX IF NOT EXISTS idx_staff_role    ON staff(role);

-- =============================================================
-- TABLE: athletes
-- =============================================================
CREATE TABLE IF NOT EXISTS athletes (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  team_id       UUID          REFERENCES teams(id) ON DELETE SET NULL,
  name          TEXT          NOT NULL,
  position      TEXT          NOT NULL DEFAULT '',
  number        INT,
  age           INT,
  sex           sex_type,
  profile_photo TEXT,
  -- Computed / cached fields (updated via daily_metrics trigger)
  status        priority_type NOT NULL DEFAULT 'normal',
  hp            INT           NOT NULL DEFAULT 80 CHECK (hp BETWEEN 0 AND 100),
  nrs           NUMERIC(4,1)  NOT NULL DEFAULT 0  CHECK (nrs BETWEEN 0 AND 10),
  hrv           NUMERIC(6,2)  NOT NULL DEFAULT 60 CHECK (hrv > 0),
  acwr          NUMERIC(5,3)  NOT NULL DEFAULT 1  CHECK (acwr > 0),
  last_updated  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  is_active     BOOLEAN       NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

COMMENT ON TABLE athletes IS 'Core athlete profiles. Cached hp/nrs/hrv/acwr come from latest daily_metrics.';
COMMENT ON COLUMN athletes.hp   IS 'Composite health score 0-100, computed from daily metrics';
COMMENT ON COLUMN athletes.nrs  IS 'Latest pain score 0-10 (Numeric Rating Scale)';
COMMENT ON COLUMN athletes.hrv  IS 'Latest HRV in milliseconds';
COMMENT ON COLUMN athletes.acwr IS 'Acute:Chronic Workload Ratio';

CREATE INDEX IF NOT EXISTS idx_athletes_org_id  ON athletes(org_id);
CREATE INDEX IF NOT EXISTS idx_athletes_team_id ON athletes(team_id);
CREATE INDEX IF NOT EXISTS idx_athletes_status  ON athletes(status);

-- =============================================================
-- TABLE: daily_metrics
-- =============================================================
CREATE TABLE IF NOT EXISTS daily_metrics (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id           UUID         NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  date                 DATE         NOT NULL DEFAULT CURRENT_DATE,
  nrs                  NUMERIC(4,1) NOT NULL DEFAULT 0 CHECK (nrs >= 0 AND nrs <= 10),
  hrv                  NUMERIC(6,2) NOT NULL CHECK (hrv > 0),
  acwr                 NUMERIC(5,3) NOT NULL CHECK (acwr > 0),
  sleep_score          INT          CHECK (sleep_score BETWEEN 1 AND 5),
  subjective_condition INT          CHECK (subjective_condition BETWEEN 1 AND 5),
  hp_computed          INT          CHECK (hp_computed BETWEEN 0 AND 100),
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE(athlete_id, date)
);

COMMENT ON TABLE daily_metrics IS 'Daily check-in data submitted by/for each athlete.';
COMMENT ON COLUMN daily_metrics.nrs  IS 'Pain score 0-10';
COMMENT ON COLUMN daily_metrics.hrv  IS 'Heart Rate Variability in ms (must be > 0)';
COMMENT ON COLUMN daily_metrics.acwr IS 'Acute:Chronic Workload Ratio (must be > 0)';
COMMENT ON COLUMN daily_metrics.sleep_score IS '1-5 subjective sleep quality';
COMMENT ON COLUMN daily_metrics.subjective_condition IS '1-5 self-reported condition';

CREATE INDEX IF NOT EXISTS idx_daily_metrics_athlete_date ON daily_metrics(athlete_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_date         ON daily_metrics(date DESC);

-- =============================================================
-- TABLE: assessment_nodes
-- =============================================================
CREATE TABLE IF NOT EXISTS assessment_nodes (
  node_id               TEXT        PRIMARY KEY,
  file_type             assessment_type NOT NULL,
  phase                 TEXT        NOT NULL,
  category              TEXT        NOT NULL DEFAULT '',
  question_text         TEXT        NOT NULL,
  target_axis           TEXT        NOT NULL DEFAULT '',
  lr_yes                NUMERIC(8,4) NOT NULL DEFAULT 1,
  lr_no                 NUMERIC(8,4) NOT NULL DEFAULT 1,
  kappa                 NUMERIC(5,3),
  routing_rules         JSONB       NOT NULL DEFAULT '[]'::jsonb,
  prescription_tags     JSONB       NOT NULL DEFAULT '[]'::jsonb,
  contraindication_tags JSONB       NOT NULL DEFAULT '[]'::jsonb,
  time_decay_lambda     NUMERIC(8,5) NOT NULL DEFAULT 0,
  information_gain      NUMERIC(5,4),
  sort_order            INT         NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE assessment_nodes IS 'CAT question tree nodes for Bayesian clinical assessment engine.';
COMMENT ON COLUMN assessment_nodes.lr_yes IS 'Likelihood ratio when answer is YES';
COMMENT ON COLUMN assessment_nodes.lr_no  IS 'Likelihood ratio when answer is NO';
COMMENT ON COLUMN assessment_nodes.kappa  IS 'Inter-rater reliability (Cohen kappa)';
COMMENT ON COLUMN assessment_nodes.routing_rules IS 'Array of node_ids to consider next';
COMMENT ON COLUMN assessment_nodes.contraindication_tags IS 'Activity restriction tags triggered if YES';

CREATE INDEX IF NOT EXISTS idx_assessment_nodes_file_type    ON assessment_nodes(file_type);
CREATE INDEX IF NOT EXISTS idx_assessment_nodes_phase        ON assessment_nodes(phase);
CREATE INDEX IF NOT EXISTS idx_assessment_nodes_target_axis  ON assessment_nodes(target_axis);
CREATE INDEX IF NOT EXISTS idx_assessment_nodes_file_phase_axis ON assessment_nodes(file_type, phase, target_axis);

-- =============================================================
-- TABLE: assessments
-- =============================================================
CREATE TABLE IF NOT EXISTS assessments (
  id                UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id        UUID                    NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  staff_id          UUID                    NOT NULL REFERENCES staff(id)    ON DELETE RESTRICT,
  assessment_type   assessment_type         NOT NULL,
  status            assessment_status_type  NOT NULL DEFAULT 'in_progress',
  responses         JSONB                   NOT NULL DEFAULT '[]'::jsonb,
  primary_diagnosis JSONB,  -- DiagnosisResult {diagnosis_code, label, probability}
  differentials     JSONB                   NOT NULL DEFAULT '[]'::jsonb,
  started_at        TIMESTAMPTZ             NOT NULL DEFAULT now(),
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ             NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ             NOT NULL DEFAULT now()
);

COMMENT ON TABLE assessments IS 'Clinical assessment sessions. responses is JSONB array of AssessmentResponse.';
COMMENT ON COLUMN assessments.responses         IS '[{node_id, answer, timestamp}]';
COMMENT ON COLUMN assessments.primary_diagnosis IS '{diagnosis_code, label, probability}';
COMMENT ON COLUMN assessments.differentials     IS '[{diagnosis_code, label, probability}]';

CREATE INDEX IF NOT EXISTS idx_assessments_athlete_id ON assessments(athlete_id);
CREATE INDEX IF NOT EXISTS idx_assessments_staff_id   ON assessments(staff_id);
CREATE INDEX IF NOT EXISTS idx_assessments_status     ON assessments(status);
CREATE INDEX IF NOT EXISTS idx_assessments_started_at ON assessments(started_at DESC);

-- =============================================================
-- TABLE: assessment_sessions (in-memory CAT engine store)
-- =============================================================
CREATE TABLE IF NOT EXISTS assessment_sessions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID        NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  session_data  JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE assessment_sessions IS 'Ephemeral CAT session state (prior probabilities, next node queue).';

CREATE INDEX IF NOT EXISTS idx_assessment_sessions_assessment_id ON assessment_sessions(assessment_id);

-- =============================================================
-- TABLE: athlete_locks
-- =============================================================
CREATE TABLE IF NOT EXISTS athlete_locks (
  id               UUID       PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id       UUID       NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  set_by_staff_id  UUID       NOT NULL REFERENCES staff(id)    ON DELETE RESTRICT,
  lock_type        lock_type  NOT NULL,
  tag              TEXT       NOT NULL,
  reason           TEXT       NOT NULL DEFAULT '',
  set_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at       TIMESTAMPTZ,
  is_active        BOOLEAN    NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE athlete_locks IS 'Hard/soft activity restriction locks set by qualified staff.';
COMMENT ON COLUMN athlete_locks.lock_type IS 'hard=絶対禁止, soft=条件付き制限';
COMMENT ON COLUMN athlete_locks.tag       IS 'Activity tag e.g. ankle_impact, bilateral_jump';

CREATE INDEX IF NOT EXISTS idx_athlete_locks_athlete_id ON athlete_locks(athlete_id);
CREATE INDEX IF NOT EXISTS idx_athlete_locks_active     ON athlete_locks(athlete_id, is_active);

-- =============================================================
-- TABLE: rehab_programs
-- =============================================================
CREATE TABLE IF NOT EXISTS rehab_programs (
  id                 UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id         UUID               NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  diagnosis_code     TEXT               NOT NULL DEFAULT '',
  diagnosis_label    TEXT               NOT NULL,
  current_phase      INT                NOT NULL DEFAULT 1 CHECK (current_phase BETWEEN 1 AND 4),
  start_date         DATE               NOT NULL DEFAULT CURRENT_DATE,
  estimated_rtp_date DATE,
  status             rehab_status_type  NOT NULL DEFAULT 'active',
  rom                NUMERIC(6,2),
  swelling_grade     INT                CHECK (swelling_grade BETWEEN 0 AND 3),
  lsi_percent        NUMERIC(5,2),
  created_at         TIMESTAMPTZ        NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ        NOT NULL DEFAULT now()
);

COMMENT ON TABLE rehab_programs IS 'Return-to-play rehabilitation program per athlete per injury.';
COMMENT ON COLUMN rehab_programs.lsi_percent IS 'Limb Symmetry Index percentage (target ≥90%)';

CREATE INDEX IF NOT EXISTS idx_rehab_programs_athlete_id ON rehab_programs(athlete_id);
CREATE INDEX IF NOT EXISTS idx_rehab_programs_status     ON rehab_programs(status);

-- =============================================================
-- TABLE: rehab_gates
-- =============================================================
CREATE TABLE IF NOT EXISTS rehab_gates (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id           UUID        NOT NULL REFERENCES rehab_programs(id) ON DELETE CASCADE,
  phase                INT         NOT NULL CHECK (phase BETWEEN 1 AND 4),
  gate_criteria        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  gate_met_at          TIMESTAMPTZ,
  verified_by_staff_id UUID        REFERENCES staff(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE rehab_gates IS 'Phase progression criteria gates for rehab programs.';
COMMENT ON COLUMN rehab_gates.gate_criteria IS 'Key-value criteria e.g. {rom_degrees: 90, nrs_max: 2}';

CREATE INDEX IF NOT EXISTS idx_rehab_gates_program_id ON rehab_gates(program_id);

-- =============================================================
-- TABLE: exercises
-- =============================================================
CREATE TABLE IF NOT EXISTS exercises (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  category              TEXT        NOT NULL,
  phase                 TEXT        NOT NULL,  -- RehabPhase 1-4 or 'rehab'
  name_en               TEXT        NOT NULL DEFAULT '',
  name_ja               TEXT        NOT NULL,
  target_axis           TEXT        NOT NULL DEFAULT '',
  sets                  INT         NOT NULL DEFAULT 1,
  reps                  INT,
  time_sec              INT,
  percent_1rm           NUMERIC(5,2),
  rpe                   NUMERIC(4,1) CHECK (rpe BETWEEN 6 AND 20),
  cues                  TEXT        NOT NULL DEFAULT '',
  progressions          TEXT        NOT NULL DEFAULT '',
  contraindication_tags JSONB       NOT NULL DEFAULT '[]'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE exercises IS 'Exercise library imported from Excel master sheet.';
COMMENT ON COLUMN exercises.rpe IS 'Rating of Perceived Exertion 6-20 (Borg scale)';

CREATE INDEX IF NOT EXISTS idx_exercises_category ON exercises(category);
CREATE INDEX IF NOT EXISTS idx_exercises_phase    ON exercises(phase);

-- =============================================================
-- TABLE: workouts
-- =============================================================
CREATE TABLE IF NOT EXISTS workouts (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id           UUID         REFERENCES athletes(id) ON DELETE CASCADE,
  team_id              UUID         REFERENCES teams(id)    ON DELETE CASCADE,
  type                 workout_type NOT NULL,
  generated_by_ai      BOOLEAN      NOT NULL DEFAULT false,
  generated_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  approved_by_staff_id UUID         REFERENCES staff(id) ON DELETE SET NULL,
  approved_at          TIMESTAMPTZ,
  distributed_at       TIMESTAMPTZ,
  menu                 JSONB        NOT NULL DEFAULT '[]'::jsonb,
  total_duration_min   INT          NOT NULL DEFAULT 0,
  notes                TEXT,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE workouts IS 'AI-generated or manual workout menus for athletes or teams.';
COMMENT ON COLUMN workouts.menu IS '[{exercise_id, exercise_name, sets, reps_or_time, unit, rpe, cues, reason, block}]';

CREATE INDEX IF NOT EXISTS idx_workouts_athlete_id ON workouts(athlete_id);
CREATE INDEX IF NOT EXISTS idx_workouts_team_id    ON workouts(team_id);
CREATE INDEX IF NOT EXISTS idx_workouts_generated_at ON workouts(generated_at DESC);

-- =============================================================
-- TABLE: soap_notes
-- =============================================================
CREATE TABLE IF NOT EXISTS soap_notes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id  UUID        NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  staff_id    UUID        NOT NULL REFERENCES staff(id)    ON DELETE RESTRICT,
  s_text      TEXT        NOT NULL DEFAULT '',
  o_text      TEXT        NOT NULL DEFAULT '',
  a_text      TEXT        NOT NULL DEFAULT '',
  p_text      TEXT        NOT NULL DEFAULT '',
  ai_assisted BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE soap_notes IS 'Clinical SOAP notes (Subjective/Objective/Assessment/Plan).';
COMMENT ON COLUMN soap_notes.ai_assisted IS 'True if AI text generation was used in drafting';

CREATE INDEX IF NOT EXISTS idx_soap_notes_athlete_id  ON soap_notes(athlete_id);
CREATE INDEX IF NOT EXISTS idx_soap_notes_staff_id    ON soap_notes(staff_id);
CREATE INDEX IF NOT EXISTS idx_soap_notes_created_at  ON soap_notes(created_at DESC);

-- =============================================================
-- TABLE: schedule_events
-- =============================================================
CREATE TABLE IF NOT EXISTS schedule_events (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id               UUID        NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  title                 TEXT        NOT NULL,
  event_type            event_type  NOT NULL,
  date                  DATE        NOT NULL,
  start_time            TEXT        NOT NULL,  -- HH:MM format
  end_time              TEXT        NOT NULL,  -- HH:MM format
  location              TEXT,
  opponent              TEXT,
  notes                 TEXT,
  workout_id            UUID        REFERENCES workouts(id) ON DELETE SET NULL,
  created_by_staff_id   UUID        NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  estimated_rpe         NUMERIC(4,1) CHECK (estimated_rpe BETWEEN 6 AND 20),
  estimated_duration_min INT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE schedule_events IS 'Team schedule: practices, matches, recovery, meetings.';

CREATE INDEX IF NOT EXISTS idx_schedule_events_team_id ON schedule_events(team_id);
CREATE INDEX IF NOT EXISTS idx_schedule_events_date    ON schedule_events(date);
CREATE INDEX IF NOT EXISTS idx_schedule_events_team_date ON schedule_events(team_id, date);

-- =============================================================
-- TABLE: attendance_records
-- =============================================================
CREATE TABLE IF NOT EXISTS attendance_records (
  id            UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID              NOT NULL REFERENCES schedule_events(id) ON DELETE CASCADE,
  athlete_id    UUID              NOT NULL REFERENCES athletes(id)        ON DELETE CASCADE,
  athlete_name  TEXT              NOT NULL DEFAULT '',
  status        attendance_status NOT NULL,
  rpe_reported  NUMERIC(4,1)      CHECK (rpe_reported BETWEEN 6 AND 20),
  notes         TEXT,
  created_at    TIMESTAMPTZ       NOT NULL DEFAULT now(),
  UNIQUE(event_id, athlete_id)
);

COMMENT ON TABLE attendance_records IS 'Athlete attendance and session RPE per schedule event.';

CREATE INDEX IF NOT EXISTS idx_attendance_event_id   ON attendance_records(event_id);
CREATE INDEX IF NOT EXISTS idx_attendance_athlete_id ON attendance_records(athlete_id);
CREATE INDEX IF NOT EXISTS idx_attendance_status     ON attendance_records(status);

-- =============================================================
-- TABLE: channels
-- =============================================================
CREATE TABLE IF NOT EXISTS channels (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id      UUID        NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  member_count INT         NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(team_id, name)
);

COMMENT ON TABLE channels IS 'Team messaging channels (medical, team, s-and-c, rehab, etc.).';

CREATE INDEX IF NOT EXISTS idx_channels_team_id ON channels(team_id);

-- =============================================================
-- TABLE: messages
-- =============================================================
CREATE TABLE IF NOT EXISTS messages (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id      UUID        NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  staff_id        UUID        NOT NULL REFERENCES staff(id)    ON DELETE RESTRICT,
  content         TEXT        NOT NULL,
  linked_soap_id  UUID        REFERENCES soap_notes(id) ON DELETE SET NULL,
  cds_disclaimer  BOOLEAN     NOT NULL DEFAULT false,
  read_by         JSONB       NOT NULL DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE messages IS 'Staff channel messages with optional SOAP link and read receipts.';
COMMENT ON COLUMN messages.read_by IS '[{staff_id, staff_name, read_at}]';

CREATE INDEX IF NOT EXISTS idx_messages_channel_id  ON messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_messages_staff_id    ON messages(staff_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at  ON messages(channel_id, created_at ASC);

-- =============================================================
-- TABLE: audit_logs
-- =============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id               UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp        TIMESTAMPTZ       NOT NULL DEFAULT now(),
  staff_id         UUID              NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  staff_name       TEXT              NOT NULL DEFAULT '',
  staff_role       role_type         NOT NULL,
  action_type      audit_action_type NOT NULL,
  athlete_id       UUID              REFERENCES athletes(id) ON DELETE SET NULL,
  athlete_name     TEXT,
  ai_assisted      BOOLEAN           NOT NULL DEFAULT false,
  disclaimer_shown BOOLEAN           NOT NULL DEFAULT false,
  cds_version      TEXT              NOT NULL DEFAULT '',
  session_id       TEXT,
  notes            TEXT,
  created_at       TIMESTAMPTZ       NOT NULL DEFAULT now()
);

COMMENT ON TABLE audit_logs IS 'Immutable CDS audit trail for all AI-assisted clinical decisions.';
COMMENT ON COLUMN audit_logs.disclaimer_shown IS 'True if the user acknowledged the AI disclaimer';
COMMENT ON COLUMN audit_logs.cds_version      IS 'PACE-CDS version string for traceability';

CREATE INDEX IF NOT EXISTS idx_audit_logs_staff_id   ON audit_logs(staff_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_athlete_id ON audit_logs(athlete_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp  ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action     ON audit_logs(action_type);

-- =============================================================
-- TABLE: escalation_records
-- =============================================================
CREATE TABLE IF NOT EXISTS escalation_records (
  id                    UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  from_staff_id         UUID                NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  from_staff_name       TEXT                NOT NULL DEFAULT '',
  from_role             role_type           NOT NULL,
  to_roles              JSONB               NOT NULL DEFAULT '[]'::jsonb,
  athlete_id            UUID                NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  athlete_name          TEXT                NOT NULL DEFAULT '',
  severity              escalation_severity NOT NULL,
  message               TEXT                NOT NULL,
  audit_log_id          UUID                REFERENCES audit_logs(id) ON DELETE SET NULL,
  acknowledged_at       TIMESTAMPTZ,
  acknowledged_by_name  TEXT,
  created_at            TIMESTAMPTZ         NOT NULL DEFAULT now()
);

COMMENT ON TABLE escalation_records IS 'Clinical escalations sent between staff roles.';
COMMENT ON COLUMN escalation_records.to_roles IS 'Array of role_type strings e.g. ["PT","master"]';

CREATE INDEX IF NOT EXISTS idx_escalation_athlete_id  ON escalation_records(athlete_id);
CREATE INDEX IF NOT EXISTS idx_escalation_from_staff  ON escalation_records(from_staff_id);
CREATE INDEX IF NOT EXISTS idx_escalation_severity    ON escalation_records(severity);
CREATE INDEX IF NOT EXISTS idx_escalation_created_at  ON escalation_records(created_at DESC);

-- =============================================================
-- TABLE: rtp_injury_nodes
-- =============================================================
CREATE TABLE IF NOT EXISTS rtp_injury_nodes (
  node_id      TEXT        PRIMARY KEY,
  injury_type  TEXT        NOT NULL,
  phase        INT         NOT NULL CHECK (phase BETWEEN 1 AND 4),
  gate_criteria JSONB      NOT NULL DEFAULT '{}'::jsonb,
  lsi_target   NUMERIC(5,2),
  test_battery JSONB       NOT NULL DEFAULT '[]'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE rtp_injury_nodes IS 'Return-to-play criteria nodes per injury type and phase.';

-- =============================================================
-- TRIAGE VIEW
-- Returns computed triage list from latest daily_metrics + athletes
-- =============================================================
CREATE OR REPLACE VIEW triage_list AS
WITH latest_metrics AS (
  SELECT DISTINCT ON (athlete_id)
    athlete_id,
    date,
    nrs,
    hrv,
    acwr,
    sleep_score,
    subjective_condition,
    hp_computed
  FROM daily_metrics
  ORDER BY athlete_id, date DESC
),
trigger_flags AS (
  SELECT
    a.id          AS athlete_id,
    a.name        AS athlete_name,
    a.position,
    a.status      AS priority,
    -- Computed triggers based on threshold rules
    ARRAY_REMOVE(ARRAY[
      CASE WHEN COALESCE(m.nrs,  a.nrs)  >= 7     THEN 'nrs_spike'                          END,
      CASE WHEN COALESCE(m.hrv,  a.hrv)  < 50     THEN 'hrv_drop'                           END,
      CASE WHEN COALESCE(m.acwr, a.acwr) > 1.5    THEN 'acwr_exceeded'                      END,
      CASE WHEN COALESCE(m.subjective_condition, 3) <= 2
               AND COALESCE(m.nrs, a.nrs) < 4     THEN 'subjective_objective_discrepancy'   END,
      CASE WHEN ABS(COALESCE(m.hrv, a.hrv) - a.hrv) > 10
                                                   THEN 'baseline_deviation'                 END
    ], NULL) AS triggers,
    COALESCE(m.nrs,        a.nrs)        AS nrs,
    COALESCE(m.hrv,        a.hrv)        AS hrv,
    COALESCE(m.acwr,       a.acwr)       AS acwr,
    COALESCE(m.date::TEXT, a.last_updated::TEXT) AS last_updated
  FROM athletes a
  LEFT JOIN latest_metrics m ON m.athlete_id = a.id
  WHERE a.is_active = true
)
SELECT
  athlete_id,
  athlete_name,
  position,
  priority,
  COALESCE(triggers, ARRAY[]::TEXT[]) AS triggers,
  nrs,
  hrv,
  acwr,
  NULL::TEXT    AS pace_inference_label,
  NULL::NUMERIC AS pace_inference_confidence,
  last_updated
FROM trigger_flags
ORDER BY
  CASE priority
    WHEN 'critical'  THEN 1
    WHEN 'watchlist' THEN 2
    WHEN 'normal'    THEN 3
  END,
  nrs DESC;

COMMENT ON VIEW triage_list IS 'Computed triage view: athletes sorted by priority with computed trigger flags.';

-- =============================================================
-- UPDATED_AT trigger function
-- =============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to relevant tables
DO $$ BEGIN
  CREATE TRIGGER trg_staff_updated_at
    BEFORE UPDATE ON staff
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_athletes_updated_at
    BEFORE UPDATE ON athletes
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_daily_metrics_updated_at
    BEFORE UPDATE ON daily_metrics
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_assessments_updated_at
    BEFORE UPDATE ON assessments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_rehab_programs_updated_at
    BEFORE UPDATE ON rehab_programs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_soap_notes_updated_at
    BEFORE UPDATE ON soap_notes
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_schedule_events_updated_at
    BEFORE UPDATE ON schedule_events
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

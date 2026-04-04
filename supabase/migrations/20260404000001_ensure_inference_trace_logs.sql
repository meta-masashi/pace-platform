-- Migration: Ensure inference_trace_logs table and wellness decline view exist
-- inference_trace_logs was originally created manually (20230101000021).
-- This migration creates it IF NOT EXISTS to guarantee it's present,
-- then creates the v_wellness_consecutive_decline view that depends on it.

-- ============================================================
-- 1. inference_trace_logs (idempotent — IF NOT EXISTS)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.inference_trace_logs (
  trace_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  athlete_id UUID NOT NULL REFERENCES public.athletes(id) ON DELETE RESTRICT,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  staff_id UUID REFERENCES public.staff(id),
  timestamp_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  pipeline_version VARCHAR(10) NOT NULL DEFAULT 'v6',
  inference_snapshot JSONB NOT NULL,
  decision VARCHAR(10) NOT NULL CHECK (decision IN ('RED', 'ORANGE', 'YELLOW', 'GREEN')),
  priority VARCHAR(30) NOT NULL CHECK (priority IN ('P1_SAFETY', 'P2_MECHANICAL_RISK', 'P3_DECOUPLING', 'P4_GAS_EXHAUSTION', 'P5_NORMAL')),
  decision_reason TEXT NOT NULL DEFAULT '',
  execution_time_ms INTEGER,
  data_quality_score FLOAT CHECK (data_quality_score >= 0 AND data_quality_score <= 1),
  overrides_applied TEXT[],
  acknowledged_by UUID REFERENCES public.staff(id),
  acknowledged_at TIMESTAMPTZ,
  acknowledge_action VARCHAR(20) CHECK (acknowledge_action IS NULL OR acknowledge_action IN ('approved', 'modified', 'rejected', 'override')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- optional columns added later (ignore if already exist)
  athlete_name TEXT,
  pipeline_version_full VARCHAR(30)
);

-- ============================================================
-- 2. Indexes (idempotent)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_trace_logs_athlete_date
  ON public.inference_trace_logs (athlete_id, timestamp_utc DESC);

CREATE INDEX IF NOT EXISTS idx_trace_logs_org_priority
  ON public.inference_trace_logs (org_id, priority, timestamp_utc DESC);

CREATE INDEX IF NOT EXISTS idx_trace_logs_decision
  ON public.inference_trace_logs (decision) WHERE decision IN ('RED', 'ORANGE');

CREATE INDEX IF NOT EXISTS idx_trace_logs_unacknowledged
  ON public.inference_trace_logs (org_id, priority)
  WHERE acknowledged_by IS NULL AND priority IN ('P1_SAFETY', 'P2_MECHANICAL_RISK');

-- ============================================================
-- 3. RLS (idempotent)
-- ============================================================

ALTER TABLE public.inference_trace_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'inference_trace_logs'
    AND policyname = 'trace_logs_insert_own_org'
  ) THEN
    CREATE POLICY "trace_logs_insert_own_org" ON public.inference_trace_logs
      FOR INSERT
      WITH CHECK (org_id = (SELECT s.org_id FROM public.staff s WHERE s.id = auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'inference_trace_logs'
    AND policyname = 'trace_logs_select_own_org'
  ) THEN
    CREATE POLICY "trace_logs_select_own_org" ON public.inference_trace_logs
      FOR SELECT
      USING (org_id = (SELECT s.org_id FROM public.staff s WHERE s.id = auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'inference_trace_logs'
    AND policyname = 'trace_logs_update_acknowledge'
  ) THEN
    CREATE POLICY "trace_logs_update_acknowledge" ON public.inference_trace_logs
      FOR UPDATE
      USING (org_id = (SELECT s.org_id FROM public.staff s WHERE s.id = auth.uid()))
      WITH CHECK (org_id = (SELECT s.org_id FROM public.staff s WHERE s.id = auth.uid()));
  END IF;
END $$;

-- ============================================================
-- 4. v_wellness_consecutive_decline view
-- ============================================================

CREATE OR REPLACE VIEW v_wellness_consecutive_decline AS
WITH trace_data AS (
  SELECT
    athlete_id,
    (timestamp_utc::date) AS trace_date,
    inference_snapshot
  FROM inference_trace_logs
  WHERE pipeline_version = 'v6'
),
daily_decline AS (
  SELECT
    athlete_id,
    trace_date,
    (SELECT COUNT(*)
     FROM jsonb_each_text(
       (inference_snapshot->'calculatedMetrics'->'zScores')::jsonb
     ) kv
     WHERE kv.value::numeric <= -1.5
    )::int AS severe_decline_count
  FROM trace_data
  WHERE inference_snapshot->'calculatedMetrics'->'zScores' IS NOT NULL
),
with_streak AS (
  SELECT
    athlete_id,
    trace_date,
    severe_decline_count,
    trace_date - (ROW_NUMBER() OVER (
      PARTITION BY athlete_id
      ORDER BY trace_date
    ))::int AS streak_group
  FROM daily_decline
  WHERE severe_decline_count >= 3
)
SELECT
  athlete_id,
  trace_date,
  severe_decline_count,
  COUNT(*) OVER (
    PARTITION BY athlete_id, streak_group
  )::int AS consecutive_bad_days
FROM with_streak
ORDER BY athlete_id, trace_date DESC;

-- ============================================================
-- Migration: 20260329_billing_webhook_alias
-- DB schema fixes applied 2026-03-29
--
-- 1. daily_metrics — add computed/derived columns
-- 2. athlete_alerts — create VIEW combining triage + fatigue_alerts
-- 3. risk_prevention_logs — create table for hard/soft lock logs
-- 4. Backfill org_id / team_id on daily_metrics
-- ============================================================

-- ------------------------------------------------------------
-- 1. daily_metrics: add missing columns
-- ------------------------------------------------------------

ALTER TABLE public.daily_metrics
  ADD COLUMN IF NOT EXISTS conditioning_score  NUMERIC,
  ADD COLUMN IF NOT EXISTS fitness_ewma        NUMERIC,
  ADD COLUMN IF NOT EXISTS fatigue_ewma        NUMERIC,
  ADD COLUMN IF NOT EXISTS hrv_baseline        NUMERIC,
  ADD COLUMN IF NOT EXISTS rpe                 NUMERIC,
  ADD COLUMN IF NOT EXISTS training_duration_min INTEGER,
  ADD COLUMN IF NOT EXISTS fatigue_subjective  INTEGER
    CONSTRAINT daily_metrics_fatigue_subjective_check CHECK (fatigue_subjective BETWEEN 1 AND 10),
  ADD COLUMN IF NOT EXISTS hard_lock           BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS soft_lock           BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS org_id              UUID REFERENCES public.organizations(id),
  ADD COLUMN IF NOT EXISTS team_id             UUID REFERENCES public.teams(id);

-- Backfill org_id + team_id from athletes table
UPDATE public.daily_metrics dm
SET
  org_id  = a.org_id,
  team_id = a.team_id
FROM public.athletes a
WHERE a.id = dm.athlete_id
  AND (dm.org_id IS NULL OR dm.team_id IS NULL);

-- Set hard_lock for NRS >= 7
UPDATE public.daily_metrics
SET hard_lock = true
WHERE nrs >= 7
  AND hard_lock = false;

-- Set soft_lock for NRS 5-6 or ACWR > 1.3 (not already hard_locked)
UPDATE public.daily_metrics
SET soft_lock = true
WHERE (nrs >= 5 OR acwr > 1.3)
  AND hard_lock = false
  AND soft_lock = false;

-- ------------------------------------------------------------
-- 2. athlete_alerts VIEW
-- ------------------------------------------------------------

CREATE OR REPLACE VIEW public.athlete_alerts AS
  -- triage alerts
  SELECT
    t.id,
    t.athlete_id,
    a.name          AS athlete_name,
    a.org_id,
    a.team_id,
    t.trigger_type  AS alert_type,
    t.severity,
    t.metric_value,
    t.threshold_value,
    NULL::TEXT      AS alert_status,
    t.created_at,
    t.created_at    AS updated_at
  FROM public.triage t
  JOIN public.athletes a ON a.id = t.athlete_id

  UNION ALL

  -- fatigue_alerts
  SELECT
    fa.id,
    fa.athlete_id,
    a.name          AS athlete_name,
    a.org_id,
    a.team_id,
    'fatigue'       AS alert_type,
    fa.predicted_fatigue_state AS severity,
    NULL::NUMERIC   AS metric_value,
    NULL::NUMERIC   AS threshold_value,
    fa.alert_status,
    fa.created_at,
    fa.created_at   AS updated_at
  FROM public.fatigue_alerts fa
  JOIN public.athletes a ON a.id = fa.athlete_id;

-- ------------------------------------------------------------
-- 3. risk_prevention_logs
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.risk_prevention_logs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID        NOT NULL REFERENCES public.organizations(id),
  team_id       UUID        REFERENCES public.teams(id),
  athlete_id    UUID        NOT NULL REFERENCES public.athletes(id),
  athlete_name  TEXT,
  type          TEXT        NOT NULL CHECK (type IN ('hard_lock','soft_lock','acwr_block','nrs_block')),
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.risk_prevention_logs ENABLE ROW LEVEL SECURITY;

-- Staff can read logs for their own org
CREATE POLICY "risk_prevention_logs: org read" ON public.risk_prevention_logs
  FOR SELECT USING (org_id = get_my_org_id());

-- Only service_role can insert (Edge Functions)
CREATE POLICY "risk_prevention_logs: service insert" ON public.risk_prevention_logs
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

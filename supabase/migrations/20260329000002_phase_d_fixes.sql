-- ============================================================
-- Migration: 20260329_phase_d_fixes
-- Phase D: Staff Dashboard fixes
--
-- 1. athlete_alerts VIEW: add priority / reason / resolved columns
--    that /api/team/dashboard relies on
-- ============================================================

-- Drop and recreate with full column set expected by the dashboard API
DROP VIEW IF EXISTS public.athlete_alerts;

CREATE OR REPLACE VIEW public.athlete_alerts AS

  -- ── triage alerts ────────────────────────────────────────
  SELECT
    t.id,
    t.athlete_id,
    a.name            AS athlete_name,
    a.org_id,
    a.team_id,
    t.trigger_type    AS alert_type,
    t.severity,
    t.metric_value,
    t.threshold_value,
    -- priority: 'critical' if severity is high/critical, else 'watchlist'
    CASE
      WHEN t.severity IN ('critical','high') THEN 'critical'
      ELSE 'watchlist'
    END               AS priority,
    -- reason: human-readable description of the alert
    COALESCE(
      t.trigger_type || ' — ' || t.severity ||
        CASE
          WHEN t.metric_value IS NOT NULL THEN ' (値: ' || ROUND(t.metric_value::numeric, 2)::text || ')'
          ELSE ''
        END,
      t.trigger_type
    )                 AS reason,
    -- resolved: false until explicitly dismissed
    false             AS resolved,
    t.created_at,
    t.created_at    AS updated_at
  FROM public.triage t
  JOIN public.athletes a ON a.id = t.athlete_id

  UNION ALL

  -- ── fatigue_alerts ───────────────────────────────────────
  SELECT
    fa.id,
    fa.athlete_id,
    a.name            AS athlete_name,
    a.org_id,
    a.team_id,
    'fatigue'         AS alert_type,
    fa.predicted_fatigue_state AS severity,
    NULL::NUMERIC     AS metric_value,
    NULL::NUMERIC     AS threshold_value,
    -- priority: 'critical' for high fatigue, 'watchlist' for moderate
    CASE
      WHEN fa.predicted_fatigue_state = 'high' THEN 'critical'
      ELSE 'watchlist'
    END               AS priority,
    '疲労状態: ' || fa.predicted_fatigue_state AS reason,
    -- resolved when alert_status is resolved/dismissed
    CASE
      WHEN fa.alert_status IN ('resolved', 'dismissed') THEN true
      ELSE false
    END               AS resolved,
    fa.created_at,
    fa.created_at   AS updated_at
  FROM public.fatigue_alerts fa
  JOIN public.athletes a ON a.id = fa.athlete_id;

-- Migration: Wellness consecutive decline tracking view
-- Tracks days where 3+ wellness Z-Score items are severely declined (Z <= -1.5)
-- Used by P3 chronic maladaptation detection (REMEDIATION-PLAN-v2 Task 1-3)
-- Note: view is created only if inference_trace_logs exists to avoid dependency errors

DO $$
BEGIN
  IF EXISTS (
    SELECT FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'inference_trace_logs'
  ) THEN
    EXECUTE $view$
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
      ORDER BY athlete_id, trace_date DESC
    $view$;
  END IF;
END $$;

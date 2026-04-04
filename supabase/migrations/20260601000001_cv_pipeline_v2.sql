-- =============================================================================
-- Migration: 20260601_cv_pipeline_v2.sql
-- Phase 3 Sprint 2: video_uploads / cv_jobs カラム追加
-- API ルート (src/app/api/cv/) との整合性修正
-- 注意: video_uploads / cv_jobs テーブルが存在しない場合はスキップ
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- video_uploads: チーム管理・ファイル情報カラムを追加
-- ─────────────────────────────────────────────────────────────────────────────
DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'video_uploads') THEN
    ALTER TABLE video_uploads
      ADD COLUMN IF NOT EXISTS team_id          UUID REFERENCES teams(id) ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS uploaded_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS original_filename TEXT,
      ADD COLUMN IF NOT EXISTS raw_s3_key       TEXT,
      ADD COLUMN IF NOT EXISTS status_v2        TEXT;

    ALTER TABLE video_uploads
      DROP CONSTRAINT IF EXISTS video_uploads_status_check;

    ALTER TABLE video_uploads
      ADD CONSTRAINT video_uploads_status_check
      CHECK (status IN (
        'pending', 'pending_upload', 'uploaded',
        'queued', 'processing', 'completed', 'failed', 'expired'
      ));

    CREATE INDEX IF NOT EXISTS idx_video_uploads_team_id
      ON video_uploads (team_id);
  END IF;
END $outer$;

-- raw_s3_key を s3_key と同期させるトリガー関数（テーブルが無くても関数は作成可能）
CREATE OR REPLACE FUNCTION sync_video_uploads_s3_key()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.raw_s3_key IS NOT NULL AND NEW.s3_key IS DISTINCT FROM NEW.raw_s3_key THEN
    NEW.s3_key := NEW.raw_s3_key;
  END IF;
  IF NEW.s3_key IS NOT NULL AND NEW.raw_s3_key IS DISTINCT FROM NEW.s3_key THEN
    NEW.raw_s3_key := NEW.s3_key;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'video_uploads') THEN
    DROP TRIGGER IF EXISTS trg_sync_video_uploads_s3_key ON video_uploads;
    CREATE TRIGGER trg_sync_video_uploads_s3_key
      BEFORE INSERT OR UPDATE ON video_uploads
      FOR EACH ROW EXECUTE FUNCTION sync_video_uploads_s3_key();
  END IF;
END $outer$;

-- ─────────────────────────────────────────────────────────────────────────────
-- cv_jobs: API 仕様に合わせてカラム追加
-- ─────────────────────────────────────────────────────────────────────────────
DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cv_jobs') THEN
    ALTER TABLE cv_jobs
      ADD COLUMN IF NOT EXISTS team_id             UUID REFERENCES teams(id) ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS video_upload_id     UUID,
      ADD COLUMN IF NOT EXISTS submitted_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS processing_duration_sec NUMERIC(10, 2),
      ADD COLUMN IF NOT EXISTS rejection_reason    TEXT,
      ADD COLUMN IF NOT EXISTS masked_video_s3_key TEXT,
      ADD COLUMN IF NOT EXISTS result_payload      JSONB;

    ALTER TABLE cv_jobs
      DROP CONSTRAINT IF EXISTS cv_jobs_status_check;

    ALTER TABLE cv_jobs
      ADD CONSTRAINT cv_jobs_status_check
      CHECK (status IN (
        'pending', 'queued', 'processing',
        'completed', 'failed', 'retrying', 'rejected'
      ));

    CREATE INDEX IF NOT EXISTS idx_cv_jobs_video_upload_id
      ON cv_jobs (video_upload_id);
    CREATE INDEX IF NOT EXISTS idx_cv_jobs_team_id
      ON cv_jobs (team_id);
  END IF;
END $outer$;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS 更新: チームスタッフもアクセス可能に
-- ─────────────────────────────────────────────────────────────────────────────
-- video_uploads: スタッフ (AT/PT/Master) が所属チームの動画にアクセス可能
DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'video_uploads') THEN
    DROP POLICY IF EXISTS video_uploads_staff_access ON video_uploads;
    CREATE POLICY video_uploads_staff_access ON video_uploads
      FOR ALL TO authenticated
      USING (team_id IN (
        SELECT team_id FROM public.staff WHERE id = auth.uid() AND team_id IS NOT NULL
      ));
  END IF;
END $outer$;

-- cv_jobs: スタッフが所属チームのジョブにアクセス可能
DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cv_jobs') THEN
    DROP POLICY IF EXISTS cv_jobs_staff_access ON cv_jobs;
    CREATE POLICY cv_jobs_staff_access ON cv_jobs
      FOR ALL TO authenticated
      USING (team_id IN (
        SELECT team_id FROM public.staff WHERE id = auth.uid() AND team_id IS NOT NULL
      ));
  END IF;
END $outer$;

-- ─────────────────────────────────────────────────────────────────────────────
-- DBN RPC: 十分なデータを持つアスリートを取得
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_athletes_with_sufficient_data(
  min_days    INTEGER DEFAULT 180,
  cutoff_date DATE    DEFAULT NULL
)
RETURNS TABLE (athlete_id UUID, data_days BIGINT)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    dm.athlete_id,
    COUNT(DISTINCT dm.date) AS data_days
  FROM daily_metrics dm
  WHERE
    (cutoff_date IS NULL OR dm.date <= cutoff_date)
    AND dm.fatigue_subjective IS NOT NULL
    AND dm.hrv IS NOT NULL
  GROUP BY dm.athlete_id
  HAVING COUNT(DISTINCT dm.date) >= min_days;
$$;

COMMENT ON FUNCTION get_athletes_with_sufficient_data IS
  'DBN 週次再学習対象: min_days 以上の daily_metrics を持つアスリート一覧 (ADR-014)';

-- ─────────────────────────────────────────────────────────────────────────────
-- DBN 疲労アラート VIEW: AT/PT が確認すべき高疲労予測一覧
-- ─────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS v_active_fatigue_alerts;
CREATE VIEW v_active_fatigue_alerts AS
SELECT
  fa.id,
  fa.athlete_id,
  a.name AS athlete_name,
  a.team_id,
  fa.alert_date,
  fa.predicted_fatigue_state,
  fa.confidence_score,
  fa.recommended_action,
  fa.alert_status,
  fa.created_at
FROM fatigue_alerts fa
JOIN athletes a ON a.id = fa.athlete_id
WHERE
  fa.alert_date >= CURRENT_DATE
  AND fa.alert_status = 'pending'
  AND fa.predicted_fatigue_state = 'high'
ORDER BY fa.confidence_score DESC, fa.alert_date;

COMMENT ON VIEW v_active_fatigue_alerts IS
  '未対応の高疲労アラート一覧 (AT/PT ダッシュボード用, ADR-014)';

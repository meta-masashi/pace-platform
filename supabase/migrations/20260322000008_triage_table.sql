-- ========================================
-- triage テーブル新規作成
-- 実行手順: Supabase ダッシュボード → SQL エディタ → 実行
-- ========================================

-- triage エントリ（閾値判定結果の永続化）
CREATE TABLE IF NOT EXISTS public.triage (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id          UUID        NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  org_id              UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  trigger_type        TEXT        NOT NULL CHECK (trigger_type IN (
                                    'nrs_spike',
                                    'hrv_drop',
                                    'acwr_excess',
                                    'subjective_objective_divergence'
                                  )),
  severity            TEXT        NOT NULL CHECK (severity IN ('critical', 'watchlist')),
  metric_value        NUMERIC(8,3) NOT NULL,
  threshold_value     NUMERIC(8,3) NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at         TIMESTAMPTZ,
  resolved_by_staff_id UUID       REFERENCES public.staff(id) ON DELETE SET NULL
);

-- パフォーマンス用インデックス
CREATE INDEX IF NOT EXISTS triage_athlete_created
  ON public.triage (athlete_id, created_at DESC);

CREATE INDEX IF NOT EXISTS triage_org_severity
  ON public.triage (org_id, severity, created_at DESC);

CREATE INDEX IF NOT EXISTS triage_unresolved
  ON public.triage (org_id, resolved_at)
  WHERE resolved_at IS NULL;

-- ========================================
-- RLS 有効化
-- ========================================

ALTER TABLE public.triage ENABLE ROW LEVEL SECURITY;

-- 同一 org のスタッフのみ参照可能
DROP POLICY IF EXISTS "triage_select" ON public.triage;
CREATE POLICY "triage_select" ON public.triage FOR SELECT
  USING (org_id = get_my_org_id());

-- 同一 org のスタッフのみ作成可能（システムが自動挿入するケースを含む）
DROP POLICY IF EXISTS "triage_insert" ON public.triage;
CREATE POLICY "triage_insert" ON public.triage FOR INSERT
  WITH CHECK (org_id = get_my_org_id());

-- resolved_at / resolved_by_staff_id の更新のみ許可（同一 org 内）
DROP POLICY IF EXISTS "triage_update_resolve" ON public.triage;
CREATE POLICY "triage_update_resolve" ON public.triage FOR UPDATE
  USING (org_id = get_my_org_id());

-- 削除は master のみ
DROP POLICY IF EXISTS "triage_delete" ON public.triage;
CREATE POLICY "triage_delete" ON public.triage FOR DELETE
  USING (org_id = get_my_org_id() AND is_master());

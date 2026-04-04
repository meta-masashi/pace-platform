-- ========================================
-- PACE v3.0 — Row Level Security ポリシー（全テーブル）
-- 実行手順: Supabase ダッシュボード → SQL エディタ → 実行 → 「実行完了」と返信
-- 前提: 001〜007 の全マイグレーション実行済み
-- ========================================

-- ========================================
-- ヘルパー関数: 現在のスタッフ情報取得
-- ========================================

-- 現在のユーザーの org_id を返す
CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT org_id FROM public.staff WHERE id = auth.uid()
$$;

-- 現在のユーザーのロールを返す
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT role FROM public.staff WHERE id = auth.uid()
$$;

-- 現在のユーザーが master か判定
CREATE OR REPLACE FUNCTION public.is_master()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff
    WHERE id = auth.uid() AND role = 'master' AND is_active = TRUE
  )
$$;

-- 現在のユーザーが AT または PT か判定
CREATE OR REPLACE FUNCTION public.is_at_or_pt()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff
    WHERE id = auth.uid() AND role IN ('AT', 'PT') AND is_active = TRUE
  )
$$;

-- ========================================
-- organizations
-- ========================================
DROP POLICY IF EXISTS "organizations_select_own_org" ON public.organizations;
CREATE POLICY "organizations_select_own_org"
  ON public.organizations FOR SELECT
  USING (id = public.get_my_org_id());

DROP POLICY IF EXISTS "organizations_update_master_only" ON public.organizations;
CREATE POLICY "organizations_update_master_only"
  ON public.organizations FOR UPDATE
  USING (id = public.get_my_org_id() AND public.is_master());

-- ========================================
-- teams
-- ========================================
DROP POLICY IF EXISTS "teams_select_own_org" ON public.teams;
CREATE POLICY "teams_select_own_org"
  ON public.teams FOR SELECT
  USING (org_id = public.get_my_org_id());

DROP POLICY IF EXISTS "teams_write_master_only" ON public.teams;
CREATE POLICY "teams_write_master_only"
  ON public.teams FOR ALL
  USING (org_id = public.get_my_org_id() AND public.is_master());

-- ========================================
-- staff
-- ========================================
-- 同一 org のスタッフは一覧を閲覧可能
DROP POLICY IF EXISTS "staff_select_own_org" ON public.staff;
CREATE POLICY "staff_select_own_org"
  ON public.staff FOR SELECT
  USING (org_id = public.get_my_org_id());

-- スタッフ管理は master のみ
DROP POLICY IF EXISTS "staff_insert_master_only" ON public.staff;
CREATE POLICY "staff_insert_master_only"
  ON public.staff FOR INSERT
  WITH CHECK (org_id = public.get_my_org_id() AND public.is_master());

DROP POLICY IF EXISTS "staff_update_master_or_self" ON public.staff;
CREATE POLICY "staff_update_master_or_self"
  ON public.staff FOR UPDATE
  USING (org_id = public.get_my_org_id() AND (public.is_master() OR id = auth.uid()));

DROP POLICY IF EXISTS "staff_delete_master_only" ON public.staff;
CREATE POLICY "staff_delete_master_only"
  ON public.staff FOR DELETE
  USING (org_id = public.get_my_org_id() AND public.is_master());

-- ========================================
-- athletes
-- ========================================
DROP POLICY IF EXISTS "athletes_select_own_org" ON public.athletes;
CREATE POLICY "athletes_select_own_org"
  ON public.athletes FOR SELECT
  USING (org_id = public.get_my_org_id());

DROP POLICY IF EXISTS "athletes_write_master_or_at_pt" ON public.athletes;
CREATE POLICY "athletes_write_master_or_at_pt"
  ON public.athletes FOR ALL
  USING (org_id = public.get_my_org_id() AND (public.is_master() OR public.is_at_or_pt()));

-- ========================================
-- athlete_locks
-- ========================================
DROP POLICY IF EXISTS "athlete_locks_select_own_org" ON public.athlete_locks;
CREATE POLICY "athlete_locks_select_own_org"
  ON public.athlete_locks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.athletes a
      WHERE a.id = athlete_locks.athlete_id AND a.org_id = public.get_my_org_id()
    )
  );

-- Hard Lock 設定は master のみ; Soft Lock は AT/PT も可
DROP POLICY IF EXISTS "athlete_locks_insert" ON public.athlete_locks;
CREATE POLICY "athlete_locks_insert"
  ON public.athlete_locks FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.athletes a
      WHERE a.id = athlete_locks.athlete_id AND a.org_id = public.get_my_org_id()
    )
    AND (
      (lock_type = 'soft' AND (public.is_master() OR public.is_at_or_pt()))
      OR (lock_type = 'hard' AND public.is_master())
    )
  );

DROP POLICY IF EXISTS "athlete_locks_delete_master" ON public.athlete_locks;
CREATE POLICY "athlete_locks_delete_master"
  ON public.athlete_locks FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.athletes a
      WHERE a.id = athlete_locks.athlete_id AND a.org_id = public.get_my_org_id()
    )
    AND public.is_master()
  );

-- ========================================
-- daily_metrics
-- ========================================
DROP POLICY IF EXISTS "daily_metrics_select_own_org" ON public.daily_metrics;
CREATE POLICY "daily_metrics_select_own_org"
  ON public.daily_metrics FOR SELECT
  USING (org_id = public.get_my_org_id());

DROP POLICY IF EXISTS "daily_metrics_insert_own_org" ON public.daily_metrics;
CREATE POLICY "daily_metrics_insert_own_org"
  ON public.daily_metrics FOR INSERT
  WITH CHECK (org_id = public.get_my_org_id());

DROP POLICY IF EXISTS "daily_metrics_update_own_org" ON public.daily_metrics;
CREATE POLICY "daily_metrics_update_own_org"
  ON public.daily_metrics FOR UPDATE
  USING (org_id = public.get_my_org_id());

-- ========================================
-- mc_tracking（月経周期: テーブルは後続マイグレーションで作成される）
-- RLS ポリシーは 20260330000003_menstrual_phase.sql で設定
-- ========================================

-- ========================================
-- assessment_nodes（マスタデータ: 全スタッフ閲覧可、更新は master のみ）
-- ========================================
DROP POLICY IF EXISTS "assessment_nodes_select_all" ON public.assessment_nodes;
CREATE POLICY "assessment_nodes_select_all"
  ON public.assessment_nodes FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "assessment_nodes_write_master" ON public.assessment_nodes;
CREATE POLICY "assessment_nodes_write_master"
  ON public.assessment_nodes FOR ALL
  USING (public.is_master());

-- ========================================
-- alpha_chains / biomechanical_vectors: テーブル未作成のため RLS ポリシーをスキップ
-- ========================================

-- ========================================
-- assessments
-- ========================================
DROP POLICY IF EXISTS "assessments_select_own_org" ON public.assessments;
CREATE POLICY "assessments_select_own_org"
  ON public.assessments FOR SELECT
  USING (org_id = public.get_my_org_id());

DROP POLICY IF EXISTS "assessments_write_clinical" ON public.assessments;
CREATE POLICY "assessments_write_clinical"
  ON public.assessments FOR ALL
  USING (org_id = public.get_my_org_id() AND (public.is_master() OR public.is_at_or_pt()));

-- ========================================
-- assessment_responses / assessment_results: テーブル未作成のため RLS ポリシーをスキップ
-- 後続マイグレーション (20260403000002) で作成・ポリシー設定される
-- ========================================

-- ========================================
-- rtp_injury_nodes（マスタデータ: 全スタッフ閲覧可）
-- ========================================
DROP POLICY IF EXISTS "rtp_injury_nodes_select_all" ON public.rtp_injury_nodes;
CREATE POLICY "rtp_injury_nodes_select_all"
  ON public.rtp_injury_nodes FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ========================================
-- rehab_programs
-- ========================================
DROP POLICY IF EXISTS "rehab_programs_select_own_org" ON public.rehab_programs;
CREATE POLICY "rehab_programs_select_own_org"
  ON public.rehab_programs FOR SELECT
  USING (org_id = public.get_my_org_id());

DROP POLICY IF EXISTS "rehab_programs_write_clinical" ON public.rehab_programs;
CREATE POLICY "rehab_programs_write_clinical"
  ON public.rehab_programs FOR ALL
  USING (org_id = public.get_my_org_id() AND (public.is_master() OR public.is_at_or_pt()));

-- ========================================
-- rehab_phase_gates
-- ========================================
DROP POLICY IF EXISTS "rehab_phase_gates_select_own_org" ON public.rehab_phase_gates;
CREATE POLICY "rehab_phase_gates_select_own_org"
  ON public.rehab_phase_gates FOR SELECT
  USING (org_id = public.get_my_org_id());

DROP POLICY IF EXISTS "rehab_phase_gates_write_clinical" ON public.rehab_phase_gates;
CREATE POLICY "rehab_phase_gates_write_clinical"
  ON public.rehab_phase_gates FOR ALL
  USING (org_id = public.get_my_org_id() AND (public.is_master() OR public.is_at_or_pt()));

-- ========================================
-- exercises（マスタデータ: 全スタッフ閲覧可、更新は master のみ）
-- ========================================
DROP POLICY IF EXISTS "exercises_select_all" ON public.exercises;
CREATE POLICY "exercises_select_all"
  ON public.exercises FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "exercises_write_master" ON public.exercises;
CREATE POLICY "exercises_write_master"
  ON public.exercises FOR ALL
  USING (public.is_master());

-- ========================================
-- workouts
-- ========================================
DROP POLICY IF EXISTS "workouts_select_own_org" ON public.workouts;
CREATE POLICY "workouts_select_own_org"
  ON public.workouts FOR SELECT
  USING (org_id = public.get_my_org_id());

-- AI生成メニューの承認・配信: AT/PT は rehab メニュー、S&C はチームメニュー
DROP POLICY IF EXISTS "workouts_write_own_org" ON public.workouts;
CREATE POLICY "workouts_write_own_org"
  ON public.workouts FOR ALL
  USING (org_id = public.get_my_org_id());

-- ========================================
-- soap_notes（機密性高: AT/PT/master のみ）
-- ========================================
DROP POLICY IF EXISTS "soap_notes_select_clinical" ON public.soap_notes;
CREATE POLICY "soap_notes_select_clinical"
  ON public.soap_notes FOR SELECT
  USING (org_id = public.get_my_org_id() AND (public.is_master() OR public.is_at_or_pt()));

DROP POLICY IF EXISTS "soap_notes_write_clinical" ON public.soap_notes;
CREATE POLICY "soap_notes_write_clinical"
  ON public.soap_notes FOR ALL
  USING (org_id = public.get_my_org_id() AND (public.is_master() OR public.is_at_or_pt()));

-- ========================================
-- cv_analysis_jobs
-- ========================================
DROP POLICY IF EXISTS "cv_analysis_jobs_select_own_org" ON public.cv_analysis_jobs;
CREATE POLICY "cv_analysis_jobs_select_own_org"
  ON public.cv_analysis_jobs FOR SELECT
  USING (org_id = public.get_my_org_id());

DROP POLICY IF EXISTS "cv_analysis_jobs_write_clinical" ON public.cv_analysis_jobs;
CREATE POLICY "cv_analysis_jobs_write_clinical"
  ON public.cv_analysis_jobs FOR ALL
  USING (org_id = public.get_my_org_id() AND (public.is_master() OR public.is_at_or_pt()));

-- ========================================
-- channels
-- ========================================
DROP POLICY IF EXISTS "channels_select_own_org" ON public.channels;
CREATE POLICY "channels_select_own_org"
  ON public.channels FOR SELECT
  USING (org_id = public.get_my_org_id());

DROP POLICY IF EXISTS "channels_write_master" ON public.channels;
CREATE POLICY "channels_write_master"
  ON public.channels FOR ALL
  USING (org_id = public.get_my_org_id() AND public.is_master());

-- ========================================
-- messages
-- ========================================
DROP POLICY IF EXISTS "messages_select_own_org" ON public.messages;
CREATE POLICY "messages_select_own_org"
  ON public.messages FOR SELECT
  USING (org_id = public.get_my_org_id());

DROP POLICY IF EXISTS "messages_insert_own_org" ON public.messages;
CREATE POLICY "messages_insert_own_org"
  ON public.messages FOR INSERT
  WITH CHECK (org_id = public.get_my_org_id() AND staff_id = auth.uid());

DROP POLICY IF EXISTS "messages_update_own" ON public.messages;
CREATE POLICY "messages_update_own"
  ON public.messages FOR UPDATE
  USING (org_id = public.get_my_org_id() AND staff_id = auth.uid());

-- ========================================
-- audit_logs（INSERT のみ許可、全スタッフが自 org のログを閲覧可）
-- master のみ全件閲覧可
-- ========================================
DROP POLICY IF EXISTS "audit_logs_select_master" ON public.audit_logs;
CREATE POLICY "audit_logs_select_master"
  ON public.audit_logs FOR SELECT
  USING (org_id = public.get_my_org_id() AND public.is_master());

DROP POLICY IF EXISTS "audit_logs_insert_own_org" ON public.audit_logs;
CREATE POLICY "audit_logs_insert_own_org"
  ON public.audit_logs FOR INSERT
  WITH CHECK (org_id = public.get_my_org_id());

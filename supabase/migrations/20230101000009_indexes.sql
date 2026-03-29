-- ========================================
-- PACE v3.0 — パフォーマンス最適化インデックス
-- 実行手順: Supabase ダッシュボード → SQL エディタ → 実行 → 「実行完了」と返信
-- 前提: 001〜008 の全マイグレーション実行済み
-- ========================================

-- ========================================
-- organizations
-- ========================================
CREATE INDEX IF NOT EXISTS idx_organizations_plan
  ON public.organizations (plan);

-- ========================================
-- teams
-- ========================================
CREATE INDEX IF NOT EXISTS idx_teams_org_id
  ON public.teams (org_id);

-- ========================================
-- staff
-- ========================================
CREATE INDEX IF NOT EXISTS idx_staff_org_role
  ON public.staff (org_id, role);

CREATE INDEX IF NOT EXISTS idx_staff_email
  ON public.staff (email);

CREATE INDEX IF NOT EXISTS idx_staff_org_active
  ON public.staff (org_id, is_active)
  WHERE is_active = TRUE;

-- ========================================
-- athletes
-- ========================================
CREATE INDEX IF NOT EXISTS idx_athletes_org_team
  ON public.athletes (org_id, team_id);

CREATE INDEX IF NOT EXISTS idx_athletes_org_sport
  ON public.athletes (org_id, sport);

-- ========================================
-- athlete_locks
-- ========================================
-- 有効中の Lock の高速取得（ダッシュボード / チームメニュー除外判定）
CREATE INDEX IF NOT EXISTS idx_athlete_locks_athlete_active
  ON public.athlete_locks (athlete_id)
  WHERE expires_at IS NULL OR expires_at > now();

CREATE INDEX IF NOT EXISTS idx_athlete_locks_hard
  ON public.athlete_locks (athlete_id, lock_type)
  WHERE lock_type = 'hard';

-- ========================================
-- daily_metrics（003 で定義済みの追加分）
-- ========================================
-- HRV 低下トリアージ（ベースライン比較クエリ用）
CREATE INDEX IF NOT EXISTS idx_daily_metrics_hrv
  ON public.daily_metrics (org_id, hrv ASC)
  WHERE hrv IS NOT NULL;

-- ========================================
-- assessments
-- ========================================
CREATE INDEX IF NOT EXISTS idx_assessments_athlete_created
  ON public.assessments (athlete_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_assessments_org_status
  ON public.assessments (org_id, status);

-- 進行中アセスメントの高速取得（リアルタイム UI 更新用）
CREATE INDEX IF NOT EXISTS idx_assessments_in_progress
  ON public.assessments (org_id, created_at DESC)
  WHERE status = 'in_progress';

-- ========================================
-- assessment_responses
-- ========================================
CREATE INDEX IF NOT EXISTS idx_assessment_responses_assessment
  ON public.assessment_responses (assessment_id, timestamp ASC);

-- ========================================
-- assessment_results
-- ========================================
CREATE INDEX IF NOT EXISTS idx_assessment_results_assessment
  ON public.assessment_results (assessment_id);

CREATE INDEX IF NOT EXISTS idx_assessment_results_org_confidence
  ON public.assessment_results (org_id, confidence DESC)
  WHERE confidence IS NOT NULL;

-- ========================================
-- assessment_nodes
-- ========================================
CREATE INDEX IF NOT EXISTS idx_assessment_nodes_file_type
  ON public.assessment_nodes (file_type);

CREATE INDEX IF NOT EXISTS idx_assessment_nodes_phase
  ON public.assessment_nodes (file_type, phase);

-- 競合仮説グループ検索（ゼロサム正規化処理用）
CREATE INDEX IF NOT EXISTS idx_assessment_nodes_mutex_group
  ON public.assessment_nodes (mutual_exclusive_group)
  WHERE mutual_exclusive_group IS NOT NULL;

-- ========================================
-- biomechanical_vectors（004 で定義済みの追加分）
-- ========================================
-- vector_type 別グラフトラバーサル
CREATE INDEX IF NOT EXISTS idx_bv_source_type
  ON public.biomechanical_vectors (source_node_id, vector_type);

-- ========================================
-- rehab_programs
-- ========================================
CREATE INDEX IF NOT EXISTS idx_rehab_programs_athlete_status
  ON public.rehab_programs (athlete_id, status);

CREATE INDEX IF NOT EXISTS idx_rehab_programs_org_status
  ON public.rehab_programs (org_id, status);

-- アクティブなリハビリ一覧の高速取得
CREATE INDEX IF NOT EXISTS idx_rehab_programs_active
  ON public.rehab_programs (org_id, estimated_rtp_date ASC)
  WHERE status = 'active';

-- ========================================
-- rehab_phase_gates
-- ========================================
CREATE INDEX IF NOT EXISTS idx_rehab_phase_gates_program
  ON public.rehab_phase_gates (program_id, phase ASC);

-- ========================================
-- workouts
-- ========================================
-- 未承認ワークアウト一覧（承認ダッシュボード用）
CREATE INDEX IF NOT EXISTS idx_workouts_pending_approval
  ON public.workouts (org_id, generated_at DESC)
  WHERE approved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_workouts_athlete_distributed
  ON public.workouts (athlete_id, distributed_at DESC)
  WHERE distributed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workouts_team_distributed
  ON public.workouts (team_id, distributed_at DESC)
  WHERE distributed_at IS NOT NULL;

-- ========================================
-- soap_notes
-- ========================================
CREATE INDEX IF NOT EXISTS idx_soap_notes_athlete_created
  ON public.soap_notes (athlete_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_soap_notes_org_staff
  ON public.soap_notes (org_id, staff_id, created_at DESC);

-- ========================================
-- cv_analysis_jobs（006 で定義済みの追加分）
-- ========================================
-- assessment 紐付け検索
CREATE INDEX IF NOT EXISTS idx_cv_assessment
  ON public.cv_analysis_jobs (assessment_id)
  WHERE assessment_id IS NOT NULL;

-- ========================================
-- channels
-- ========================================
CREATE INDEX IF NOT EXISTS idx_channels_org_team
  ON public.channels (org_id, team_id);

-- ========================================
-- audit_logs（007 で定義済みの追加分）
-- ========================================
-- アクション種別検索（セキュリティモニタリング）
CREATE INDEX IF NOT EXISTS idx_audit_logs_action
  ON public.audit_logs (org_id, action, timestamp DESC);

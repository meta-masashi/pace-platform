-- ==========================================================================
-- P6-003-3: AI エージェント テーブル マイグレーション
--
-- A2原則: LLM出力は計画生成のみ。判定ロジックには不使用。
-- Human-in-the-loop: スタッフ承認必須。approved でなければ選手に非表示。
--
-- 対象テーブル:
--   - ai_plan_jobs    (ジョブ管理)
--   - weekly_plans    (週次トレーニング計画)
-- ==========================================================================

-- -------------------------------------------------------------------------
-- 1. ai_plan_jobs テーブル
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ai_plan_jobs (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id          UUID NOT NULL REFERENCES public.organizations(id),
  team_id         UUID NOT NULL REFERENCES public.teams(id),
  requested_by    UUID NOT NULL REFERENCES public.staff(id),

  -- ジョブ設定
  job_type        TEXT NOT NULL CHECK (job_type IN ('weekly_plan', 'rehab_roadmap', 'peaking_plan')),
  target_week     DATE NOT NULL,
  parameters      JSONB NOT NULL DEFAULT '{}',

  -- トークン管理
  token_budget    INTEGER NOT NULL DEFAULT 30000,
  tokens_used     INTEGER DEFAULT 0,
  model_id        TEXT NOT NULL DEFAULT 'gemini-2.0-flash',

  -- ステータス管理
  status          TEXT NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  error_message   TEXT,

  -- メタデータ
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_plan_jobs_org_status
  ON public.ai_plan_jobs (org_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_plan_jobs_team_week
  ON public.ai_plan_jobs (team_id, target_week);

-- RLS
ALTER TABLE public.ai_plan_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_plan_jobs_org_read" ON public.ai_plan_jobs
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM public.staff WHERE id = auth.uid())
  );

CREATE POLICY "ai_plan_jobs_org_insert" ON public.ai_plan_jobs
  FOR INSERT WITH CHECK (
    org_id IN (SELECT org_id FROM public.staff WHERE id = auth.uid())
  );

-- -------------------------------------------------------------------------
-- 2. weekly_plans テーブル
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.weekly_plans (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id          UUID NOT NULL REFERENCES public.organizations(id),
  team_id         UUID NOT NULL REFERENCES public.teams(id),
  job_id          UUID REFERENCES public.ai_plan_jobs(id),

  -- 計画内容
  target_week     DATE NOT NULL,
  plan_type       TEXT NOT NULL CHECK (plan_type IN ('team', 'individual')),
  athlete_id      UUID REFERENCES public.athletes(id),
  content         JSONB NOT NULL,
  notes           TEXT,

  -- 承認フロー
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected', 'archived')),
  created_by      UUID NOT NULL REFERENCES public.staff(id),
  approved_by     UUID REFERENCES public.staff(id),
  approved_at     TIMESTAMPTZ,
  rejection_reason TEXT,

  -- Hard Lock 制約
  hard_lock_applied BOOLEAN DEFAULT false,

  -- メタデータ
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 制約: individual プランには athlete_id が必須
  CONSTRAINT weekly_plans_individual_requires_athlete
    CHECK (plan_type = 'team' OR athlete_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_weekly_plans_team_week
  ON public.weekly_plans (team_id, target_week);
CREATE INDEX IF NOT EXISTS idx_weekly_plans_athlete_week
  ON public.weekly_plans (athlete_id, target_week)
  WHERE athlete_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_weekly_plans_status
  ON public.weekly_plans (org_id, status)
  WHERE status IN ('pending_approval', 'approved');

-- RLS
ALTER TABLE public.weekly_plans ENABLE ROW LEVEL SECURITY;

-- スタッフポリシー
CREATE POLICY "weekly_plans_staff_read" ON public.weekly_plans
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM public.staff WHERE id = auth.uid())
  );

CREATE POLICY "weekly_plans_staff_write" ON public.weekly_plans
  FOR INSERT WITH CHECK (
    org_id IN (SELECT org_id FROM public.staff WHERE id = auth.uid())
  );

CREATE POLICY "weekly_plans_staff_update" ON public.weekly_plans
  FOR UPDATE USING (
    org_id IN (SELECT org_id FROM public.staff WHERE id = auth.uid())
  );

-- 選手ポリシー: approved の自分の計画のみ
CREATE POLICY "weekly_plans_athlete_read" ON public.weekly_plans
  FOR SELECT USING (
    status = 'approved'
    AND (
      plan_type = 'team'
      OR athlete_id IN (SELECT id FROM public.athletes WHERE id = auth.uid())
    )
    AND org_id IN (SELECT org_id FROM public.athletes WHERE id = auth.uid())
  );

-- -------------------------------------------------------------------------
-- 3. updated_at 自動更新トリガー
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ai_plan_jobs_updated_at
  BEFORE UPDATE ON public.ai_plan_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER weekly_plans_updated_at
  BEFORE UPDATE ON public.weekly_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

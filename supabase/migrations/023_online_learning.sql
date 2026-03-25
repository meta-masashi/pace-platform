-- ============================================================
-- 023_online_learning.sql
-- Bayesian Online Learning — モデルバージョン管理 & LR 更新提案
--
-- DAG ノードの尤度比（LR）をリアルワールドの受傷アウトカムに基づき
-- 自動更新するための永続化テーブル。
--
-- model_versions: LR 値スナップショットのバージョン管理
-- lr_update_proposals: 安全バウンド逸脱時のヒューマンレビュー提案
-- injury_logs: 受傷アウトカム追跡
-- ============================================================

-- ---------------------------------------------------------------------------
-- assessment_nodes に自己修正 LR カラムを追加
-- ---------------------------------------------------------------------------

ALTER TABLE public.assessment_nodes
  ADD COLUMN IF NOT EXISTS lr_yes_sr FLOAT;

COMMENT ON COLUMN public.assessment_nodes.lr_yes_sr IS
  'Bayesian Online Learning による自己修正後の陽性尤度比。NULL の場合は lr_yes を使用。';

-- ---------------------------------------------------------------------------
-- モデルバージョンスナップショット
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.model_versions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  version TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL CHECK (source IN ('csv_baseline', 'bayesian_update', 'manual_override')),
  node_weights JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_by UUID REFERENCES public.staff(id),
  notes TEXT
);

COMMENT ON TABLE public.model_versions IS
  'DAG ノード LR 値のバージョンスナップショット。ロールバック用。';

-- ---------------------------------------------------------------------------
-- LR 更新提案（ヒューマンレビュー対象）
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.lr_update_proposals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  node_id TEXT NOT NULL,
  current_lr FLOAT NOT NULL,
  proposed_lr FLOAT NOT NULL,
  original_csv_lr FLOAT NOT NULL,
  deviation_pct FLOAT NOT NULL,
  sample_size INT NOT NULL,
  confidence FLOAT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES public.staff(id),
  reviewed_at TIMESTAMPTZ,
  batch_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.lr_update_proposals IS
  '安全バウンド（±50%）を超えた LR 更新提案。master ロールによるレビューが必要。';

-- ---------------------------------------------------------------------------
-- 受傷ログ（学習データソース）
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.injury_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  athlete_id UUID NOT NULL REFERENCES public.athletes(id),
  injury_date TIMESTAMPTZ NOT NULL,
  node_id TEXT,
  body_region TEXT,
  severity TEXT CHECK (severity IN ('mild', 'moderate', 'severe')),
  description TEXT,
  reported_by UUID REFERENCES public.staff(id),
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.injury_logs IS
  'アスリートの受傷ログ。Bayesian Online Learning の教師データとして使用。';

-- ---------------------------------------------------------------------------
-- インデックス
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_model_versions_created
  ON public.model_versions (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lr_proposals_status
  ON public.lr_update_proposals (status)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_lr_proposals_batch
  ON public.lr_update_proposals (batch_version);

CREATE INDEX IF NOT EXISTS idx_injury_logs_athlete_date
  ON public.injury_logs (athlete_id, injury_date DESC);

CREATE INDEX IF NOT EXISTS idx_injury_logs_org
  ON public.injury_logs (org_id);

-- ---------------------------------------------------------------------------
-- RLS ポリシー
-- ---------------------------------------------------------------------------

ALTER TABLE public.model_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lr_update_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.injury_logs ENABLE ROW LEVEL SECURITY;

-- model_versions: 全スタッフ閲覧可、master のみ挿入可
CREATE POLICY "model_versions_select" ON public.model_versions
  FOR SELECT USING (true);

CREATE POLICY "model_versions_insert" ON public.model_versions
  FOR INSERT WITH CHECK (
    (SELECT role FROM public.staff WHERE id = auth.uid()) = 'master'
  );

-- lr_update_proposals: 全スタッフ閲覧可、master のみ更新可
CREATE POLICY "lr_proposals_select" ON public.lr_update_proposals
  FOR SELECT USING (true);

CREATE POLICY "lr_proposals_insert" ON public.lr_update_proposals
  FOR INSERT WITH CHECK (true);

CREATE POLICY "lr_proposals_update" ON public.lr_update_proposals
  FOR UPDATE USING (
    (SELECT role FROM public.staff WHERE id = auth.uid()) = 'master'
  );

-- injury_logs: 同組織のスタッフのみ
CREATE POLICY "injury_logs_org" ON public.injury_logs
  FOR ALL USING (
    org_id = (SELECT org_id FROM public.staff WHERE id = auth.uid())
  );

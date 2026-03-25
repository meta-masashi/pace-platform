-- ========================================
-- PACE v3.0 — アセスメント・ベイズノード
-- 実行手順: Supabase ダッシュボード → SQL エディタ → 実行 → 「実行完了」と返信
-- 前提: 002_staff_athletes.sql 実行済み
-- ========================================

-- ========================================
-- assessment_nodes テーブル（Excelからインポート用マスタ）
-- ========================================
CREATE TABLE IF NOT EXISTS public.assessment_nodes (
  node_id                    TEXT PRIMARY KEY,
  file_type                  TEXT NOT NULL CHECK (file_type IN ('F1', 'F2', 'F3', 'RTP', 'MC')),
  phase                      TEXT NOT NULL CHECK (phase IN ('RedFlag', 'Phase0', 'Phase1', 'Phase2', 'Phase3', 'Phase4')),
  category                   TEXT CHECK (category IN ('anatomical', 'clinical', 'contextual')),
  question_text              TEXT NOT NULL,
  target_axis                TEXT,
  lr_yes                     FLOAT NOT NULL,
  lr_no                      FLOAT NOT NULL,
  kappa                      FLOAT NOT NULL CHECK (kappa >= 0 AND kappa <= 1),
  routing_rules_json         JSONB DEFAULT '{}',
  prescription_tags_json     JSONB DEFAULT '[]',
  contraindication_tags_json JSONB DEFAULT '[]',
  time_decay_lambda          FLOAT,
  -- v3.0 追加カラム
  base_prevalence            FLOAT,              -- 動的事前確率計算のための基礎有病率
  mutual_exclusive_group     UUID,               -- 競合仮説グループ識別子（ゼロサム処理用）
  created_at                 TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at                 TIMESTAMPTZ DEFAULT now() NOT NULL
);

DROP TRIGGER IF EXISTS handle_updated_at ON public.assessment_nodes;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.assessment_nodes
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ========================================
-- alpha_chains テーブル（フォースカップル伝播チェーン）
-- ========================================
CREATE TABLE IF NOT EXISTS public.alpha_chains (
  chain_id              TEXT PRIMARY KEY,
  chain_name            TEXT,
  nodes_json            JSONB DEFAULT '[]',      -- [{node_id, alpha}]
  causal_reasoning      TEXT,
  cross_axis_indicators JSONB DEFAULT '[]',
  created_at            TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at            TIMESTAMPTZ DEFAULT now() NOT NULL
);

DROP TRIGGER IF EXISTS handle_updated_at ON public.alpha_chains;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.alpha_chains
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ========================================
-- biomechanical_vectors テーブル（グラフエッジ: 波及関係）
-- ========================================
CREATE TABLE IF NOT EXISTS public.biomechanical_vectors (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source_node_id   TEXT NOT NULL REFERENCES public.assessment_nodes(node_id) ON DELETE RESTRICT,
  target_node_id   TEXT NOT NULL REFERENCES public.assessment_nodes(node_id) ON DELETE RESTRICT,
  vector_type      TEXT NOT NULL CHECK (vector_type IN ('force_couple', 'compensation', 'kinematic_chain')),
  vector_magnitude FLOAT NOT NULL,               -- 波及時の尤度比増幅係数（例: 1.4）
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at       TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT unique_vector UNIQUE (source_node_id, target_node_id, vector_type)
);

DROP TRIGGER IF EXISTS handle_updated_at ON public.biomechanical_vectors;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.biomechanical_vectors
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- グラフトラバーサル高速化インデックス
CREATE INDEX IF NOT EXISTS idx_bv_source ON public.biomechanical_vectors (source_node_id);
CREATE INDEX IF NOT EXISTS idx_bv_target ON public.biomechanical_vectors (target_node_id);

-- ========================================
-- assessments テーブル（徒手検査ログ）
-- ========================================
CREATE TABLE IF NOT EXISTS public.assessments (
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  athlete_id           UUID NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  org_id               UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  staff_id             UUID NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  assessment_type      TEXT NOT NULL CHECK (assessment_type IN ('F1', 'F2', 'F3')),
  status               TEXT NOT NULL DEFAULT 'in_progress'
                         CHECK (status IN ('in_progress', 'completed', 'aborted')),
  started_at           TIMESTAMPTZ DEFAULT now(),
  completed_at         TIMESTAMPTZ,
  -- v3.0 追加カラム
  cv_confidence_score  FLOAT CHECK (cv_confidence_score >= 0 AND cv_confidence_score <= 1),
  created_at           TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at           TIMESTAMPTZ DEFAULT now() NOT NULL
);

DROP TRIGGER IF EXISTS handle_updated_at ON public.assessments;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.assessments
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ========================================
-- assessment_responses テーブル（回答ログ）
-- ========================================
CREATE TABLE IF NOT EXISTS public.assessment_responses (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  assessment_id  UUID NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  node_id        TEXT NOT NULL REFERENCES public.assessment_nodes(node_id) ON DELETE RESTRICT,
  answer         TEXT NOT NULL CHECK (answer IN ('yes', 'no', 'unknown')),
  timestamp      TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ========================================
-- assessment_results テーブル（推論結果）
-- ========================================
CREATE TABLE IF NOT EXISTS public.assessment_results (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  assessment_id       UUID NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  org_id              UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  primary_diagnosis   TEXT,
  confidence          FLOAT CHECK (confidence >= 0 AND confidence <= 1),
  differentials_json  JSONB DEFAULT '[]',        -- 鑑別診断リスト（確率付き）
  created_at          TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at          TIMESTAMPTZ DEFAULT now() NOT NULL
);

DROP TRIGGER IF EXISTS handle_updated_at ON public.assessment_results;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.assessment_results
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ========================================
-- rtp_injury_nodes テーブル（RTP 傷害別ノード）
-- ========================================
CREATE TABLE IF NOT EXISTS public.rtp_injury_nodes (
  node_id            TEXT PRIMARY KEY,
  injury_type        TEXT,
  phase              INTEGER,
  gate_criteria_json JSONB DEFAULT '{}',
  lsi_target         FLOAT,
  test_battery_json  JSONB DEFAULT '[]',
  created_at         TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at         TIMESTAMPTZ DEFAULT now() NOT NULL
);

DROP TRIGGER IF EXISTS handle_updated_at ON public.rtp_injury_nodes;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.rtp_injury_nodes
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ========================================
-- RLS の有効化
-- ========================================
ALTER TABLE public.assessment_nodes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alpha_chains           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.biomechanical_vectors  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_responses   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_results     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rtp_injury_nodes       ENABLE ROW LEVEL SECURITY;

-- ※ ポリシー詳細は 008_rls_policies.sql で定義

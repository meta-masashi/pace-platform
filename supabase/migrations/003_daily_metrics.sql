-- ========================================
-- PACE v3.0 — 日次メトリクス（選手チェックイン）
-- 実行手順: Supabase ダッシュボード → SQL エディタ → 実行 → 「実行完了」と返信
-- 前提: 002_staff_athletes.sql 実行済み
-- ========================================

-- ========================================
-- daily_metrics テーブル
-- ========================================
CREATE TABLE IF NOT EXISTS public.daily_metrics (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  athlete_id            UUID NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  org_id                UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  date                  DATE NOT NULL,
  nrs                   FLOAT CHECK (nrs >= 0 AND nrs <= 10),
  hrv                   FLOAT,
  acwr                  FLOAT,
  sleep_score           FLOAT CHECK (sleep_score >= 0 AND sleep_score <= 10),
  subjective_condition  FLOAT CHECK (subjective_condition >= 0 AND subjective_condition <= 10),
  hp_computed           FLOAT,                   -- PACE エンジンが算出した総合スコア
  source                TEXT DEFAULT 'manual'
                          CHECK (source IN ('manual', 'healthkit', 'health_connect')),
  created_at            TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at            TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT unique_athlete_date UNIQUE (athlete_id, date)
);

DROP TRIGGER IF EXISTS handle_updated_at ON public.daily_metrics;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.daily_metrics
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ========================================
-- mc_tracking テーブル（月経周期トラッキング）
-- ========================================
CREATE TABLE IF NOT EXISTS public.mc_tracking (
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  athlete_id           UUID NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  org_id               UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  date                 DATE NOT NULL,
  cycle_phase          TEXT,
  lmp_date             DATE,
  node_responses_json  JSONB DEFAULT '{}',
  risk_flags_json      JSONB DEFAULT '[]',
  created_at           TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at           TIMESTAMPTZ DEFAULT now() NOT NULL
);

DROP TRIGGER IF EXISTS handle_updated_at ON public.mc_tracking;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.mc_tracking
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ========================================
-- パフォーマンスインデックス
-- ========================================

-- チェックイン一覧（ダッシュボード: チームの日付別取得）
CREATE INDEX IF NOT EXISTS idx_daily_metrics_org_date
  ON public.daily_metrics (org_id, date DESC);

-- 選手個別の時系列取得（14日間トレンド）
CREATE INDEX IF NOT EXISTS idx_daily_metrics_athlete_date
  ON public.daily_metrics (athlete_id, date DESC);

-- ACWR / NRS 閾値トリアージ用（Critical フィルタ）
CREATE INDEX IF NOT EXISTS idx_daily_metrics_acwr
  ON public.daily_metrics (org_id, acwr DESC)
  WHERE acwr > 1.3;

CREATE INDEX IF NOT EXISTS idx_daily_metrics_nrs
  ON public.daily_metrics (org_id, nrs DESC)
  WHERE nrs >= 4;

-- mc_tracking
CREATE INDEX IF NOT EXISTS idx_mc_tracking_athlete_date
  ON public.mc_tracking (athlete_id, date DESC);

-- ========================================
-- RLS の有効化
-- ========================================
ALTER TABLE public.daily_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mc_tracking   ENABLE ROW LEVEL SECURITY;

-- ※ ポリシー詳細は 008_rls_policies.sql で定義

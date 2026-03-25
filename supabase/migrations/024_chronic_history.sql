-- ============================================================
-- 024_chronic_history.sql
-- 慢性 α 修正係数（Chronic α Modifier）テーブル
--
-- アスリートごと・ノードごとの繰り返し受傷履歴を追跡し、
-- 時間減衰モデルの修正係数を管理する。
--
-- modifier = 1.0 + (recurrence_count × 0.15), 上限 2.0
-- ============================================================

CREATE TABLE IF NOT EXISTS public.athlete_chronic_modifiers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  athlete_id UUID NOT NULL REFERENCES public.athletes(id),
  node_id TEXT NOT NULL,
  recurrence_count INT NOT NULL DEFAULT 0,
  modifier FLOAT NOT NULL DEFAULT 1.0,
  last_occurrence TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_athlete_node_modifier UNIQUE (athlete_id, node_id)
);

COMMENT ON TABLE public.athlete_chronic_modifiers IS
  'アスリートごと・ノードごとの慢性 α 修正係数。繰り返し受傷時に時間減衰を遅延させる。';

-- ---------------------------------------------------------------------------
-- インデックス
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_chronic_mod_athlete
  ON public.athlete_chronic_modifiers (athlete_id);

CREATE INDEX IF NOT EXISTS idx_chronic_mod_athlete_node
  ON public.athlete_chronic_modifiers (athlete_id, node_id);

-- ---------------------------------------------------------------------------
-- RLS ポリシー
-- ---------------------------------------------------------------------------

ALTER TABLE public.athlete_chronic_modifiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chronic_mod_org" ON public.athlete_chronic_modifiers
  FOR ALL USING (
    athlete_id IN (
      SELECT id FROM public.athletes
      WHERE org_id = (SELECT org_id FROM public.staff WHERE id = auth.uid())
    )
  );

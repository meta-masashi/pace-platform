-- ============================================================
-- PACE Platform — リスク時間減衰トラッキング
--
-- 日次バッチでリスク値の時間減衰を計算し、その履歴を記録する。
-- Risk(t) = Risk(0) × e^(-λt)
-- ============================================================

-- ---------------------------------------------------------------------------
-- risk_decay_log テーブル
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.risk_decay_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  athlete_id UUID NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  assessment_id UUID NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  initial_risk FLOAT NOT NULL,
  current_risk FLOAT NOT NULL,
  lambda FLOAT NOT NULL,
  half_life_days FLOAT NOT NULL,
  chronic_modifier FLOAT NOT NULL DEFAULT 1.0,
  days_elapsed INT NOT NULL,
  computed_date DATE NOT NULL DEFAULT CURRENT_DATE,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 日付単位のユニーク制約
CREATE UNIQUE INDEX IF NOT EXISTS unique_decay_entry
  ON public.risk_decay_log (athlete_id, assessment_id, node_id, computed_date);

-- ---------------------------------------------------------------------------
-- RLS ポリシー
-- ---------------------------------------------------------------------------

ALTER TABLE public.risk_decay_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "risk_decay_org_read" ON public.risk_decay_log
  FOR SELECT USING (
    athlete_id IN (
      SELECT id FROM public.athletes
      WHERE org_id = (
        SELECT org_id FROM public.staff WHERE id = auth.uid()
      )
    )
  );

-- サービスロール（バッチ処理）のみ INSERT/UPDATE 可能
CREATE POLICY "risk_decay_service_insert" ON public.risk_decay_log
  FOR INSERT WITH CHECK (
    auth.role() = 'service_role'
  );

-- ---------------------------------------------------------------------------
-- インデックス
-- ---------------------------------------------------------------------------

CREATE INDEX idx_risk_decay_athlete
  ON public.risk_decay_log(athlete_id, computed_at DESC);

CREATE INDEX idx_risk_decay_assessment
  ON public.risk_decay_log(assessment_id, node_id);

CREATE INDEX idx_risk_decay_current
  ON public.risk_decay_log(athlete_id, current_risk)
  WHERE current_risk > 0.05;

-- ---------------------------------------------------------------------------
-- コメント
-- ---------------------------------------------------------------------------

COMMENT ON TABLE public.risk_decay_log IS
  '日次バッチで計算されたリスク時間減衰ログ。Risk(t) = Risk(0) × e^(-λt) の履歴を保持する。';

COMMENT ON COLUMN public.risk_decay_log.lambda IS
  '減衰定数 λ。半減期 = ln(2) / λ。';

COMMENT ON COLUMN public.risk_decay_log.chronic_modifier IS
  '繰り返し受傷の修正係数。> 1.0 で減衰が遅くなる（リスクが高めに維持される）。';

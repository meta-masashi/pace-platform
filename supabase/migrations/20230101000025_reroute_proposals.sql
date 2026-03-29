-- ==========================================================================
-- PACE Platform — リルート提案テーブル
--
-- 動的リハビリリルートの検出・調整提案を管理する。
-- スタッフによる承認/却下のワークフローを実現する。
-- ==========================================================================

CREATE TABLE IF NOT EXISTS public.reroute_proposals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  program_id UUID NOT NULL REFERENCES public.rehab_programs(id),
  athlete_id UUID NOT NULL REFERENCES public.athletes(id),
  detection JSONB NOT NULL,
  adjustments JSONB NOT NULL,
  new_estimated_rts DATE,
  nlg_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by UUID REFERENCES public.staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_reroute_proposals_program
  ON public.reroute_proposals (program_id);
CREATE INDEX IF NOT EXISTS idx_reroute_proposals_athlete
  ON public.reroute_proposals (athlete_id);
CREATE INDEX IF NOT EXISTS idx_reroute_proposals_status
  ON public.reroute_proposals (status) WHERE status = 'pending';

-- RLS
ALTER TABLE public.reroute_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reroute_org" ON public.reroute_proposals
  FOR ALL USING (
    athlete_id IN (
      SELECT id FROM public.athletes
      WHERE org_id = (
        SELECT org_id FROM public.staff WHERE id = auth.uid()
      )
    )
  );

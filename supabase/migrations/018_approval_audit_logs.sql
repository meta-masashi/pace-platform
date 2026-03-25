-- ============================================================================
-- 018: WORM 監査ログテーブル (SaMD コンプライアンス)
--
-- 承認・却下操作の不変な監査ログ。
-- INSERT のみ許可。UPDATE / DELETE ポリシーを設けないことで WORM を実現。
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.approval_audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  staff_id UUID NOT NULL REFERENCES public.staff(id),
  athlete_id UUID NOT NULL REFERENCES public.athletes(id),
  action TEXT NOT NULL CHECK (action IN ('approve', 'edit_approve', 'reject')),
  approved_menu_json JSONB,
  evidence_text_snapshot TEXT NOT NULL,
  nlg_text_snapshot TEXT,
  data_hash TEXT NOT NULL,
  risk_score FLOAT,
  diagnosis_context JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- WORM: INSERT only, no UPDATE/DELETE allowed
-- ---------------------------------------------------------------------------

ALTER TABLE public.approval_audit_logs ENABLE ROW LEVEL SECURITY;

-- スタッフは自組織のログを INSERT できる
CREATE POLICY "approval_audit_insert" ON public.approval_audit_logs
  FOR INSERT WITH CHECK (
    org_id = (SELECT org_id FROM public.staff WHERE id = auth.uid())
  );

-- スタッフは自組織のログを SELECT できる（読み取り専用）
CREATE POLICY "approval_audit_select" ON public.approval_audit_logs
  FOR SELECT USING (
    org_id = (SELECT org_id FROM public.staff WHERE id = auth.uid())
  );

-- UPDATE ポリシーなし
-- DELETE ポリシーなし
-- これにより WORM (Write Once Read Many) を実現

-- ---------------------------------------------------------------------------
-- インデックス
-- ---------------------------------------------------------------------------

CREATE INDEX idx_approval_audit_athlete
  ON public.approval_audit_logs(athlete_id, created_at DESC);

CREATE INDEX idx_approval_audit_org
  ON public.approval_audit_logs(org_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- テーブルコメント
-- ---------------------------------------------------------------------------

COMMENT ON TABLE public.approval_audit_logs IS
  'WORM (Write Once Read Many) 監査ログ — SaMD コンプライアンス対応。INSERT のみ許可。UPDATE / DELETE は RLS ポリシー不在により禁止。';

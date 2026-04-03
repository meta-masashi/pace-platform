-- =========================================================================
-- RLS 追加: rate_limit_log, athlete_invites
-- セキュリティ監査で RLS 未設定が指摘されたテーブルに対するポリシー追加
-- =========================================================================

-- -------------------------------------------------------------------------
-- rate_limit_log — サーバーサイドのみ書き込み。クライアントからのアクセス禁止
-- -------------------------------------------------------------------------
ALTER TABLE public.rate_limit_log ENABLE ROW LEVEL SECURITY;

-- サービスロールのみ INSERT/SELECT/DELETE 可能（レート制限はサーバーサイド処理）
-- anon / authenticated ユーザーはアクセス不可
CREATE POLICY "rate_limit_log_service_only"
  ON public.rate_limit_log
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- -------------------------------------------------------------------------
-- athlete_invites — スタッフが作成・参照、選手が使用
-- -------------------------------------------------------------------------
ALTER TABLE public.athlete_invites ENABLE ROW LEVEL SECURITY;

-- スタッフは自組織の招待を参照可能
CREATE POLICY "athlete_invites_select_staff"
  ON public.athlete_invites
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM public.staff WHERE id = auth.uid() AND is_active = true
    )
  );

-- スタッフは自組織の招待を作成可能
CREATE POLICY "athlete_invites_insert_staff"
  ON public.athlete_invites
  FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM public.staff WHERE id = auth.uid() AND is_active = true
    )
  );

-- 招待コード使用時の更新（used_at, used_by_athlete_id）— 選手がコードを使用
CREATE POLICY "athlete_invites_update_use"
  ON public.athlete_invites
  FOR UPDATE
  USING (
    -- 未使用の招待のみ更新可能
    used_at IS NULL
    AND expires_at > now()
  )
  WITH CHECK (
    used_at IS NOT NULL
    AND used_by_athlete_id IS NOT NULL
  );

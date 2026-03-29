-- ============================================================
-- PACE Platform — S2S（Server-to-Server）連携テーブル
--
-- 外部デバイスプロバイダー（Catapult, Kinexon 等）との
-- マシン間 API 連携に必要なテーブルを作成する。
-- ============================================================

-- ---------------------------------------------------------------------------
-- S2S API 資格情報（組織 × プロバイダー ごとに管理）
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.s2s_credentials (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  api_key_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.staff(id),
  CONSTRAINT unique_org_provider UNIQUE (org_id, provider)
);

COMMENT ON TABLE public.s2s_credentials IS
  'S2S API 資格情報。各組織がプロバイダーごとに1つの API キーを持つ。キーは SHA-256 ハッシュで保存。';

COMMENT ON COLUMN public.s2s_credentials.api_key_hash IS
  'API キーの SHA-256 ハッシュ。平文は保存しない。';

-- ---------------------------------------------------------------------------
-- 外部アスリートID マッピング
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.athlete_external_ids (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  athlete_id UUID NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  external_id TEXT NOT NULL,
  external_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_athlete_provider UNIQUE (athlete_id, provider),
  CONSTRAINT unique_external_id_provider UNIQUE (provider, external_id)
);

COMMENT ON TABLE public.athlete_external_ids IS
  '外部デバイスプロバイダーのアスリートIDと内部 athletes テーブルの紐づけマッピング。';

-- ---------------------------------------------------------------------------
-- RLS ポリシー
-- ---------------------------------------------------------------------------

ALTER TABLE public.s2s_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.athlete_external_ids ENABLE ROW LEVEL SECURITY;

-- s2s_credentials: master ロールのみ管理可能
CREATE POLICY "s2s_creds_master_select" ON public.s2s_credentials
  FOR SELECT USING (
    org_id = (SELECT org_id FROM public.staff WHERE id = auth.uid())
    AND (SELECT role FROM public.staff WHERE id = auth.uid()) = 'master'
  );

CREATE POLICY "s2s_creds_master_insert" ON public.s2s_credentials
  FOR INSERT WITH CHECK (
    org_id = (SELECT org_id FROM public.staff WHERE id = auth.uid())
    AND (SELECT role FROM public.staff WHERE id = auth.uid()) = 'master'
  );

CREATE POLICY "s2s_creds_master_update" ON public.s2s_credentials
  FOR UPDATE USING (
    org_id = (SELECT org_id FROM public.staff WHERE id = auth.uid())
    AND (SELECT role FROM public.staff WHERE id = auth.uid()) = 'master'
  );

CREATE POLICY "s2s_creds_master_delete" ON public.s2s_credentials
  FOR DELETE USING (
    org_id = (SELECT org_id FROM public.staff WHERE id = auth.uid())
    AND (SELECT role FROM public.staff WHERE id = auth.uid()) = 'master'
  );

-- s2s_credentials: サービスロールは検証のためアクセス可能
CREATE POLICY "s2s_creds_service_select" ON public.s2s_credentials
  FOR SELECT USING (
    auth.role() = 'service_role'
  );

-- athlete_external_ids: 同組織のスタッフがアクセス可能
CREATE POLICY "athlete_ext_ids_org_select" ON public.athlete_external_ids
  FOR SELECT USING (
    athlete_id IN (
      SELECT id FROM public.athletes
      WHERE org_id = (SELECT org_id FROM public.staff WHERE id = auth.uid())
    )
  );

CREATE POLICY "athlete_ext_ids_org_insert" ON public.athlete_external_ids
  FOR INSERT WITH CHECK (
    athlete_id IN (
      SELECT id FROM public.athletes
      WHERE org_id = (SELECT org_id FROM public.staff WHERE id = auth.uid())
    )
  );

CREATE POLICY "athlete_ext_ids_org_update" ON public.athlete_external_ids
  FOR UPDATE USING (
    athlete_id IN (
      SELECT id FROM public.athletes
      WHERE org_id = (SELECT org_id FROM public.staff WHERE id = auth.uid())
    )
  );

CREATE POLICY "athlete_ext_ids_org_delete" ON public.athlete_external_ids
  FOR DELETE USING (
    athlete_id IN (
      SELECT id FROM public.athletes
      WHERE org_id = (SELECT org_id FROM public.staff WHERE id = auth.uid())
    )
  );

-- athlete_external_ids: サービスロールからのアクセス
CREATE POLICY "athlete_ext_ids_service" ON public.athlete_external_ids
  FOR SELECT USING (
    auth.role() = 'service_role'
  );

-- ---------------------------------------------------------------------------
-- インデックス
-- ---------------------------------------------------------------------------

CREATE INDEX idx_s2s_creds_org
  ON public.s2s_credentials(org_id, provider);

CREATE INDEX idx_s2s_creds_hash
  ON public.s2s_credentials(api_key_hash)
  WHERE is_active = true;

CREATE INDEX idx_athlete_ext_ids_provider
  ON public.athlete_external_ids(provider, external_id);

CREATE INDEX idx_athlete_ext_ids_athlete
  ON public.athlete_external_ids(athlete_id);

-- ---------------------------------------------------------------------------
-- daily_metrics にデバイスメトリクス列を追加（存在しなければ）
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'daily_metrics'
    AND column_name = 'device_metrics'
  ) THEN
    ALTER TABLE public.daily_metrics
    ADD COLUMN device_metrics JSONB;
    COMMENT ON COLUMN public.daily_metrics.device_metrics IS
      'S2S 連携で取得した外部デバイスメトリクス（プロバイダー・距離・スプリント等）。';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'daily_metrics'
    AND column_name = 'heart_rate_avg'
  ) THEN
    ALTER TABLE public.daily_metrics ADD COLUMN heart_rate_avg FLOAT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'daily_metrics'
    AND column_name = 'heart_rate_max'
  ) THEN
    ALTER TABLE public.daily_metrics ADD COLUMN heart_rate_max FLOAT;
  END IF;
END
$$;

-- ============================================================
-- PACE Platform — カレンダー接続テーブル
-- Migration: 016_calendar_connections
--
-- Google Calendar OAuth トークンを暗号化して保存する。
-- AES-256-GCM で暗号化されたトークンのみが格納される。
-- ============================================================

CREATE TABLE IF NOT EXISTS public.calendar_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'google' CHECK (provider IN ('google')),
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT,
  token_expiry TIMESTAMPTZ,
  calendar_id TEXT DEFAULT 'primary',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_staff_provider UNIQUE (staff_id, provider)
);

-- Row Level Security
ALTER TABLE public.calendar_connections ENABLE ROW LEVEL SECURITY;

-- スタッフは自身の接続情報のみ読み書き可能
CREATE POLICY "calendar_connections_own"
  ON public.calendar_connections
  FOR ALL
  USING (staff_id = auth.uid());

-- updated_at 自動更新トリガー
CREATE OR REPLACE FUNCTION public.update_calendar_connections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calendar_connections_updated_at
  BEFORE UPDATE ON public.calendar_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_calendar_connections_updated_at();

-- インデックス: staff_id + provider による高速検索
CREATE INDEX IF NOT EXISTS idx_calendar_connections_staff_provider
  ON public.calendar_connections (staff_id, provider);

COMMENT ON TABLE public.calendar_connections IS 'Google Calendar OAuth トークンの暗号化保存';
COMMENT ON COLUMN public.calendar_connections.access_token_encrypted IS 'AES-256-GCM 暗号化済みアクセストークン';
COMMENT ON COLUMN public.calendar_connections.refresh_token_encrypted IS 'AES-256-GCM 暗号化済みリフレッシュトークン';

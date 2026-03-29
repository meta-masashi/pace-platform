-- ========================================
-- PACE v3.2 — 通知プリファレンス
-- 朝のアジェンダ通知（6:30 AM JST）の設定を管理する。
-- 前提: 002_staff_athletes.sql, 001_organizations_teams.sql 実行済み
-- ========================================

-- ========================================
-- notification_preferences テーブル
-- スタッフごと・チャネルごとの通知設定
-- ========================================
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id   UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  org_id     UUID NOT NULL REFERENCES public.organizations(id),
  channel    TEXT NOT NULL CHECK (channel IN ('email', 'slack', 'web_push')),
  enabled    BOOLEAN NOT NULL DEFAULT true,
  config     JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_staff_channel UNIQUE (staff_id, channel)
);

-- updated_at 自動更新トリガー
DROP TRIGGER IF EXISTS handle_updated_at ON public.notification_preferences;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ========================================
-- RLS の有効化
-- ========================================
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- 自分の通知設定のみ参照・操作可能
CREATE POLICY "notification_prefs_own" ON public.notification_preferences
  FOR ALL USING (staff_id = auth.uid());

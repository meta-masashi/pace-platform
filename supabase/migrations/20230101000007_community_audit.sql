-- ========================================
-- PACE v3.0 — コミュニティ・監査ログ
-- 実行手順: Supabase ダッシュボード → SQL エディタ → 実行 → 「実行完了」と返信
-- 前提: 002_staff_athletes.sql 実行済み
-- ========================================

-- ========================================
-- channels テーブル（Slack風コミュニティ）
-- ========================================
CREATE TABLE IF NOT EXISTS public.channels (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  team_id     UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'team'
                CHECK (type IN ('medical', 'team', 's_and_c', 'rehab', 'general')),
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT now() NOT NULL
);

DROP TRIGGER IF EXISTS handle_updated_at ON public.channels;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.channels
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ========================================
-- messages テーブル
-- ========================================
CREATE TABLE IF NOT EXISTS public.messages (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id       UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  org_id           UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  staff_id         UUID NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  content          TEXT,
  attachments_json JSONB DEFAULT '[]',     -- SOAPステータスマーカー付き添付等
  created_at       TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at       TIMESTAMPTZ DEFAULT now() NOT NULL
);

DROP TRIGGER IF EXISTS handle_updated_at ON public.messages;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ========================================
-- audit_logs テーブル（HIPAA準拠: 全操作を記録）
-- ========================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id        UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  staff_id      UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  action        TEXT NOT NULL,               -- 'create' | 'update' | 'delete' | 'read' | 'login' 等
  target_type   TEXT NOT NULL,               -- テーブル名（例: 'athletes', 'soap_notes'）
  target_id     UUID,
  details_json  JSONB DEFAULT '{}',          -- 変更前後の差分等
  ip_address    INET,
  user_agent    TEXT,
  timestamp     TIMESTAMPTZ DEFAULT now() NOT NULL
  -- audit_logs は更新不可（INSERT ONLY）のため updated_at カラムなし
);

-- ========================================
-- 監査ログへの INSERT 専用トリガー（UPDATE/DELETE 禁止）
-- ========================================
CREATE OR REPLACE FUNCTION public.prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs への UPDATE/DELETE は禁止されています。';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prevent_audit_modification ON public.audit_logs;
CREATE TRIGGER prevent_audit_modification
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_log_modification();

-- ========================================
-- パフォーマンスインデックス
-- ========================================

-- コミュニティ: チャンネル別メッセージ取得（時系列降順）
CREATE INDEX IF NOT EXISTS idx_messages_channel_created
  ON public.messages (channel_id, created_at DESC);

-- 監査ログ: org 単位の時系列検索
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_timestamp
  ON public.audit_logs (org_id, timestamp DESC);

-- 監査ログ: staff 操作履歴検索
CREATE INDEX IF NOT EXISTS idx_audit_logs_staff_timestamp
  ON public.audit_logs (staff_id, timestamp DESC);

-- 監査ログ: エンティティ別操作履歴（セキュリティ調査用）
CREATE INDEX IF NOT EXISTS idx_audit_logs_target
  ON public.audit_logs (target_type, target_id, timestamp DESC);

-- ========================================
-- RLS の有効化
-- ========================================
ALTER TABLE public.channels    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs  ENABLE ROW LEVEL SECURITY;

-- ※ ポリシー詳細は 008_rls_policies.sql で定義

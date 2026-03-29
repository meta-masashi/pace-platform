-- ============================================================
-- 013_billing_tables.sql
-- PACE v3.0 — 決済・サブスクリプション管理テーブル
-- ============================================================
-- 実行手順:
--   Supabase ダッシュボード → SQL エディタ → このファイルの内容を貼り付けて実行
--   ※ 自動実行禁止。手動でのみ実行すること。
-- ============================================================

-- ============================================================
-- 1. subscriptions テーブル
--    テナント（org）単位のサブスクリプション状態管理
-- ============================================================

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                     UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id                 UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Stripe 識別子
  stripe_customer_id     TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,

  -- プラン
  plan                   TEXT NOT NULL DEFAULT 'starter'
                           CHECK (plan IN ('starter', 'pro', 'enterprise')),

  -- ステータス
  -- 'active'    : 正常稼働中
  -- 'trialing'  : トライアル中
  -- 'past_due'  : 支払い失敗（Dunning 進行中）
  -- 'read_only' : 読み取り専用モード（Dunning Day 7）
  -- 'canceled'  : 解約済み（データは保持）
  -- 'unpaid'    : 未払い停止
  -- 'inactive'  : 未契約
  status                 TEXT NOT NULL DEFAULT 'inactive'
                           CHECK (status IN ('active', 'trialing', 'past_due', 'read_only', 'canceled', 'unpaid', 'inactive')),

  -- 現在の契約期間
  current_period_start   TIMESTAMPTZ,
  current_period_end     TIMESTAMPTZ,

  -- 期末解約フラグ（データ保持ポリシー: 即時削除ではなく期末解約）
  cancel_at_period_end   BOOLEAN NOT NULL DEFAULT FALSE,

  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_subscriptions_org_id
  ON public.subscriptions (org_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id
  ON public.subscriptions (stripe_customer_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_status
  ON public.subscriptions (status);

-- updated_at 自動更新トリガー
CREATE OR REPLACE FUNCTION public.update_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_subscriptions_updated_at();

-- ============================================================
-- 2. stripe_events テーブル
--    Webhook 冪等性保証（同一イベントの二重処理防止）
-- ============================================================

CREATE TABLE IF NOT EXISTS public.stripe_events (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  stripe_event_id TEXT NOT NULL UNIQUE,  -- 冪等性キー（Stripe イベント ID）
  event_type      TEXT NOT NULL,
  processed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stripe_events_stripe_event_id
  ON public.stripe_events (stripe_event_id);

CREATE INDEX IF NOT EXISTS idx_stripe_events_processed_at
  ON public.stripe_events (processed_at);

-- 古いイベントは 90 日後に削除（ストレージ節約）
-- ※ pg_cron が利用可能な場合は以下のジョブを登録すること:
-- SELECT cron.schedule('cleanup-stripe-events', '0 3 * * *',
--   $$DELETE FROM public.stripe_events WHERE processed_at < NOW() - INTERVAL '90 days'$$);

-- ============================================================
-- 3. dunning_schedules テーブル
--    支払い失敗後の段階的通知・制限スケジュール
-- ============================================================

CREATE TABLE IF NOT EXISTS public.dunning_schedules (
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  stripe_customer_id   TEXT NOT NULL UNIQUE,  -- 1顧客につき1アクティブスケジュール
  org_id               UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- 支払い失敗情報
  failed_at            TIMESTAMPTZ NOT NULL,
  attempt_count        INTEGER NOT NULL DEFAULT 1,

  -- 処理済みフラグ（null = 未処理）
  day1_sent_at         TIMESTAMPTZ,   -- Day 1: メール送信済み
  day3_sent_at         TIMESTAMPTZ,   -- Day 3: 2回目メール + Slack 送信済み
  day7_restricted_at   TIMESTAMPTZ,   -- Day 7: 読み取り専用モードに移行済み
  day14_canceled_at    TIMESTAMPTZ,   -- Day 14: サブスクリプション停止済み

  -- 解決済みフラグ（支払い成功時に更新）
  resolved_at          TIMESTAMPTZ,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_dunning_schedules_stripe_customer_id
  ON public.dunning_schedules (stripe_customer_id);

CREATE INDEX IF NOT EXISTS idx_dunning_schedules_org_id
  ON public.dunning_schedules (org_id);

-- 未解決スケジュールの検索用インデックス
CREATE INDEX IF NOT EXISTS idx_dunning_schedules_unresolved
  ON public.dunning_schedules (resolved_at)
  WHERE resolved_at IS NULL;

-- updated_at 自動更新トリガー
CREATE OR REPLACE FUNCTION public.update_dunning_schedules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_dunning_schedules_updated_at ON public.dunning_schedules;
CREATE TRIGGER trg_dunning_schedules_updated_at
  BEFORE UPDATE ON public.dunning_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_dunning_schedules_updated_at();

-- ============================================================
-- 4. RLS（Row Level Security）
--    テナント分離: org_id による行レベルセキュリティ
-- ============================================================

-- subscriptions RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- 自組織のサブスクリプションのみ参照可能
-- NOTE: staff テーブルの主キー id = Supabase Auth uid であるため
--       user_id ではなく id = auth.uid() を使用する（002_staff_athletes.sql 準拠）
CREATE POLICY IF NOT EXISTS "subscriptions_select_own_org"
  ON public.subscriptions
  FOR SELECT
  USING (
    org_id = public.get_my_org_id()
  );

-- stripe_events は Service Role のみ（RLS は無効にしない）
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;

-- Service Role（Webhook ハンドラー）のみ書き込み可能
-- 一般ユーザーは参照・更新不可
CREATE POLICY IF NOT EXISTS "stripe_events_service_role_only"
  ON public.stripe_events
  FOR ALL
  USING (false)  -- デフォルト拒否（Service Role は RLS をバイパス）
  WITH CHECK (false);

-- dunning_schedules RLS
ALTER TABLE public.dunning_schedules ENABLE ROW LEVEL SECURITY;

-- 自組織のみ参照可能（master ロールのみ閲覧許可）
-- NOTE: staff テーブルの主キー id = Supabase Auth uid であるため
--       user_id ではなく get_my_org_id() ヘルパーを使用する（008_rls_policies.sql 準拠）
CREATE POLICY IF NOT EXISTS "dunning_schedules_select_own_org"
  ON public.dunning_schedules
  FOR SELECT
  USING (
    org_id = public.get_my_org_id()
    AND public.is_master()
  );

-- ============================================================
-- 実行確認
-- ============================================================
-- 以下のクエリで作成されたテーブルを確認:
-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public'
--     AND table_name IN ('subscriptions', 'stripe_events', 'dunning_schedules');

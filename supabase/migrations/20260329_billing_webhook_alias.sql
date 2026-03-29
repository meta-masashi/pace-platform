-- =============================================================================
-- Migration: 20260329_billing_webhook_alias.sql
-- 説明:
--   1. stripe_webhook_events ビュー:
--      src/app/api/stripe/webhook/route.ts が参照する stripe_webhook_events を
--      stripe_events のエイリアスビューとして定義し、互換性を確保する。
--      ※ 013_billing_tables.sql で定義された stripe_events テーブルが前提。
--
--   2. subscriptions テーブルへの plan_name カラム追加:
--      既存の plan カラムに加え、plan_name カラムを追加して
--      スキルテンプレート（08-billing）との互換性を確保する。
--
-- 冪等性: CREATE OR REPLACE VIEW / ADD COLUMN IF NOT EXISTS で何度実行しても安全。
-- 実行方法: Supabase Dashboard > SQL Editor に貼り付けて実行
-- =============================================================================

-- =============================================================================
-- 1. stripe_webhook_events ビュー（stripe_events の互換エイリアス）
-- =============================================================================

-- NOTE: Next.js App Router の Webhook ハンドラーは stripe_webhook_events テーブルを
-- 参照していたが、実際の永続化先は stripe_events テーブル（013_billing_tables.sql）。
-- 本ビューにより既存クエリを変更せずに参照可能にする。
-- ただし、src/app/api/stripe/webhook/route.ts は stripe_events に統一済み（本 PR で修正）。

CREATE OR REPLACE VIEW public.stripe_webhook_events AS
SELECT
  id,
  stripe_event_id,
  event_type,
  processed_at
FROM public.stripe_events;

COMMENT ON VIEW public.stripe_webhook_events IS
  'stripe_events テーブルの互換エイリアスビュー。'
  '外部コードが stripe_webhook_events を参照する場合の後方互換性確保用。';

-- =============================================================================
-- 2. subscriptions テーブル — plan_name カラムの追加（後方互換）
-- =============================================================================

-- plan カラムが既存だが、スキルテンプレートは plan_name を使用するため
-- 計算カラムとして plan の値を反映する。
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS plan_name TEXT GENERATED ALWAYS AS (plan) STORED;

COMMENT ON COLUMN public.subscriptions.plan_name IS
  'plan カラムの計算カラム（後方互換）。'
  'スキルテンプレート（08-billing）との互換性のために追加。';

-- =============================================================================
-- 3. subscriptions テーブル — user_id カラム（個人ユーザー向け拡張）
-- =============================================================================

-- 現在の PACE Platform は org_id 単位で管理しているが、
-- 将来的な個人プラン対応のために user_id カラムを追加（NULL 許容）。
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS user_id UUID NULL
    REFERENCES public.staff(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.subscriptions.user_id IS
  '個人ユーザー向けサブスクリプションの場合に staff.id を格納。'
  '組織プランでは NULL。将来の個人プラン対応用。';

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id
  ON public.subscriptions (user_id)
  WHERE user_id IS NOT NULL;

-- =============================================================================
-- 実行確認クエリ（コメントを外して確認）
-- =============================================================================
-- SELECT table_name, table_type
-- FROM information_schema.tables
-- WHERE table_schema = 'public'
--   AND table_name IN ('stripe_events', 'stripe_webhook_events', 'subscriptions');
--
-- SELECT column_name, data_type, is_generated
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'subscriptions'
-- ORDER BY ordinal_position;

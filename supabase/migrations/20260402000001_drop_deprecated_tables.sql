-- ==========================================================================
-- PA-001-2: 廃止テーブル DROP SQL
--
-- 変更指示書 v3.2 に従い、TeleHealth / Insurance Billing 機能を廃止。
-- 本マイグレーションは手動実行用。実行前にバックアップを取得すること。
--
-- 対象テーブル:
--   - telehealth_audit_log       (TeleHealth 監査ログ)
--   - telehealth_consent_records (TeleHealth 同意記録)
--   - telehealth_sessions        (TeleHealth セッション管理)
--   - billing_claims              (保険請求レコード)
--   - billing_codes               (保険請求コードマスタ)
--
-- 実行日: ____-__-__
-- 実行者: ____________
-- ==========================================================================

-- -------------------------------------------------------------------------
-- 1. 依存する RLS ポリシーを先に DROP（存在する場合のみ）
-- -------------------------------------------------------------------------

DO $$
BEGIN
  -- telehealth_audit_log（依存テーブルを先に削除）
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'telehealth_audit_log') THEN
    EXECUTE 'DROP POLICY IF EXISTS "telehealth_audit_log_select" ON public.telehealth_audit_log';
    EXECUTE 'DROP POLICY IF EXISTS "telehealth_audit_log_insert" ON public.telehealth_audit_log';
  END IF;

  -- telehealth_consent_records
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'telehealth_consent_records') THEN
    EXECUTE 'DROP POLICY IF EXISTS "telehealth_consent_records_select" ON public.telehealth_consent_records';
    EXECUTE 'DROP POLICY IF EXISTS "telehealth_consent_records_insert" ON public.telehealth_consent_records';
  END IF;

  -- telehealth_sessions
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'telehealth_sessions') THEN
    EXECUTE 'DROP POLICY IF EXISTS "telehealth_sessions_select" ON public.telehealth_sessions';
    EXECUTE 'DROP POLICY IF EXISTS "telehealth_sessions_insert" ON public.telehealth_sessions';
    EXECUTE 'DROP POLICY IF EXISTS "telehealth_sessions_update" ON public.telehealth_sessions';
    EXECUTE 'DROP POLICY IF EXISTS "telehealth_sessions_delete" ON public.telehealth_sessions';
  END IF;

  -- billing_codes
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'billing_codes') THEN
    EXECUTE 'DROP POLICY IF EXISTS "billing_codes_select" ON public.billing_codes';
    EXECUTE 'DROP POLICY IF EXISTS "billing_codes_insert" ON public.billing_codes';
  END IF;

  -- billing_claims
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'billing_claims') THEN
    EXECUTE 'DROP POLICY IF EXISTS "billing_claims_select" ON public.billing_claims';
    EXECUTE 'DROP POLICY IF EXISTS "billing_claims_insert" ON public.billing_claims';
    EXECUTE 'DROP POLICY IF EXISTS "billing_claims_update" ON public.billing_claims';
  END IF;
END
$$;

-- -------------------------------------------------------------------------
-- 2. テーブル DROP（CASCADE で依存インデックス・トリガーも削除）
-- -------------------------------------------------------------------------

-- 依存順序: audit_log → consent_records → sessions（FK 依存）
DROP TABLE IF EXISTS public.telehealth_audit_log CASCADE;
DROP TABLE IF EXISTS public.telehealth_consent_records CASCADE;
DROP TABLE IF EXISTS public.telehealth_sessions CASCADE;
-- billing: claims が codes を参照する可能性あり
DROP TABLE IF EXISTS public.billing_claims CASCADE;
DROP TABLE IF EXISTS public.billing_codes CASCADE;

-- -------------------------------------------------------------------------
-- 3. 関連する ENUM 型があれば DROP
-- -------------------------------------------------------------------------

DROP TYPE IF EXISTS public.telehealth_status CASCADE;
DROP TYPE IF EXISTS public.billing_claim_status CASCADE;

-- -------------------------------------------------------------------------
-- 確認クエリ（実行後に手動で確認）
-- -------------------------------------------------------------------------
-- SELECT tablename FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename IN ('telehealth_sessions', 'telehealth_consent_records',
--                      'telehealth_audit_log', 'billing_codes', 'billing_claims');
-- → 0 行であること

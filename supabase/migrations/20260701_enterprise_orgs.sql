-- =============================================================================
-- Migration: 20260701_enterprise_orgs.sql
-- Phase:     PACE Platform Phase 4 Sprint 1
-- Date:      2026-07-01
-- Author:    PACE Platform Engineering
-- 冪等性:    IF NOT EXISTS / CREATE OR REPLACE / ALTER TYPE ADD VALUE IF NOT EXISTS /
--            DROP POLICY IF EXISTS を使用。何度実行しても安全。
-- Description:
--   Enterprise プランのマルチ組織管理機能を追加する。
--   - plan_type ENUM に 'enterprise' 値を追加
--   - organizations テーブルに親組織・CV アドオン関連カラムを追加
--   - staff テーブルに Enterprise 管理者フラグを追加
--   - Enterprise 管理者向け RLS ポリシーを追加
--   - ヘルパー関数 current_org_id() / is_enterprise_admin() を追加
--   - 親組織 ID インデックスを追加
-- =============================================================================

-- =============================================================================
-- 1. plan_type ENUM に 'enterprise' を追加
--    PostgreSQL 12 以降では IF NOT EXISTS が使用可能
-- =============================================================================
ALTER TYPE plan_type ADD VALUE IF NOT EXISTS 'enterprise';

COMMENT ON TYPE plan_type IS
  'Organizations のプランタイプ。pro / standard / enterprise の 3 種類。';

-- =============================================================================
-- 2. organizations テーブルへのカラム追加
-- =============================================================================

-- 2-1. Enterprise 親組織への外部キー
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS parent_organization_id UUID NULL
    REFERENCES organizations(id) ON DELETE SET NULL;

COMMENT ON COLUMN organizations.parent_organization_id IS
  'Enterprise プランにおける親組織の ID。NULL の場合は独立組織またはルート Enterprise 組織。';

-- 2-2. CV 解析アドオン有効フラグ
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS cv_addon_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN organizations.cv_addon_enabled IS
  'CV（コンピュータビジョン）解析アドオンが有効かどうかを示すフラグ。TRUE の場合のみ動画解析を利用可能。';

-- 2-3. 月次 CV 解析上限本数
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS cv_addon_monthly_limit INTEGER NOT NULL DEFAULT 50;

COMMENT ON COLUMN organizations.cv_addon_monthly_limit IS
  '1 ヶ月あたりの CV 解析上限本数。cv_analysis_usage テーブルの limit_count スナップショットの基準値。';

-- 2-4. CV Addon の Stripe Subscription ID
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS stripe_cv_addon_subscription_id TEXT NULL;

COMMENT ON COLUMN organizations.stripe_cv_addon_subscription_id IS
  'CV アドオンに対応する Stripe Subscription の ID。NULL の場合はアドオン未契約。';

-- 2-5. Enterprise の Stripe Subscription ID
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS stripe_enterprise_subscription_id TEXT NULL;

COMMENT ON COLUMN organizations.stripe_enterprise_subscription_id IS
  'Enterprise プランに対応する Stripe Subscription の ID。NULL の場合は Enterprise プラン未契約。';

-- =============================================================================
-- 3. staff テーブルへのカラム追加
-- =============================================================================

-- 3-1. Enterprise 管理者フラグ
ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS is_enterprise_admin BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN staff.is_enterprise_admin IS
  'Enterprise 管理者であるかどうかを示すフラグ。TRUE の場合、傘下組織（子 org）のデータを横断参照できる。';

-- =============================================================================
-- 4. ヘルパー関数
-- =============================================================================

-- 4-1. current_org_id(): 認証ユーザーの org_id を返す
CREATE OR REPLACE FUNCTION current_org_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id
  FROM   staff
  WHERE  id = auth.uid()
  LIMIT  1;
$$;

COMMENT ON FUNCTION current_org_id() IS
  'auth.uid() に対応する staff レコードの org_id を返す。'
  'staff に存在しない場合は NULL を返す。RLS ポリシー内で使用する。';

-- 4-2. is_enterprise_admin(): 認証ユーザーが Enterprise 管理者かどうかを返す
CREATE OR REPLACE FUNCTION is_enterprise_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_enterprise_admin
     FROM   staff
     WHERE  id = auth.uid()
     LIMIT  1),
    FALSE
  );
$$;

COMMENT ON FUNCTION is_enterprise_admin() IS
  'auth.uid() に対応する staff レコードの is_enterprise_admin フラグを返す。'
  'レコードが存在しない場合は FALSE を返す。RLS ポリシー内で使用する。';

-- =============================================================================
-- 5. インデックス
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_organizations_parent_org_id
  ON organizations(parent_organization_id);

COMMENT ON INDEX idx_organizations_parent_org_id IS
  '親組織 ID による子組織一覧取得を高速化するためのインデックス。';

-- =============================================================================
-- 6. Enterprise 管理者用 RLS ポリシー
-- =============================================================================

-- RLS が有効になっていることを確認（既存マイグレーションで設定済みだが念のため）
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams         ENABLE ROW LEVEL SECURITY;

-- athletes テーブルが存在する場合のみ RLS を有効化
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'athletes'
  ) THEN
    EXECUTE 'ALTER TABLE athletes ENABLE ROW LEVEL SECURITY';
  END IF;
END;
$$;

-- 6-1. organizations テーブル: enterprise admin は傘下 organizations を参照可
DROP POLICY IF EXISTS enterprise_admin_can_read_child_orgs ON organizations;
CREATE POLICY enterprise_admin_can_read_child_orgs
  ON organizations
  FOR SELECT
  USING (
    -- Enterprise 管理者であり、かつ対象 org が自分の org の子組織である場合
    is_enterprise_admin()
    AND parent_organization_id = current_org_id()
  );

COMMENT ON POLICY enterprise_admin_can_read_child_orgs ON organizations IS
  'Enterprise 管理者（is_enterprise_admin = TRUE）が、自組織を親とする子組織を参照できるポリシー。';

-- 6-2. teams テーブル: enterprise admin は傘下 teams を参照可
DROP POLICY IF EXISTS enterprise_admin_can_read_child_teams ON teams;
CREATE POLICY enterprise_admin_can_read_child_teams
  ON teams
  FOR SELECT
  USING (
    -- Enterprise 管理者であり、かつ対象 team が傘下組織に属している場合
    is_enterprise_admin()
    AND org_id IN (
      SELECT id
      FROM   organizations
      WHERE  parent_organization_id = current_org_id()
    )
  );

COMMENT ON POLICY enterprise_admin_can_read_child_teams ON teams IS
  'Enterprise 管理者（is_enterprise_admin = TRUE）が、傘下組織に属するチームを参照できるポリシー。';

-- 6-3. athletes テーブル: enterprise admin は傘下 athletes を参照可
--      athletes テーブルが存在する場合のみ作成
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'athletes'
  ) THEN
    -- 既存ポリシーを DROP してから再作成（冪等）
    EXECUTE 'DROP POLICY IF EXISTS enterprise_admin_can_read_child_athletes ON athletes';
    EXECUTE $policy$
      CREATE POLICY enterprise_admin_can_read_child_athletes
        ON athletes
        FOR SELECT
        USING (
          is_enterprise_admin()
          AND org_id IN (
            SELECT id
            FROM   organizations
            WHERE  parent_organization_id = current_org_id()
          )
        )
    $policy$;

    EXECUTE $comment$
      COMMENT ON POLICY enterprise_admin_can_read_child_athletes ON athletes IS
        'Enterprise 管理者（is_enterprise_admin = TRUE）が、傘下組織に属するアスリートを参照できるポリシー。'
    $comment$;
  END IF;
END;
$$;

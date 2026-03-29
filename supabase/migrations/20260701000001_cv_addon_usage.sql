-- =============================================================================
-- Migration: 20260701_cv_addon_usage.sql
-- Phase:     PACE Platform Phase 4 Sprint 1
-- Date:      2026-07-01
-- Author:    PACE Platform Engineering
-- 冪等性:    CREATE TABLE IF NOT EXISTS / CREATE OR REPLACE FUNCTION /
--            DROP POLICY IF EXISTS を使用。何度実行しても安全。
--            ※ このファイルは 20260701_enterprise_orgs.sql の後に実行すること。
--              (organizations.cv_addon_enabled カラムへの依存あり)
-- Description:
--   CV アドオンの月次利用量管理テーブルおよび関連関数・ポリシーを追加する。
--   - cv_analysis_usage テーブルの作成
--   - get_cv_usage_this_month() 関数: 当月の解析本数を返す
--   - increment_cv_usage() 関数: 解析本数をインクリメントし上限チェックを行う
--   - RLS ポリシー: organizations の master ロールのみ自チームの usage を参照可
--   - インデックス: (org_id, usage_month) の複合インデックス
-- =============================================================================

-- =============================================================================
-- 1. cv_analysis_usage テーブルの作成
-- =============================================================================
CREATE TABLE IF NOT EXISTS cv_analysis_usage (
  id             UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id         UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- 月初日（例: 2026-07-01）で月を一意に識別する
  usage_month    DATE        NOT NULL,
  -- 当月の解析実行本数（increment_cv_usage() により加算される）
  analysis_count INTEGER     NOT NULL DEFAULT 0,
  -- 上限本数（organizations.cv_addon_monthly_limit のスナップショット）
  -- 月中に organizations 側の上限を変更しても当月の上限には影響しない
  limit_count    INTEGER     NOT NULL DEFAULT 50,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 1 組織 × 1 ヶ月 につき 1 レコードのみ許可
  UNIQUE (org_id, usage_month)
);

COMMENT ON TABLE cv_analysis_usage IS
  'CV（コンピュータビジョン）解析アドオンの月次利用量を管理するテーブル。'
  '1 組織・1 ヶ月ごとに 1 レコードを持ち、usage_month は月初日（1 日）で表現する。';

COMMENT ON COLUMN cv_analysis_usage.id IS
  'レコードの一意識別子。';

COMMENT ON COLUMN cv_analysis_usage.org_id IS
  'CV アドオンを利用している組織の ID（organizations.id への外部キー）。';

COMMENT ON COLUMN cv_analysis_usage.usage_month IS
  '利用対象月の月初日（例: 2026-07-01）。DATE 型で月を識別する。';

COMMENT ON COLUMN cv_analysis_usage.analysis_count IS
  '当月に実行した CV 解析の累計本数。increment_cv_usage() 関数により +1 される。';

COMMENT ON COLUMN cv_analysis_usage.limit_count IS
  '当月の解析上限本数。レコード初回作成時に organizations.cv_addon_monthly_limit からスナップショットされる。'
  '月中の上限変更は当月分には反映されない（来月以降のレコードに適用される）。';

COMMENT ON COLUMN cv_analysis_usage.created_at IS
  'レコード作成日時（UTC）。';

COMMENT ON COLUMN cv_analysis_usage.updated_at IS
  'レコード最終更新日時（UTC）。analysis_count が更新されるたびに自動更新される。';

-- =============================================================================
-- updated_at 自動更新トリガー
-- =============================================================================
CREATE OR REPLACE FUNCTION _cv_analysis_usage_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION _cv_analysis_usage_set_updated_at() IS
  'cv_analysis_usage の updated_at を UPDATE 時に自動的に現在時刻へ更新するトリガー関数。';

-- トリガーが存在しない場合のみ作成（冪等）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_cv_analysis_usage_updated_at'
      AND tgrelid = 'cv_analysis_usage'::regclass
  ) THEN
    EXECUTE '
      CREATE TRIGGER trg_cv_analysis_usage_updated_at
        BEFORE UPDATE ON cv_analysis_usage
        FOR EACH ROW
        EXECUTE FUNCTION _cv_analysis_usage_set_updated_at()
    ';
  END IF;
END;
$$;

-- =============================================================================
-- 2. インデックス
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_cv_analysis_usage_org_month
  ON cv_analysis_usage(org_id, usage_month);

COMMENT ON INDEX idx_cv_analysis_usage_org_month IS
  '組織 ID と利用月の複合インデックス。月次利用量の取得・更新を高速化する。';

-- =============================================================================
-- 3. get_cv_usage_this_month(org_uuid UUID) 関数
--    当月の cv_analysis_usage.analysis_count を返す。
--    レコードが存在しない場合は 0 を返す。
-- =============================================================================
CREATE OR REPLACE FUNCTION get_cv_usage_this_month(org_uuid UUID)
RETURNS INTEGER
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT analysis_count
      FROM   cv_analysis_usage
      WHERE  org_id      = org_uuid
        AND  usage_month = date_trunc('month', NOW())::DATE
      LIMIT  1
    ),
    0
  );
$$;

COMMENT ON FUNCTION get_cv_usage_this_month(UUID) IS
  '指定した org_uuid の当月 CV 解析本数を返す。'
  'cv_analysis_usage にレコードが存在しない場合は 0 を返す。'
  '引数: org_uuid — 対象組織の UUID。';

-- =============================================================================
-- 4. increment_cv_usage(org_uuid UUID) 関数
--    cv_analysis_usage に UPSERT で analysis_count を +1 する。
--    cv_addon_enabled が FALSE の場合は RAISE EXCEPTION 'CV_ADDON_DISABLED'
--    analysis_count が limit_count 以上の場合は RAISE EXCEPTION 'CV_ADDON_LIMIT_EXCEEDED'
-- =============================================================================
CREATE OR REPLACE FUNCTION increment_cv_usage(org_uuid UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cv_enabled       BOOLEAN;
  v_monthly_limit    INTEGER;
  v_current_month    DATE;
  v_current_count    INTEGER;
BEGIN
  -- 当月の月初日を計算
  v_current_month := date_trunc('month', NOW())::DATE;

  -- organizations テーブルから cv_addon_enabled と cv_addon_monthly_limit を取得
  SELECT cv_addon_enabled, cv_addon_monthly_limit
  INTO   v_cv_enabled, v_monthly_limit
  FROM   organizations
  WHERE  id = org_uuid
  FOR    UPDATE;  -- 同時 UPSERT との競合を防ぐため行ロックを取得

  -- 組織が存在しない場合
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORGANIZATION_NOT_FOUND: org_id=% が見つかりません。', org_uuid;
  END IF;

  -- CV アドオンが有効かチェック
  IF NOT v_cv_enabled THEN
    RAISE EXCEPTION 'CV_ADDON_DISABLED: org_id=% の CV アドオンが無効です。', org_uuid;
  END IF;

  -- 当月レコードの現在のカウントを取得（存在しない場合は 0）
  SELECT COALESCE(analysis_count, 0)
  INTO   v_current_count
  FROM   cv_analysis_usage
  WHERE  org_id      = org_uuid
    AND  usage_month = v_current_month;

  IF NOT FOUND THEN
    v_current_count := 0;
  END IF;

  -- 上限チェック
  IF v_current_count >= v_monthly_limit THEN
    RAISE EXCEPTION 'CV_ADDON_LIMIT_EXCEEDED: org_id=% の当月解析本数が上限（%本）に達しています。現在: %本。',
      org_uuid, v_monthly_limit, v_current_count;
  END IF;

  -- UPSERT で analysis_count を +1
  -- 初回挿入時は limit_count に organizations.cv_addon_monthly_limit をスナップショット
  INSERT INTO cv_analysis_usage (
    org_id,
    usage_month,
    analysis_count,
    limit_count
  )
  VALUES (
    org_uuid,
    v_current_month,
    1,
    v_monthly_limit
  )
  ON CONFLICT (org_id, usage_month)
  DO UPDATE SET
    analysis_count = cv_analysis_usage.analysis_count + 1,
    updated_at     = NOW();
END;
$$;

COMMENT ON FUNCTION increment_cv_usage(UUID) IS
  '指定した org_uuid の当月 CV 解析カウントを 1 増加させる。'
  '事前チェック:'
  '  - cv_addon_enabled が FALSE の場合は CV_ADDON_DISABLED 例外を発生させる。'
  '  - analysis_count >= limit_count の場合は CV_ADDON_LIMIT_EXCEEDED 例外を発生させる。'
  'レコードが存在しない場合は新規挿入（UPSERT）し、limit_count に当時の monthly_limit をスナップショットする。'
  '引数: org_uuid — 対象組織の UUID。';

-- =============================================================================
-- 5. RLS: organizations の master ロールのみ自チームの usage を参照可
-- =============================================================================
ALTER TABLE cv_analysis_usage ENABLE ROW LEVEL SECURITY;

-- 5-1. master ロールのみ自組織の usage を参照可
DROP POLICY IF EXISTS cv_usage_master_can_read ON cv_analysis_usage;
CREATE POLICY cv_usage_master_can_read
  ON cv_analysis_usage
  FOR SELECT
  USING (
    org_id = current_org_id()
    AND EXISTS (
      SELECT 1
      FROM   staff
      WHERE  id   = auth.uid()
        AND  role = 'master'
    )
  );

COMMENT ON POLICY cv_usage_master_can_read ON cv_analysis_usage IS
  'organizations の master ロールを持つスタッフのみ、自組織の CV 解析利用量レコードを参照できる。'
  '他組織のレコードや master 以外のロールからのアクセスは RLS により拒否される。';

-- 5-2. Service Role / SECURITY DEFINER 関数からの書き込みは RLS をバイパスするため INSERT/UPDATE ポリシー不要
--      （increment_cv_usage は SECURITY DEFINER で実行されるため RLS 対象外）

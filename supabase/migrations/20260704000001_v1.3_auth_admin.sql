-- =============================================================================
-- PACE Platform v1.3 — Auth/Admin マイグレーション
-- File:        db-migration-v1.3-auth-admin.sql
-- Date:        2026-04-04
-- Author:      Data Engineer Agent
-- Description: v1.3 で追加されたログイン分離・プラットフォーム管理画面・
--              platform_admin ロール関連の DB スキーマ変更。
--
-- *** 手動実行専用 — 自動実行禁止 ***
-- 実行手順: Supabase ダッシュボード → SQL エディタ → 本ファイルの内容を貼付 → 実行
--
-- 冪等性: IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS を使用。
--         何度実行しても安全。
--
-- 依存: 既存マイグレーション 001〜20260702000002 すべて適用済みであること。
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. platform_admins テーブル
--    PACE 運営会社の管理者アカウント。
--    auth.users とは user_id で紐付け。org_id を持たない（組織横断）。
--    顧客の個別データ（選手・SOAP等）へのアクセスは RLS で禁止。
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.platform_admins (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL UNIQUE,  -- auth.users の id を参照（FK は Supabase Auth スキーマ依存のため宣言的制約のみ）
  email       TEXT        NOT NULL,
  name        TEXT        NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.platform_admins IS
  'PACE 運営会社のプラットフォーム管理者。org_id を持たず、集計ビューのみアクセス可能。';
COMMENT ON COLUMN public.platform_admins.user_id IS
  'Supabase Auth (auth.users) の id。ログイン後に platform_admin か判定するために使用。';

-- updated_at 自動更新トリガー
DO $$ BEGIN
  CREATE TRIGGER trg_platform_admins_updated_at
    BEFORE UPDATE ON public.platform_admins
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- インデックス: user_id は UNIQUE 制約で自動的にインデックス化される
-- email 検索用の追加インデックス
CREATE INDEX IF NOT EXISTS idx_platform_admins_email
  ON public.platform_admins(email);

-- =============================================================================
-- 2. RLS ヘルパー関数: is_platform_admin()
--    auth.uid() が platform_admins テーブルに存在するかを返す。
--    全ての platform_admin 用 RLS ポリシーで使用する。
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.platform_admins
    WHERE  user_id = auth.uid()
  )
$$;

COMMENT ON FUNCTION public.is_platform_admin() IS
  'auth.uid() が platform_admins テーブルに存在するかを返す。'
  'プラットフォーム管理画面の RLS ポリシーで使用。';

-- =============================================================================
-- 3. platform_admins テーブルの RLS
--    platform_admin は自身のレコードのみ閲覧可能。
--    INSERT/UPDATE/DELETE は Service Role のみ（管理者の追加・削除は運営側操作）。
-- =============================================================================

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

-- SELECT: 自分自身のレコードのみ
DROP POLICY IF EXISTS "platform_admins_select_own" ON public.platform_admins;
CREATE POLICY "platform_admins_select_own"
  ON public.platform_admins
  FOR SELECT
  USING (user_id = auth.uid());

-- INSERT/UPDATE/DELETE: Service Role のみ（一般ユーザーは書き込み不可）
DROP POLICY IF EXISTS "platform_admins_deny_write" ON public.platform_admins;
CREATE POLICY "platform_admins_deny_write"
  ON public.platform_admins
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- 注意: 上記 deny_write ポリシーは SELECT 以外の操作をブロック。
-- Service Role（SECURITY DEFINER 関数 or Edge Function の service_role キー）は
-- RLS をバイパスするため、管理者の追加はサーバーサイドから可能。

-- =============================================================================
-- 4. team_invite_codes テーブル
--    選手セルフサインアップ用のチーム招待コード。
--    既存の athlete_invites（1回使い切り個別招待）とは別に、
--    チーム全体の招待コード（複数回使用可能）を管理する。
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.team_invite_codes (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code         TEXT        NOT NULL UNIQUE,   -- ユニークなチーム招待コード
  org_id       UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  team_id      UUID        REFERENCES public.teams(id) ON DELETE CASCADE,
  created_by   UUID        NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  max_uses     INT,                           -- NULL = 無制限
  current_uses INT         NOT NULL DEFAULT 0,
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.team_invite_codes IS
  '選手セルフサインアップ用のチーム招待コード。master ロールのみ生成・管理可能。'
  '有効期限・使用回数上限の設定が可能。athlete_invites（個別招待）とは別管理。';
COMMENT ON COLUMN public.team_invite_codes.code IS
  'チーム招待コード。選手が新規登録時に入力する。ユニーク制約あり。';
COMMENT ON COLUMN public.team_invite_codes.max_uses IS
  '使用回数上限。NULL の場合は無制限。';
COMMENT ON COLUMN public.team_invite_codes.current_uses IS
  '現在の使用回数。選手がコードを使用するたびにインクリメント。';

-- インデックス: コード検索（ログイン時に頻繁に検索）
CREATE INDEX IF NOT EXISTS idx_team_invite_codes_code
  ON public.team_invite_codes(code);

-- インデックス: org_id による一覧取得
CREATE INDEX IF NOT EXISTS idx_team_invite_codes_org_id
  ON public.team_invite_codes(org_id);

-- インデックス: 有効コードのフィルタリング
CREATE INDEX IF NOT EXISTS idx_team_invite_codes_active
  ON public.team_invite_codes(is_active, expires_at)
  WHERE is_active = true;

-- RLS: master ロールのみ CRUD
ALTER TABLE public.team_invite_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_invite_codes_select_master" ON public.team_invite_codes;
CREATE POLICY "team_invite_codes_select_master"
  ON public.team_invite_codes
  FOR SELECT
  USING (
    org_id = public.get_my_org_id() AND public.is_master()
  );

DROP POLICY IF EXISTS "team_invite_codes_insert_master" ON public.team_invite_codes;
CREATE POLICY "team_invite_codes_insert_master"
  ON public.team_invite_codes
  FOR INSERT
  WITH CHECK (
    org_id = public.get_my_org_id() AND public.is_master()
  );

DROP POLICY IF EXISTS "team_invite_codes_update_master" ON public.team_invite_codes;
CREATE POLICY "team_invite_codes_update_master"
  ON public.team_invite_codes
  FOR UPDATE
  USING (
    org_id = public.get_my_org_id() AND public.is_master()
  )
  WITH CHECK (
    org_id = public.get_my_org_id() AND public.is_master()
  );

DROP POLICY IF EXISTS "team_invite_codes_delete_master" ON public.team_invite_codes;
CREATE POLICY "team_invite_codes_delete_master"
  ON public.team_invite_codes
  FOR DELETE
  USING (
    org_id = public.get_my_org_id() AND public.is_master()
  );

-- 選手サインアップ時のコード検証用ポリシー（未認証ユーザーがコードを検証できるよう、
-- anon ロールで有効なコードの存在確認のみ許可する）
-- ※ 実際の検証は Edge Function（Service Role）で行うため、ここでは追加しない。
-- Edge Function が service_role で RLS バイパスしてコードを検証・使用する。

-- =============================================================================
-- 5. platform_admin_audit_logs テーブル（WORM: Write Once Read Many）
--    プラットフォーム管理者の操作を監査ログとして記録。
--    INSERT のみ許可。UPDATE / DELETE は禁止（改ざん防止）。
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.platform_admin_audit_logs (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id  UUID        NOT NULL,  -- platform_admins.user_id を参照
  action         TEXT        NOT NULL,  -- 操作種別（例: 'view_billing', 'approve_plan_change', 'view_usage'）
  target_type    TEXT,                  -- 操作対象の種別（例: 'organization', 'subscription', 'plan_change_request'）
  target_id      TEXT,                  -- 操作対象の ID（UUID or その他の識別子）
  metadata       JSONB       NOT NULL DEFAULT '{}'::jsonb,  -- 追加情報（リクエスト内容等）
  ip_address     INET,                  -- 操作元 IP アドレス
  user_agent     TEXT,                  -- 操作元ブラウザ情報
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
  -- 注意: updated_at カラムは意図的に省略（WORM テーブルのため更新不可）
);

COMMENT ON TABLE public.platform_admin_audit_logs IS
  'プラットフォーム管理者操作の監査ログ（WORM）。INSERT のみ許可、UPDATE/DELETE 禁止。';
COMMENT ON COLUMN public.platform_admin_audit_logs.action IS
  '操作種別。例: view_billing, approve_plan_change, reject_plan_change, view_usage, view_engine_stats';
COMMENT ON COLUMN public.platform_admin_audit_logs.metadata IS
  '操作の追加情報。JSONB 形式。例: {"reason": "...", "before": {...}, "after": {...}}';

-- インデックス: 管理者別の操作履歴検索
CREATE INDEX IF NOT EXISTS idx_platform_admin_audit_logs_admin_user_id
  ON public.platform_admin_audit_logs(admin_user_id, created_at DESC);

-- インデックス: 操作種別での絞り込み
CREATE INDEX IF NOT EXISTS idx_platform_admin_audit_logs_action
  ON public.platform_admin_audit_logs(action, created_at DESC);

-- インデックス: 対象リソースでの検索
CREATE INDEX IF NOT EXISTS idx_platform_admin_audit_logs_target
  ON public.platform_admin_audit_logs(target_type, target_id);

-- インデックス: 時系列検索
CREATE INDEX IF NOT EXISTS idx_platform_admin_audit_logs_created_at
  ON public.platform_admin_audit_logs(created_at DESC);

-- RLS: platform_admin のみ参照可能。INSERT は Service Role 経由。
ALTER TABLE public.platform_admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- SELECT: platform_admin のみ閲覧可（自分の操作ログ含む全ログ）
DROP POLICY IF EXISTS "platform_admin_audit_logs_select" ON public.platform_admin_audit_logs;
CREATE POLICY "platform_admin_audit_logs_select"
  ON public.platform_admin_audit_logs
  FOR SELECT
  USING (public.is_platform_admin());

-- INSERT: platform_admin が自分のログを書き込む
-- ※ admin_user_id が自分自身であることを保証
DROP POLICY IF EXISTS "platform_admin_audit_logs_insert" ON public.platform_admin_audit_logs;
CREATE POLICY "platform_admin_audit_logs_insert"
  ON public.platform_admin_audit_logs
  FOR INSERT
  WITH CHECK (
    public.is_platform_admin()
    AND admin_user_id = auth.uid()
  );

-- UPDATE/DELETE: 完全禁止（WORM 保証）
-- デフォルトの RLS deny で十分だが、明示的にポリシーを作成して意図を明確化
DROP POLICY IF EXISTS "platform_admin_audit_logs_deny_update" ON public.platform_admin_audit_logs;
CREATE POLICY "platform_admin_audit_logs_deny_update"
  ON public.platform_admin_audit_logs
  FOR UPDATE
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "platform_admin_audit_logs_deny_delete" ON public.platform_admin_audit_logs;
CREATE POLICY "platform_admin_audit_logs_deny_delete"
  ON public.platform_admin_audit_logs
  FOR DELETE
  USING (false);

-- WORM 保証の追加レイヤー: トリガーで UPDATE/DELETE を物理的にブロック
CREATE OR REPLACE FUNCTION public.prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'platform_admin_audit_logs は WORM テーブルです。UPDATE/DELETE は禁止されています。';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_platform_admin_audit_update ON public.platform_admin_audit_logs;
CREATE TRIGGER trg_prevent_platform_admin_audit_update
  BEFORE UPDATE OR DELETE ON public.platform_admin_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_log_modification();

-- =============================================================================
-- 6. plan_change_requests テーブル
--    プラン変更依頼の管理。顧客（master ロール）がリクエストし、
--    platform_admin が承認/却下する。
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE plan_change_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.plan_change_requests (
  id              UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID                NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requested_by    UUID                NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  current_plan    TEXT                NOT NULL,  -- リクエスト時点のプラン名
  requested_plan  TEXT                NOT NULL,  -- 希望プラン名
  status          plan_change_status  NOT NULL DEFAULT 'pending',
  notes           TEXT,                          -- リクエスト時の補足（顧客側）
  admin_notes     TEXT,                          -- platform_admin の対応メモ
  created_at      TIMESTAMPTZ         NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ,                   -- 承認/却下の日時
  resolved_by     UUID                           -- platform_admins.user_id（承認/却下した管理者）
);

COMMENT ON TABLE public.plan_change_requests IS
  'プラン変更依頼。master ロールがリクエストし、platform_admin が承認/却下する。';
COMMENT ON COLUMN public.plan_change_requests.current_plan IS
  'リクエスト時点のプラン名（standard/pro/pro_cv/enterprise）。変更後との差分を記録。';
COMMENT ON COLUMN public.plan_change_requests.requested_plan IS
  '希望プラン名（standard/pro/pro_cv/enterprise）。';
COMMENT ON COLUMN public.plan_change_requests.resolved_by IS
  '承認/却下を実施した platform_admin の user_id。';

-- インデックス: 組織別のリクエスト一覧
CREATE INDEX IF NOT EXISTS idx_plan_change_requests_org_id
  ON public.plan_change_requests(org_id, created_at DESC);

-- インデックス: ステータスでのフィルタリング（未処理リクエスト一覧）
CREATE INDEX IF NOT EXISTS idx_plan_change_requests_status
  ON public.plan_change_requests(status)
  WHERE status = 'pending';

-- インデックス: 処理済みリクエストの時系列検索
CREATE INDEX IF NOT EXISTS idx_plan_change_requests_resolved_at
  ON public.plan_change_requests(resolved_at DESC)
  WHERE resolved_at IS NOT NULL;

-- RLS
ALTER TABLE public.plan_change_requests ENABLE ROW LEVEL SECURITY;

-- SELECT: master ロールは自組織のリクエストを閲覧可 / platform_admin は全件閲覧可
DROP POLICY IF EXISTS "plan_change_requests_select_master" ON public.plan_change_requests;
CREATE POLICY "plan_change_requests_select_master"
  ON public.plan_change_requests
  FOR SELECT
  USING (
    (org_id = public.get_my_org_id() AND public.is_master())
    OR public.is_platform_admin()
  );

-- INSERT: master ロールが自組織のリクエストを作成
DROP POLICY IF EXISTS "plan_change_requests_insert_master" ON public.plan_change_requests;
CREATE POLICY "plan_change_requests_insert_master"
  ON public.plan_change_requests
  FOR INSERT
  WITH CHECK (
    org_id = public.get_my_org_id() AND public.is_master()
  );

-- UPDATE: platform_admin のみ（承認/却下の処理）
DROP POLICY IF EXISTS "plan_change_requests_update_admin" ON public.plan_change_requests;
CREATE POLICY "plan_change_requests_update_admin"
  ON public.plan_change_requests
  FOR UPDATE
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- =============================================================================
-- 7. 集計ビュー（platform_admin 用）
--    ※ ビューは RLS が適用されないため、SECURITY DEFINER 関数でラップするか、
--    ※ API レイヤー（Edge Function）で is_platform_admin() チェックを行う。
--    ※ ここではビュー定義のみ作成し、アクセス制御は Edge Function 側で実施。
-- =============================================================================

-- -------------------------------------------------------
-- 7-1. v_platform_billing_summary — 組織別請求サマリー
--      Stripe 決済状況・Dunning 状態の俯瞰ビュー
-- -------------------------------------------------------

DROP VIEW IF EXISTS public.v_platform_billing_summary;
CREATE OR REPLACE VIEW public.v_platform_billing_summary AS
SELECT
  o.id                          AS org_id,
  o.name                        AS org_name,
  o.plan                        AS current_plan,
  s.stripe_customer_id,
  s.stripe_subscription_id,
  s.status                      AS subscription_status,
  s.current_period_start,
  s.current_period_end,
  s.cancel_at_period_end,
  -- Dunning 状態
  d.failed_at                   AS dunning_failed_at,
  d.attempt_count               AS dunning_attempt_count,
  d.day1_sent_at                AS dunning_day1,
  d.day3_sent_at                AS dunning_day3,
  d.day7_restricted_at          AS dunning_day7,
  d.day14_canceled_at           AS dunning_day14,
  d.resolved_at                 AS dunning_resolved_at,
  -- CV Addon
  o.cv_addon_enabled,
  -- Enterprise
  o.parent_organization_id,
  -- タイムスタンプ
  s.updated_at                  AS subscription_updated_at
FROM
  public.organizations o
  LEFT JOIN public.subscriptions s ON s.org_id = o.id
  LEFT JOIN public.dunning_schedules d ON d.org_id = o.id AND d.resolved_at IS NULL;

COMMENT ON VIEW public.v_platform_billing_summary IS
  'platform_admin 用: 組織別の請求・Dunning サマリー。Edge Function 側で is_platform_admin() ガードを行うこと。';

-- -------------------------------------------------------
-- 7-2. v_platform_team_overview — 契約チーム基礎情報 + プラン
--      組織名・プラン・スタッフ数・選手数等のサマリー
-- -------------------------------------------------------

DROP VIEW IF EXISTS public.v_platform_team_overview;
CREATE OR REPLACE VIEW public.v_platform_team_overview AS
SELECT
  o.id                          AS org_id,
  o.name                        AS org_name,
  o.plan                        AS current_plan,
  o.athlete_limit,
  o.cv_addon_enabled,
  o.parent_organization_id,
  o.created_at                  AS org_created_at,
  -- スタッフ数（集計データのみ、個別情報は秘匿）
  COUNT(DISTINCT st.id)         AS staff_count,
  -- 選手数（集計データのみ）
  COUNT(DISTINCT a.id)          AS athlete_count,
  -- アクティブ選手数
  COUNT(DISTINCT a.id) FILTER (WHERE a.is_active = true)
                                AS active_athlete_count,
  -- チーム数
  COUNT(DISTINCT t.id)          AS team_count,
  -- サブスクリプション状態
  s.status                      AS subscription_status,
  s.current_period_end,
  -- 未処理プラン変更リクエスト数
  COUNT(DISTINCT pcr.id) FILTER (WHERE pcr.status = 'pending')
                                AS pending_plan_changes
FROM
  public.organizations o
  LEFT JOIN public.staff st     ON st.org_id = o.id AND st.is_active = true
  LEFT JOIN public.athletes a   ON a.org_id = o.id
  LEFT JOIN public.teams t      ON t.org_id = o.id
  LEFT JOIN public.subscriptions s ON s.org_id = o.id
  LEFT JOIN public.plan_change_requests pcr ON pcr.org_id = o.id
GROUP BY
  o.id, o.name, o.plan, o.athlete_limit, o.cv_addon_enabled,
  o.parent_organization_id, o.created_at,
  s.status, s.current_period_end;

COMMENT ON VIEW public.v_platform_team_overview IS
  'platform_admin 用: 契約チーム基礎情報。スタッフ/選手は件数のみ（個別情報は秘匿）。'
  'Edge Function 側で is_platform_admin() ガードを行うこと。';

-- -------------------------------------------------------
-- 7-3. v_platform_usage_stats — 組織別利用率（DAU/MAU）
--      直近30日の日次チェックイン率をもとに DAU/MAU を算出
-- -------------------------------------------------------

DROP VIEW IF EXISTS public.v_platform_usage_stats;
CREATE OR REPLACE VIEW public.v_platform_usage_stats AS
WITH daily_active AS (
  -- 直近30日間で daily_metrics にレコードがあるユニーク athlete_id を日別に集計
  SELECT
    dm.org_id,
    dm.date,
    COUNT(DISTINCT dm.athlete_id) AS daily_active_athletes
  FROM
    public.daily_metrics dm
  WHERE
    dm.date >= CURRENT_DATE - INTERVAL '30 days'
    AND dm.org_id IS NOT NULL
  GROUP BY
    dm.org_id, dm.date
),
monthly_active AS (
  -- 直近30日間でアクティブなユニーク athlete 数（MAU）
  SELECT
    dm.org_id,
    COUNT(DISTINCT dm.athlete_id) AS monthly_active_athletes
  FROM
    public.daily_metrics dm
  WHERE
    dm.date >= CURRENT_DATE - INTERVAL '30 days'
    AND dm.org_id IS NOT NULL
  GROUP BY
    dm.org_id
)
SELECT
  o.id                              AS org_id,
  o.name                            AS org_name,
  -- 最新日の DAU
  COALESCE(da_today.daily_active_athletes, 0) AS dau,
  -- 30日 MAU
  COALESCE(ma.monthly_active_athletes, 0)     AS mau,
  -- アクティブ選手総数
  total.total_active_athletes,
  -- DAU 率 (%)
  CASE
    WHEN COALESCE(total.total_active_athletes, 0) = 0 THEN 0
    ELSE ROUND(
      COALESCE(da_today.daily_active_athletes, 0)::NUMERIC
      / total.total_active_athletes * 100, 1
    )
  END                                         AS dau_rate_pct,
  -- MAU 率 (%)
  CASE
    WHEN COALESCE(total.total_active_athletes, 0) = 0 THEN 0
    ELSE ROUND(
      COALESCE(ma.monthly_active_athletes, 0)::NUMERIC
      / total.total_active_athletes * 100, 1
    )
  END                                         AS mau_rate_pct,
  -- 7日平均 DAU
  COALESCE(da_7d.avg_dau_7d, 0)              AS avg_dau_7d
FROM
  public.organizations o
  -- 最新日の DAU
  LEFT JOIN daily_active da_today
    ON da_today.org_id = o.id AND da_today.date = CURRENT_DATE
  -- 30日 MAU
  LEFT JOIN monthly_active ma
    ON ma.org_id = o.id
  -- アクティブ選手総数
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS total_active_athletes
    FROM public.athletes a
    WHERE a.org_id = o.id AND a.is_active = true
  ) total ON true
  -- 7日平均 DAU
  LEFT JOIN LATERAL (
    SELECT ROUND(AVG(daily_active_athletes), 1) AS avg_dau_7d
    FROM daily_active da7
    WHERE da7.org_id = o.id AND da7.date >= CURRENT_DATE - INTERVAL '7 days'
  ) da_7d ON true;

COMMENT ON VIEW public.v_platform_usage_stats IS
  'platform_admin 用: 組織別 DAU/MAU 利用率。個別選手情報は含まない。'
  'Edge Function 側で is_platform_admin() ガードを行うこと。';

-- -------------------------------------------------------
-- 7-4. v_platform_engine_growth — エンジン成長率メトリクス
--      組織別のデータ蓄積量・品質スコア
-- -------------------------------------------------------

DROP VIEW IF EXISTS public.v_platform_engine_growth;
CREATE OR REPLACE VIEW public.v_platform_engine_growth AS
SELECT
  o.id                          AS org_id,
  o.name                        AS org_name,
  -- daily_metrics レコード数（全期間）
  COALESCE(dm_total.total_metrics, 0)       AS total_daily_metrics,
  -- 直近30日の daily_metrics レコード数
  COALESCE(dm_30d.recent_metrics, 0)        AS metrics_last_30d,
  -- assessment 完了数（全期間）
  COALESCE(assess_total.total_assessments, 0) AS total_assessments,
  -- 直近30日の assessment 完了数
  COALESCE(assess_30d.recent_assessments, 0)  AS assessments_last_30d,
  -- チェックイン継続率（直近30日で1回以上入力した選手 / アクティブ選手）
  CASE
    WHEN COALESCE(active_cnt.cnt, 0) = 0 THEN 0
    ELSE ROUND(
      COALESCE(checkin_cnt.cnt, 0)::NUMERIC / active_cnt.cnt * 100, 1
    )
  END                                       AS checkin_continuity_pct,
  -- データ品質: 直近30日の daily_metrics 欠損率
  -- （アクティブ選手 x 30日 - 実レコード数）/ （アクティブ選手 x 30日） * 100
  CASE
    WHEN COALESCE(active_cnt.cnt, 0) = 0 THEN 0
    ELSE ROUND(
      (1.0 - COALESCE(dm_30d.recent_metrics, 0)::NUMERIC
        / (active_cnt.cnt * 30)) * 100, 1
    )
  END                                       AS missing_data_rate_pct
FROM
  public.organizations o
  -- daily_metrics 全件数
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS total_metrics
    FROM public.daily_metrics dm WHERE dm.org_id = o.id
  ) dm_total ON true
  -- daily_metrics 直近30日
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS recent_metrics
    FROM public.daily_metrics dm
    WHERE dm.org_id = o.id AND dm.date >= CURRENT_DATE - INTERVAL '30 days'
  ) dm_30d ON true
  -- assessment 全件数
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS total_assessments
    FROM public.assessments a
    WHERE a.org_id = o.id AND a.status = 'completed'
  ) assess_total ON true
  -- assessment 直近30日
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS recent_assessments
    FROM public.assessments a
    WHERE a.org_id = o.id AND a.status = 'completed'
      AND a.completed_at >= now() - INTERVAL '30 days'
  ) assess_30d ON true
  -- アクティブ選手数
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt
    FROM public.athletes ath WHERE ath.org_id = o.id AND ath.is_active = true
  ) active_cnt ON true
  -- 直近30日で1回以上チェックインした選手数
  LEFT JOIN LATERAL (
    SELECT COUNT(DISTINCT dm.athlete_id) AS cnt
    FROM public.daily_metrics dm
    WHERE dm.org_id = o.id AND dm.date >= CURRENT_DATE - INTERVAL '30 days'
  ) checkin_cnt ON true;

COMMENT ON VIEW public.v_platform_engine_growth IS
  'platform_admin 用: 組織別エンジン成長率（データ蓄積量・品質スコア）。個別選手情報は含まない。'
  'Edge Function 側で is_platform_admin() ガードを行うこと。';

-- =============================================================================
-- 8. ビューへの直接アクセス制御
--    PostgreSQL のビューには RLS が適用されないため、
--    GRANT/REVOKE でアクセスを制御する。
--    anon / authenticated ロールからはデフォルトで SELECT 可能だが、
--    API レイヤー（Edge Function）で is_platform_admin() チェックを必須とする。
--
--    ※ Supabase ではビューに対する REVOKE は制限されるケースがあるため、
--    ※ 以下は参考実装。実際のアクセス制御は Edge Function 側で確実に行うこと。
-- =============================================================================

-- ビューのアクセスは Edge Function の is_platform_admin() ガードで制御する。
-- 加えて、DB レイヤーでも REVOKE でアクセスを制限し、多層防御を実現する。
-- （Supabase client からの直接クエリを防止）
REVOKE SELECT ON public.v_platform_billing_summary FROM anon, authenticated;
REVOKE SELECT ON public.v_platform_team_overview FROM anon, authenticated;
REVOKE SELECT ON public.v_platform_usage_stats FROM anon, authenticated;
REVOKE SELECT ON public.v_platform_engine_growth FROM anon, authenticated;

-- Service Role からのアクセスは許可（API レイヤーの platform_admin ガード経由でのみ使用）
GRANT SELECT ON public.v_platform_billing_summary TO service_role;
GRANT SELECT ON public.v_platform_team_overview TO service_role;
GRANT SELECT ON public.v_platform_usage_stats TO service_role;
GRANT SELECT ON public.v_platform_engine_growth TO service_role;

-- =============================================================================
-- 9. organizations テーブルにステータスカラム追加
--    プラットフォーム管理画面でのフィルタリングに使用。
-- =============================================================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'canceled'));

COMMENT ON COLUMN public.organizations.status IS
  '組織のステータス。active=稼働中, suspended=休止, canceled=解約。'
  'プラットフォーム管理画面でのフィルタリングに使用。';

-- インデックス: ステータスによるフィルタリング
CREATE INDEX IF NOT EXISTS idx_organizations_status
  ON public.organizations(status);

-- =============================================================================
-- 完了メッセージ
-- =============================================================================

COMMIT;

-- =============================================================================
-- 確認クエリ（実行後に以下で作成結果を検証可能）:
--
-- -- テーブル確認
-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public'
--     AND table_name IN (
--       'platform_admins',
--       'team_invite_codes',
--       'platform_admin_audit_logs',
--       'plan_change_requests'
--     );
--
-- -- ビュー確認
-- SELECT table_name FROM information_schema.views
--   WHERE table_schema = 'public'
--     AND table_name LIKE 'v_platform_%';
--
-- -- ヘルパー関数確認
-- SELECT routine_name FROM information_schema.routines
--   WHERE routine_schema = 'public'
--     AND routine_name = 'is_platform_admin';
--
-- -- RLS ポリシー確認
-- SELECT tablename, policyname FROM pg_policies
--   WHERE schemaname = 'public'
--     AND tablename IN (
--       'platform_admins',
--       'team_invite_codes',
--       'platform_admin_audit_logs',
--       'plan_change_requests'
--     );
-- =============================================================================

-- =========================================================================
-- auth_events: ログイン試行・セキュリティイベント記録テーブル
--
-- 目的:
--   - ブルートフォース攻撃の検知・防御（IP + メール別の試行回数制限）
--   - アカウントロック（連続失敗 N 回でロック）
--   - セキュリティ監査ログ（成功/失敗/ロック/解除の記録）
--   - 不審なログインパターンの検知
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.auth_events (
  id          bigserial    PRIMARY KEY,
  email       text         NOT NULL,
  ip_address  inet,
  user_agent  text,
  event_type  text         NOT NULL CHECK (event_type IN (
    'login_success',
    'login_failed',
    'account_locked',
    'account_unlocked',
    'magic_link_sent',
    'oauth_success',
    'oauth_failed',
    'password_reset'
  )),
  metadata    jsonb        DEFAULT '{}',
  created_at  timestamptz  NOT NULL DEFAULT now()
);

-- インデックス: ブルートフォース検知用（メール × 時間帯）
CREATE INDEX idx_auth_events_email_created
  ON public.auth_events (email, created_at DESC);

-- インデックス: IP ベースの検知用
CREATE INDEX idx_auth_events_ip_created
  ON public.auth_events (ip_address, created_at DESC);

-- インデックス: イベントタイプ別集計
CREATE INDEX idx_auth_events_type_created
  ON public.auth_events (event_type, created_at DESC);

-- RLS: クライアントからのアクセスを完全にブロック（サーバーサイド専用）
ALTER TABLE public.auth_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_events_service_only"
  ON public.auth_events
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- 自動クリーンアップ: 90日以上前のイベントを毎日削除
-- pg_cron が有効な場合のみ
DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'auth-events-cleanup',
      '0 3 * * *',
      'DELETE FROM public.auth_events WHERE created_at < now() - interval ''90 days'''
    );
  END IF;
END $outer$;

COMMENT ON TABLE public.auth_events IS 'ログイン試行・セキュリティイベント記録。ブルートフォース検知・監査ログに使用';

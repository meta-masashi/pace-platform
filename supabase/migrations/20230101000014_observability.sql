-- ============================================================
-- 014_observability.sql
-- PACE v3.0 — オブザーバビリティ用テーブル
-- ============================================================
-- 実行手順:
--   Supabase ダッシュボード → SQL エディタ → このファイルの内容を貼り付けて実行
--   ※ 自動実行禁止。手動でのみ実行すること。
-- ============================================================

-- ============================================================
-- 1. web_vitals_log テーブル
--    Core Web Vitals (LCP/FID/CLS/TTFB/FCP/INP) 計測値を記録
-- ============================================================

CREATE TABLE IF NOT EXISTS public.web_vitals_log (
  id               UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  trace_id         TEXT    NOT NULL,
  metric_name      TEXT    NOT NULL
                     CHECK (metric_name IN ('LCP', 'FID', 'CLS', 'TTFB', 'FCP', 'INP')),
  metric_value     NUMERIC NOT NULL,
  metric_id        TEXT    NOT NULL,   -- web-vitals ライブラリが付与する一意 ID
  rating           TEXT    CHECK (rating IN ('good', 'needs-improvement', 'poor')),
  navigation_type  TEXT,               -- 'navigate' | 'reload' | 'back-forward' 等
  page_url         TEXT,               -- パス部分のみ（オリジン・クエリは除外）
  recorded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_web_vitals_log_trace_id
  ON public.web_vitals_log (trace_id);

CREATE INDEX IF NOT EXISTS idx_web_vitals_log_metric_name
  ON public.web_vitals_log (metric_name);

CREATE INDEX IF NOT EXISTS idx_web_vitals_log_recorded_at
  ON public.web_vitals_log (recorded_at DESC);

-- 90 日以上古いレコードは削除対象
-- ※ pg_cron が利用可能な場合は以下のジョブを登録すること:
-- SELECT cron.schedule('cleanup-web-vitals-log', '0 4 * * *',
--   $$DELETE FROM public.web_vitals_log WHERE recorded_at < NOW() - INTERVAL '90 days'$$);

-- ============================================================
-- 2. api_traces テーブル
--    分散トレーシング（スパンログ）
-- ============================================================

CREATE TABLE IF NOT EXISTS public.api_traces (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trace_id       TEXT    NOT NULL,
  span_id        TEXT    NOT NULL UNIQUE,
  parent_span_id TEXT,                  -- NULL = ルートスパン
  operation      TEXT    NOT NULL,      -- 例: 'gemini.rehab-generator'
  service        TEXT    NOT NULL,      -- 例: 'ai-pipeline', 'billing'
  started_at     TIMESTAMPTZ NOT NULL,
  ended_at       TIMESTAMPTZ,
  duration_ms    INTEGER,
  status         TEXT    NOT NULL
                   CHECK (status IN ('ok', 'error')),
  error_message  TEXT,
  attributes     JSONB,                 -- 任意の追加メタデータ
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_api_traces_trace_id
  ON public.api_traces (trace_id);

CREATE INDEX IF NOT EXISTS idx_api_traces_span_id
  ON public.api_traces (span_id);

CREATE INDEX IF NOT EXISTS idx_api_traces_operation
  ON public.api_traces (operation);

CREATE INDEX IF NOT EXISTS idx_api_traces_started_at
  ON public.api_traces (started_at DESC);

CREATE INDEX IF NOT EXISTS idx_api_traces_status
  ON public.api_traces (status);

-- 遅いスパン検索用（P95 監視）
CREATE INDEX IF NOT EXISTS idx_api_traces_duration_ms
  ON public.api_traces (duration_ms DESC NULLS LAST)
  WHERE status = 'ok';

-- 30 日以上古いトレースは削除対象
-- ※ pg_cron が利用可能な場合は以下のジョブを登録すること:
-- SELECT cron.schedule('cleanup-api-traces', '0 5 * * *',
--   $$DELETE FROM public.api_traces WHERE started_at < NOW() - INTERVAL '30 days'$$);

-- ============================================================
-- 3. RLS（Row Level Security）
-- ============================================================

-- web_vitals_log: 書き込みは全ユーザー可、読み取りは master ロールのみ
ALTER TABLE public.web_vitals_log ENABLE ROW LEVEL SECURITY;

-- 書き込みは認証済みユーザー全員可（匿名含む: anon ロールも INSERT を許可）
DROP POLICY IF EXISTS "web_vitals_log_insert_all" ON public.web_vitals_log;
CREATE POLICY "web_vitals_log_insert_all"
  ON public.web_vitals_log
  FOR INSERT
  WITH CHECK (true);

-- 読み取りは master ロールのみ
DROP POLICY IF EXISTS "web_vitals_log_select_master" ON public.web_vitals_log;
CREATE POLICY "web_vitals_log_select_master"
  ON public.web_vitals_log
  FOR SELECT
  USING (
    public.is_master()
  );

-- api_traces: 書き込みは全員可、読み取りは master ロールのみ
ALTER TABLE public.api_traces ENABLE ROW LEVEL SECURITY;

-- 書き込みは全員可（Service Role によるバックエンドからの INSERT を許可）
DROP POLICY IF EXISTS "api_traces_insert_all" ON public.api_traces;
CREATE POLICY "api_traces_insert_all"
  ON public.api_traces
  FOR INSERT
  WITH CHECK (true);

-- 読み取りは master ロールのみ
DROP POLICY IF EXISTS "api_traces_select_master" ON public.api_traces;
CREATE POLICY "api_traces_select_master"
  ON public.api_traces
  FOR SELECT
  USING (
    public.is_master()
  );

-- ============================================================
-- 実行確認
-- ============================================================
-- 以下のクエリで作成されたテーブルを確認:
-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public'
--     AND table_name IN ('web_vitals_log', 'api_traces');

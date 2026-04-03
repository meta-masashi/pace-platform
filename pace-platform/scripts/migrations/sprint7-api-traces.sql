-- ============================================================
-- Sprint 7: API トレーシング用テーブル (api_traces)
-- 日付: 2026-04-03
-- ============================================================
--
-- lib/observability/tracer.ts の persistSpan() が書き込むテーブル。
-- 分散トレーシングのスパンデータを保存し、
-- API パフォーマンス分析・障害調査に使用する。
-- ============================================================

-- -----------------------------------------------------------
-- テーブル作成
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_traces (
  trace_id        text        NOT NULL,
  span_id         text        PRIMARY KEY,
  parent_span_id  text,
  operation       text        NOT NULL,
  service         text        NOT NULL,
  started_at      timestamptz NOT NULL,
  ended_at        timestamptz,
  duration_ms     integer,
  status          text        NOT NULL CHECK (status IN ('ok', 'error')),
  error_message   text,
  attributes      jsonb
);

COMMENT ON TABLE api_traces IS
  'lib/observability/tracer.ts persistSpan() が書き込む分散トレーシングスパン。30日保持。';

-- -----------------------------------------------------------
-- インデックス
-- -----------------------------------------------------------

-- トレース ID でスパンを一括取得
CREATE INDEX IF NOT EXISTS idx_api_traces_trace_id
  ON api_traces (trace_id);

-- 最新スパンから降順で取得（ダッシュボード・調査用）
CREATE INDEX IF NOT EXISTS idx_api_traces_started_at_desc
  ON api_traces (started_at DESC);

-- -----------------------------------------------------------
-- RLS: service_role のみ INSERT / SELECT 可
-- -----------------------------------------------------------
ALTER TABLE api_traces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_insert"
  ON api_traces FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "service_role_select"
  ON api_traces FOR SELECT
  TO service_role
  USING (true);

-- -----------------------------------------------------------
-- リテンションポリシー (CRON)
-- -----------------------------------------------------------
-- 以下を pg_cron で登録して 30日超のレコードを自動削除する:
--
--   SELECT cron.schedule(
--     'api-traces-retention',
--     '0 3 * * *',                -- 毎日 03:00 UTC
--     $$DELETE FROM api_traces WHERE started_at < now() - interval '30 days'$$
--   );
--
-- Supabase Dashboard > SQL Editor で手動実行すること。
-- ============================================================

-- ========================================
-- 実行手順: Supabase ダッシュボード → SQL エディタ → 実行 → 「実行完了」と返信
-- ファイル: 20260322_import_support.sql
-- 目的: Excel インポートスクリプト (#2) が必要とする
--       ユニーク制約 / import_logs テーブル / alpha_chains 列整合を追加
-- 冪等: CREATE TABLE IF NOT EXISTS / DO $$ EXCEPTION 方式
-- ========================================

-- ============================================================
-- 1. exercises テーブル: upsert 用の複合ユニーク制約
--    (category, phase, name_ja) で同一種目の重複 INSERT を防ぐ
-- ============================================================
DO $$
BEGIN
  ALTER TABLE public.exercises
    ADD CONSTRAINT exercises_category_phase_name_ja_unique
    UNIQUE (category, phase, name_ja);
EXCEPTION
  WHEN duplicate_table THEN NULL;   -- テーブルなし
  WHEN duplicate_object THEN NULL;  -- 制約が既に存在
END $$;

-- ============================================================
-- 2. mc_tracking_nodes テーブル: 未作成の場合に備えて作成
--    (001_schema.sql で既に存在する場合は IF NOT EXISTS でスキップ)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.mc_tracking_nodes (
  node_id      TEXT         PRIMARY KEY,
  phase        TEXT         NOT NULL DEFAULT '',
  category     TEXT         NOT NULL DEFAULT '',
  question_text TEXT        NOT NULL DEFAULT '',
  target_axis  TEXT         NOT NULL DEFAULT '',
  lr_yes       NUMERIC(8,4) NOT NULL DEFAULT 1.0,
  lr_no        NUMERIC(8,4) NOT NULL DEFAULT 1.0,
  kappa        NUMERIC(5,3) NOT NULL DEFAULT 0.0,
  risk_flags   JSONB        NOT NULL DEFAULT '[]'::jsonb,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.mc_tracking_nodes IS '女性アスリート月経周期トラッキング CAT ノード (MC_tracking_nodes_v1.0)';

-- ============================================================
-- 3. alpha_chains テーブル: nodes カラム名の整合
--    001_schema.sql では nodes JSONB、スクリプトは nodes_json TEXT を使用
--    → nodes_json 列を追加（既存 nodes 列との共存）
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'alpha_chains') THEN
    ALTER TABLE public.alpha_chains ADD COLUMN nodes_json JSONB NOT NULL DEFAULT '[]'::jsonb;
  END IF;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

-- ============================================================
-- 4. import_logs テーブル: インポート実行ログ記録
-- ============================================================
CREATE TABLE IF NOT EXISTS public.import_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name       TEXT        NOT NULL,
  sheet_name      TEXT        NOT NULL DEFAULT '*',
  target_table    TEXT        NOT NULL,
  rows_processed  INT         NOT NULL DEFAULT 0,
  imported_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.import_logs IS 'Excel インポートスクリプト実行ログ。各実行の結果を記録する。';

CREATE INDEX IF NOT EXISTS idx_import_logs_imported_at
  ON public.import_logs (imported_at DESC);

CREATE INDEX IF NOT EXISTS idx_import_logs_target_table
  ON public.import_logs (target_table, imported_at DESC);

-- ============================================================
-- 5. RLS: import_logs は service_role のみ書き込み可
-- ============================================================
ALTER TABLE public.import_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY "import_logs_service_role_only"
    ON public.import_logs
    FOR ALL
    USING (auth.role() = 'service_role');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 6. mc_tracking_nodes RLS
-- ============================================================
ALTER TABLE public.mc_tracking_nodes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- 全スタッフが読み取り可（master data）
  CREATE POLICY "mc_tracking_nodes_read_all"
    ON public.mc_tracking_nodes FOR SELECT
    USING (auth.role() IN ('authenticated', 'service_role'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  -- 書き込みは service_role のみ（インポートスクリプト）
  CREATE POLICY "mc_tracking_nodes_write_service_role"
    ON public.mc_tracking_nodes
    FOR ALL
    USING (auth.role() = 'service_role');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

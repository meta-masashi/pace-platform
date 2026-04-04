-- ========================================
-- PACE v3.0 — ML テーブル追加マイグレーション
-- 実行手順: Supabase ダッシュボード → SQL エディタ → 実行 → 「実行完了」と返信
-- 前提: 001〜011 の全マイグレーション実行済み
-- 注意: 自動実行禁止。必ず手動で確認してから実行すること。
-- ========================================

-- ========================================
-- 1. gemini_token_log テーブル
--    用途: ユーザー別 Gemini API 呼び出しのトークン使用量追跡（防壁3）
--    参照: pace-platform/lib/gemini/client.ts の trackTokenUsage()
-- ========================================
CREATE TABLE IF NOT EXISTS public.gemini_token_log (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id         UUID        NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  endpoint         TEXT        NOT NULL
                     CHECK (char_length(endpoint) <= 100),
  input_chars      INTEGER     NOT NULL CHECK (input_chars >= 0),
  -- 概算トークン数（4文字 ≈ 1トークンで計算）
  estimated_tokens INTEGER     NOT NULL CHECK (estimated_tokens >= 0),
  called_at        TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- レートリミット・月次上限チェック用インデックス
-- (staff_id, endpoint, called_at) の組み合わせで高速検索
CREATE INDEX IF NOT EXISTS idx_gemini_token_log_staff_endpoint_time
  ON public.gemini_token_log (staff_id, endpoint, called_at DESC);

-- 月次コスト集計用インデックス
CREATE INDEX IF NOT EXISTS idx_gemini_token_log_staff_time
  ON public.gemini_token_log (staff_id, called_at DESC);

-- RLS 有効化
ALTER TABLE public.gemini_token_log ENABLE ROW LEVEL SECURITY;

-- 自分自身のログのみ参照可能
DROP POLICY IF EXISTS "gemini_token_log_select_self" ON public.gemini_token_log;
CREATE POLICY "gemini_token_log_select_self"
  ON public.gemini_token_log FOR SELECT
  USING (staff_id = auth.uid());

-- INSERT は認証ユーザー全員可能（API 呼び出し元が記録）
DROP POLICY IF EXISTS "gemini_token_log_insert_self" ON public.gemini_token_log;
CREATE POLICY "gemini_token_log_insert_self"
  ON public.gemini_token_log FOR INSERT
  WITH CHECK (staff_id = auth.uid());

-- master はすべてのログを参照可能（コスト監視用）
DROP POLICY IF EXISTS "gemini_token_log_select_master" ON public.gemini_token_log;
CREATE POLICY "gemini_token_log_select_master"
  ON public.gemini_token_log FOR SELECT
  USING (public.is_master());

-- ========================================
-- 2. evaluation_runs テーブル
--    用途: AI精度評価ログ（RAG / ベイズ推論 / LLM品質）
--    参照: pace-platform/lib/evaluation/metrics.ts の saveEvaluationRun()
-- ========================================
CREATE TABLE IF NOT EXISTS public.evaluation_runs (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id           TEXT        NOT NULL UNIQUE,
  evaluation_type  TEXT        NOT NULL
                     CHECK (evaluation_type IN ('rag', 'bayes', 'llm_quality', 'composite')),
  started_at       TIMESTAMPTZ NOT NULL,
  completed_at     TIMESTAMPTZ NOT NULL,
  -- 評価指標（Precision@K, Recall@K, MRR, AUROC, 感度/特異度, BERTScore近似等）
  metrics          JSONB       NOT NULL DEFAULT '{}',
  -- ケース別評価結果（caseId, passed, score, detail の配列）
  case_results     JSONB       NOT NULL DEFAULT '[]',
  metadata         JSONB       NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- evaluation_type + 実行日時でのソート用インデックス
CREATE INDEX IF NOT EXISTS idx_evaluation_runs_type_time
  ON public.evaluation_runs (evaluation_type, started_at DESC);

-- RLS 有効化
ALTER TABLE public.evaluation_runs ENABLE ROW LEVEL SECURITY;

-- master のみ参照・書き込み可能（評価は内部運用のため）
DROP POLICY IF EXISTS "evaluation_runs_master_only" ON public.evaluation_runs;
CREATE POLICY "evaluation_runs_master_only"
  ON public.evaluation_runs FOR ALL
  USING (public.is_master());

-- ========================================
-- 3a. document_sources テーブル（document_embeddings.document_id の参照先）
--    ingest.ts が document_id を参照するため、先に作成する必要がある
-- ========================================
CREATE TABLE IF NOT EXISTS public.document_sources (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id      UUID        REFERENCES public.organizations(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  description TEXT,
  source_url  TEXT,
  file_type   TEXT        NOT NULL DEFAULT 'text'
                CHECK (file_type IN ('text', 'pdf', 'markdown')),
  category    TEXT,
  metadata    JSONB       NOT NULL DEFAULT '{}',
  created_by  UUID        REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT now() NOT NULL
);

DROP TRIGGER IF EXISTS handle_updated_at ON public.document_sources;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.document_sources
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX IF NOT EXISTS idx_document_sources_org
  ON public.document_sources (org_id)
  WHERE org_id IS NOT NULL;

ALTER TABLE public.document_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "document_sources_select" ON public.document_sources;
CREATE POLICY "document_sources_select"
  ON public.document_sources FOR SELECT
  USING (
    org_id IS NULL
    OR org_id = public.get_my_org_id()
  );

DROP POLICY IF EXISTS "document_sources_write_master" ON public.document_sources;
CREATE POLICY "document_sources_write_master"
  ON public.document_sources FOR ALL
  USING (public.is_master());

-- ========================================
-- 3b. document_embeddings への不足カラム追加
--    用途: rag/ingest.ts が使用する document_id / chunk_index / category カラム
--    注意: カラムが既に存在する場合は DO $$ EXCEPTION で安全にスキップ
-- ========================================

-- document_id カラム（ソースドキュメントの識別子）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'document_embeddings'
      AND column_name = 'document_id'
  ) THEN
    ALTER TABLE public.document_embeddings
      ADD COLUMN document_id UUID REFERENCES public.document_sources(id) ON DELETE CASCADE;
    COMMENT ON COLUMN public.document_embeddings.document_id
      IS 'ingest.ts 経由で登録されたソースドキュメントへの参照。既存 source_id と役割が異なる（document_sources テーブル専用）。';
  END IF;
END $$;

-- chunk_index カラム（ドキュメント内のチャンク番号）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'document_embeddings'
      AND column_name = 'chunk_index'
  ) THEN
    ALTER TABLE public.document_embeddings
      ADD COLUMN chunk_index INTEGER NOT NULL DEFAULT 0 CHECK (chunk_index >= 0);
    COMMENT ON COLUMN public.document_embeddings.chunk_index
      IS 'チャンク分割時のインデックス（0始まり）。document_id との複合ユニーク制約で upsert に使用。';
  END IF;
END $$;

-- category カラム（ドキュメントカテゴリ）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'document_embeddings'
      AND column_name = 'category'
  ) THEN
    ALTER TABLE public.document_embeddings
      ADD COLUMN category TEXT;
    COMMENT ON COLUMN public.document_embeddings.category
      IS 'ドキュメントのカテゴリ（例: exercise, protocol, guideline）。retriever.ts のフィルタリングに使用。';
  END IF;
END $$;

-- document_id + chunk_index の複合ユニーク制約（upsert の冪等性保証）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.document_embeddings'::regclass
      AND conname = 'document_embeddings_document_id_chunk_index_key'
  ) THEN
    ALTER TABLE public.document_embeddings
      ADD CONSTRAINT document_embeddings_document_id_chunk_index_key
      UNIQUE (document_id, chunk_index);
  END IF;
END $$;

-- category フィルタリング用インデックス
CREATE INDEX IF NOT EXISTS idx_document_embeddings_category
  ON public.document_embeddings (category)
  WHERE category IS NOT NULL;

-- document_id ごとのチャンク取得用インデックス
CREATE INDEX IF NOT EXISTS idx_document_embeddings_document_id
  ON public.document_embeddings (document_id)
  WHERE document_id IS NOT NULL;

-- ========================================
-- 4. cv_analysis_jobs テーブル
--    用途: CV解析ジョブキュー管理
--    参照: pace-platform/lib/cv/job-processor.ts
-- ========================================
CREATE TABLE IF NOT EXISTS public.cv_analysis_jobs (
  id                   UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  athlete_id           UUID        NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  -- 入力動画の S3 キー（例: cv-inputs/{athlete_id}/{timestamp}.mp4）
  input_s3_key         TEXT        NOT NULL,
  -- 顔マスキング済み動画の S3 キー（処理完了後に設定）
  face_masked_s3_key   TEXT,
  status               TEXT        NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  retry_count          INTEGER     NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  max_retries          INTEGER     NOT NULL DEFAULT 3 CHECK (max_retries > 0),
  error_message        TEXT,
  -- CV 解析結果（キネマティクスデータ等）
  analysis_result      JSONB,
  metadata             JSONB       NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ DEFAULT now() NOT NULL,
  started_at           TIMESTAMPTZ,
  completed_at         TIMESTAMPTZ
);

-- ジョブポーリング用インデックス（pending + created_at 昇順）
CREATE INDEX IF NOT EXISTS idx_cv_analysis_jobs_status_created
  ON public.cv_analysis_jobs (status, created_at ASC)
  WHERE status = 'pending';

-- アスリート別ジョブ取得用インデックス
CREATE INDEX IF NOT EXISTS idx_cv_analysis_jobs_athlete
  ON public.cv_analysis_jobs (athlete_id, created_at DESC);

-- RLS 有効化
ALTER TABLE public.cv_analysis_jobs ENABLE ROW LEVEL SECURITY;

-- master はすべてのジョブを管理可能
DROP POLICY IF EXISTS "cv_analysis_jobs_master" ON public.cv_analysis_jobs;
CREATE POLICY "cv_analysis_jobs_master"
  ON public.cv_analysis_jobs FOR ALL
  USING (public.is_master());

-- スタッフは自 org のアスリートのジョブを参照可能
DROP POLICY IF EXISTS "cv_analysis_jobs_staff_select" ON public.cv_analysis_jobs;
CREATE POLICY "cv_analysis_jobs_staff_select"
  ON public.cv_analysis_jobs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.athletes a
      WHERE a.id = cv_analysis_jobs.athlete_id
        AND a.org_id = public.get_my_org_id()
    )
  );

-- ========================================
-- 5. document_sources テーブル（セクション 3a で作成済み）
-- ========================================

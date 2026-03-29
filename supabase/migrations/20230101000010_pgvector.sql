-- ========================================
-- PACE v3.0 — pgvector スキーマ（ベクトル検索）
-- 実行手順: Supabase ダッシュボード → SQL エディタ → 実行 → 「実行完了」と返信
-- 前提: 001〜009 の全マイグレーション実行済み
-- ========================================

-- ========================================
-- pgvector 拡張の有効化
-- ========================================
CREATE EXTENSION IF NOT EXISTS "vector";

-- ========================================
-- document_embeddings テーブル
-- 用途: リハビリ知識ベース・SOAPノートのセマンティック検索
-- Embedding モデル: Gemini text-embedding-004（768次元）
-- ========================================
CREATE TABLE IF NOT EXISTS public.document_embeddings (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id       UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- org_id が NULL = グローバル知識ベース（全 org で共有）
  content      TEXT NOT NULL,
  embedding    VECTOR(768),            -- Gemini text-embedding-004 の次元数
  source_type  TEXT NOT NULL DEFAULT 'knowledge_base'
                 CHECK (source_type IN (
                   'knowledge_base',   -- リハビリ知識ベース
                   'soap_note',        -- SOAPノートからの自動登録
                   'assessment_node',  -- ベイズノード説明文
                   'exercise'          -- エクササイズDB
                 )),
  source_id    UUID,                   -- 紐付け元レコードの ID
  metadata     JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at   TIMESTAMPTZ DEFAULT now() NOT NULL
);

DROP TRIGGER IF EXISTS handle_updated_at ON public.document_embeddings;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.document_embeddings
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ========================================
-- IVFFlat インデックス（近似最近傍検索）
-- nlist=100: 1万件以下のデータに適した設定
-- コサイン類似度使用（Gemini embedding の推奨）
-- ========================================
CREATE INDEX IF NOT EXISTS idx_document_embeddings_ivfflat
  ON public.document_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- org 別ベクトル検索用部分インデックス（org_id 指定クエリを高速化）
-- グローバル知識ベースには適用しない（org_id IS NULL の行）
CREATE INDEX IF NOT EXISTS idx_document_embeddings_org
  ON public.document_embeddings (org_id)
  WHERE org_id IS NOT NULL;

-- ========================================
-- match_documents 関数（セマンティック検索）
-- 用途:
--   1. リハビリメニュー生成時の関連知識検索（LLM Context Injection 前処理）
--   2. SOAPノート作成時の過去ノート類似検索
--   3. アセスメント結果に基づく関連エビデンス検索
-- ========================================
CREATE OR REPLACE FUNCTION public.match_documents(
  query_embedding  VECTOR(768),
  match_threshold  FLOAT    DEFAULT 0.7,
  match_count      INT      DEFAULT 5,
  filter_org_id    UUID     DEFAULT NULL,
  filter_source    TEXT     DEFAULT NULL
)
RETURNS TABLE (
  id           UUID,
  content      TEXT,
  source_type  TEXT,
  source_id    UUID,
  metadata     JSONB,
  similarity   FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.content,
    d.source_type,
    d.source_id,
    d.metadata,
    1 - (d.embedding <=> query_embedding) AS similarity
  FROM public.document_embeddings d
  WHERE
    -- org フィルタ: 自 org のドキュメント + グローバル知識ベース
    (filter_org_id IS NULL OR d.org_id = filter_org_id OR d.org_id IS NULL)
    -- source_type フィルタ（任意）
    AND (filter_source IS NULL OR d.source_type = filter_source)
    -- 類似度閾値
    AND 1 - (d.embedding <=> query_embedding) > match_threshold
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ========================================
-- RLS の有効化
-- ========================================
ALTER TABLE public.document_embeddings ENABLE ROW LEVEL SECURITY;

-- グローバル知識ベース（org_id IS NULL）は全認証ユーザーが閲覧可
DROP POLICY IF EXISTS "document_embeddings_select_global" ON public.document_embeddings;
CREATE POLICY "document_embeddings_select_global"
  ON public.document_embeddings FOR SELECT
  USING (
    org_id IS NULL
    OR org_id = public.get_my_org_id()
  );

-- 書き込みは master のみ（グローバル知識ベースへの追加も含む）
DROP POLICY IF EXISTS "document_embeddings_write_master" ON public.document_embeddings;
CREATE POLICY "document_embeddings_write_master"
  ON public.document_embeddings FOR ALL
  USING (public.is_master());

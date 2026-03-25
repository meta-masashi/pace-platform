-- ==========================================================================
-- PACE Platform — Migration 019: file_type 拡張 & エビデンスカラム追加
--
-- assessment_nodes テーブルを拡張し、新しい file_type と
-- PRD Phase 1 のエビデンスカラムを追加する。
--
-- 対応 file_type:
--   P0 (subjective), F1-F5 (functional), A3 (tissue),
--   A5 (neurological), RTP (return to play), MC (menstrual cycle)
-- ==========================================================================

-- file_type カラムの説明を更新
COMMENT ON COLUMN public.assessment_nodes.file_type IS
  'Assessment file type: P0 (subjective), F1-F5 (functional), A3 (tissue), A5 (neurological), RTP (return to play), MC (menstrual cycle)';

-- ---------------------------------------------------------------------------
-- PRD Phase 1 エビデンスカラム追加
-- ---------------------------------------------------------------------------

-- 臨床的尤度比（LR+ clinical）
ALTER TABLE public.assessment_nodes
  ADD COLUMN IF NOT EXISTS lr_yes_clinical FLOAT;

COMMENT ON COLUMN public.assessment_nodes.lr_yes_clinical IS
  '臨床的尤度比（LR+ clinical）。文献ベースの lr_yes とは別に、臨床データから算出した陽性尤度比を格納する。';

-- エビデンステキスト（文献引用等）
ALTER TABLE public.assessment_nodes
  ADD COLUMN IF NOT EXISTS evidence_text TEXT;

COMMENT ON COLUMN public.assessment_nodes.evidence_text IS
  'エビデンステキスト。文献引用、根拠説明等を格納する。';

-- 半減期（日数）
ALTER TABLE public.assessment_nodes
  ADD COLUMN IF NOT EXISTS half_life_days FLOAT;

COMMENT ON COLUMN public.assessment_nodes.half_life_days IS
  '半減期（日数）。症状の時間的減衰を半減期で表現する。time_decay_lambda との併用。';

-- 慢性アルファ修飾子
ALTER TABLE public.assessment_nodes
  ADD COLUMN IF NOT EXISTS chronic_alpha_modifier FLOAT DEFAULT 1.0;

COMMENT ON COLUMN public.assessment_nodes.chronic_alpha_modifier IS
  '慢性アルファ修飾子。慢性症例でのベイズ更新時に事前確率を調整するための係数。デフォルト 1.0（無調整）。';

-- ---------------------------------------------------------------------------
-- Routing_v4.3 パース結果格納用カラム
-- ---------------------------------------------------------------------------

-- routing_v43_raw: CSV の Routing_v4.3 カラムの生テキスト
ALTER TABLE public.assessment_nodes
  ADD COLUMN IF NOT EXISTS routing_v43_raw TEXT;

COMMENT ON COLUMN public.assessment_nodes.routing_v43_raw IS
  'Routing_v4.3 カラムの生テキスト（例: "If P0_002=下半身"）。パース前の元データを保持する。';

-- ---------------------------------------------------------------------------
-- インデックス
-- ---------------------------------------------------------------------------

-- file_type による検索の高速化
CREATE INDEX IF NOT EXISTS idx_assessment_nodes_file_type
  ON public.assessment_nodes(file_type);

-- file_type + phase の複合インデックス
CREATE INDEX IF NOT EXISTS idx_assessment_nodes_file_type_phase
  ON public.assessment_nodes(file_type, phase);

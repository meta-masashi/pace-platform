-- ============================================================
-- Migration 020: assessments テーブル v6.0 パイプライン拡張
-- PACE v6.0 — 6層ノード・パイプライン対応
-- ============================================================
-- 実行手順:
--   Supabase ダッシュボード → SQL エディタ → このファイルの内容を貼り付けて実行
--   ※ 自動実行禁止。手動でのみ実行すること。
-- 前提: assessments テーブルが存在すること
-- ============================================================

-- ============================================================
-- 1. v6 パイプラインバージョン・ノード出力カラム追加
-- ============================================================

ALTER TABLE public.assessments
  ADD COLUMN IF NOT EXISTS pipeline_version VARCHAR(10) DEFAULT 'v5',
  ADD COLUMN IF NOT EXISTS node_outputs JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS inference_priority VARCHAR(30),
  ADD COLUMN IF NOT EXISTS trace_id UUID,
  ADD COLUMN IF NOT EXISTS objective_load_metrics JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS medical_context_flags JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_imputed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS local_timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Tokyo',
  ADD COLUMN IF NOT EXISTS response_latency_ms INTEGER;

-- ============================================================
-- 2. inference_priority の CHECK 制約
-- ============================================================

ALTER TABLE public.assessments
  ADD CONSTRAINT chk_inference_priority
  CHECK (inference_priority IS NULL OR inference_priority IN ('P1_SAFETY', 'P2_MECHANICAL_RISK', 'P3_DECOUPLING', 'P4_GAS_EXHAUSTION', 'P5_NORMAL'));

-- ============================================================
-- 3. v6 パイプライン結果のインデックス
-- ============================================================

-- パイプラインバージョン別フィルタ（v6 のみ）
CREATE INDEX IF NOT EXISTS idx_assessments_pipeline_version
  ON public.assessments (pipeline_version) WHERE pipeline_version = 'v6';

-- 高優先度推論のクイックルックアップ（P1_SAFETY, P2_MECHANICAL_RISK）
CREATE INDEX IF NOT EXISTS idx_assessments_inference_priority
  ON public.assessments (inference_priority) WHERE inference_priority IN ('P1_SAFETY', 'P2_MECHANICAL_RISK');

-- トレースID による inference_trace_logs との結合用
CREATE INDEX IF NOT EXISTS idx_assessments_trace_id
  ON public.assessments (trace_id) WHERE trace_id IS NOT NULL;

-- ============================================================
-- 4. カラムコメント
-- ============================================================

COMMENT ON COLUMN public.assessments.pipeline_version IS 'パイプラインバージョン（v5=従来, v6=6層ノードパイプライン）';
COMMENT ON COLUMN public.assessments.node_outputs IS '各ノードの中間出力をJSONBで保存';
COMMENT ON COLUMN public.assessments.inference_priority IS '推論優先度（P1_SAFETY〜P5_NORMAL）';
COMMENT ON COLUMN public.assessments.trace_id IS '推論トレースID（inference_trace_logsとの紐付け）';
COMMENT ON COLUMN public.assessments.objective_load_metrics IS 'IMU/GPS外部負荷データ（κ係数含む）';
COMMENT ON COLUMN public.assessments.medical_context_flags IS 'Node 0の既往歴フラグ + 環境フラグ';
COMMENT ON COLUMN public.assessments.is_imputed IS 'システムによる自動補完データか';
COMMENT ON COLUMN public.assessments.local_timezone IS '入力時タイムゾーン（時差ボケ分離用）';
COMMENT ON COLUMN public.assessments.response_latency_ms IS '回答レイテンシ（虚偽検知用）';

-- ============================================================
-- 実行確認
-- ============================================================
-- 以下のクエリで追加されたカラムを確認:
-- SELECT column_name, data_type
--   FROM information_schema.columns
--   WHERE table_schema = 'public'
--     AND table_name = 'assessments'
--     AND column_name IN ('pipeline_version', 'node_outputs', 'inference_priority',
--                         'trace_id', 'objective_load_metrics', 'medical_context_flags',
--                         'is_imputed', 'local_timezone', 'response_latency_ms');

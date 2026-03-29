-- ========================================
-- PACE v3.0 — Computer Vision 解析ジョブ（v3.0 新規）
-- 実行手順: Supabase ダッシュボード → SQL エディタ → 実行 → 「実行完了」と返信
-- 前提: 004_assessments.sql 実行済み
-- ========================================

-- ========================================
-- cv_analysis_jobs テーブル
-- ========================================
CREATE TABLE IF NOT EXISTS public.cv_analysis_jobs (
  id                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  athlete_id              UUID NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  org_id                  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  assessment_id           UUID REFERENCES public.assessments(id) ON DELETE SET NULL,
  uploaded_by             TEXT NOT NULL CHECK (uploaded_by IN ('staff', 'athlete')),
  -- S3 キー（元動画は解析完了後7日で S3 Lifecycle Policy により自動削除）
  raw_video_s3_key        TEXT,
  -- 顔マスキング処理済み動画の S3 キー（HIPAA準拠: 解析前に必須実行）
  masked_video_s3_key     TEXT,
  status                  TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'processing', 'completed', 'rejected', 'failed')),
  rejection_reason        TEXT,                       -- Auto-Rejection 時のエラー種別
  -- 解析信頼度（0.0〜1.0）: C_score として適応尤度比計算に使用
  -- LR_adjusted = 1 + (LR_raw - 1) × C_score × κ
  -- C_score < 0.3 の場合 LR_adjusted = 1.0（ノイズとして棄却）
  confidence_score        FLOAT CHECK (confidence_score >= 0 AND confidence_score <= 1),
  kinematics_json         JSONB DEFAULT '{}',         -- 抽出キネマティクスデータ（関節角度等）
  error_vectors_json      JSONB DEFAULT '[]',         -- 検出エラーノード一覧と各信頼度
  smpl_mesh_params_json   JSONB DEFAULT '{}',         -- SMPLパラメータ（身体質量モデル）
  created_at              TIMESTAMPTZ DEFAULT now() NOT NULL,
  completed_at            TIMESTAMPTZ,
  updated_at              TIMESTAMPTZ DEFAULT now() NOT NULL
);

DROP TRIGGER IF EXISTS handle_updated_at ON public.cv_analysis_jobs;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.cv_analysis_jobs
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ========================================
-- パフォーマンスインデックス
-- ========================================

-- 選手別ジョブ一覧（時系列ビフォーアフター比較用）
CREATE INDEX IF NOT EXISTS idx_cv_athlete_created
  ON public.cv_analysis_jobs (athlete_id, created_at DESC);

-- ステータス別処理キュー監視（pending/processing の高速フィルタ）
CREATE INDEX IF NOT EXISTS idx_cv_status
  ON public.cv_analysis_jobs (status)
  WHERE status IN ('pending', 'processing');

-- org 単位の一覧取得（ダッシュボード）
CREATE INDEX IF NOT EXISTS idx_cv_org_created
  ON public.cv_analysis_jobs (org_id, created_at DESC);

-- ========================================
-- RLS の有効化
-- ========================================
ALTER TABLE public.cv_analysis_jobs ENABLE ROW LEVEL SECURITY;

-- ※ ポリシー詳細は 008_rls_policies.sql で定義

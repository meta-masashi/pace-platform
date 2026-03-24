-- ============================================================
-- 015_conditioning_score.sql
-- PACE v3.2 — コンディショニングスコア（Hybrid Peaking モデル）
-- ============================================================
-- 実行手順:
--   Supabase ダッシュボード → SQL エディタ → このファイルの内容を貼り付けて実行
--   ※ 自動実行禁止。手動でのみ実行すること。
-- 前提: 003_daily_metrics.sql 実行済み
-- ============================================================

-- ============================================================
-- 1. daily_metrics テーブル拡張
--    コンディショニングスコアエンジンに必要なカラムを追加
-- ============================================================

ALTER TABLE public.daily_metrics
  ADD COLUMN IF NOT EXISTS srpe                  FLOAT,                    -- セッション RPE（RPE × トレーニング時間）
  ADD COLUMN IF NOT EXISTS training_duration_min  INT,                      -- トレーニング時間（分）
  ADD COLUMN IF NOT EXISTS rpe                   FLOAT CHECK (rpe >= 0 AND rpe <= 10),            -- 主観的運動強度（0-10）
  ADD COLUMN IF NOT EXISTS fatigue_subjective    FLOAT CHECK (fatigue_subjective >= 0 AND fatigue_subjective <= 10),  -- 主観的疲労度（0-10）
  ADD COLUMN IF NOT EXISTS conditioning_score    FLOAT CHECK (conditioning_score >= 0 AND conditioning_score <= 100), -- コンディショニングスコア（0-100）
  ADD COLUMN IF NOT EXISTS fitness_ewma          FLOAT,                    -- 42日間 EWMA キャッシュ（フィットネス）
  ADD COLUMN IF NOT EXISTS fatigue_ewma          FLOAT,                    -- 7日間 EWMA キャッシュ（疲労）
  ADD COLUMN IF NOT EXISTS hrv_baseline          FLOAT;                    -- Pro Mode 用 HRV ベースライン

-- ============================================================
-- 2. hp_computed 非推奨マーカー
-- ============================================================

-- 注意: hp_computed カラムは conditioning_score に置き換えられました。
-- 既存クエリとの後方互換性のために hp_computed カラムは残しますが、
-- 新規開発では conditioning_score を使用してください。
COMMENT ON COLUMN public.daily_metrics.hp_computed IS
  'DEPRECATED: conditioning_score を使用してください。Hybrid Peaking v1 のレガシースコア。';

-- ============================================================
-- 3. コンディショニングスコア用インデックス
-- ============================================================

-- チーム別コンディショニングスコアランキング（ダッシュボード表示用）
CREATE INDEX IF NOT EXISTS idx_daily_metrics_conditioning
  ON public.daily_metrics (org_id, conditioning_score DESC)
  WHERE conditioning_score IS NOT NULL;

-- ============================================================
-- 実行確認
-- ============================================================
-- 以下のクエリで追加されたカラムを確認:
-- SELECT column_name, data_type
--   FROM information_schema.columns
--   WHERE table_schema = 'public'
--     AND table_name = 'daily_metrics'
--     AND column_name IN ('srpe', 'training_duration_min', 'rpe',
--                         'fatigue_subjective', 'conditioning_score',
--                         'fitness_ewma', 'fatigue_ewma', 'hrv_baseline');

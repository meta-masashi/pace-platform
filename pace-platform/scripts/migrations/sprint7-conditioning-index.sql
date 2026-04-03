-- ============================================================
-- Sprint 7: コンディショニングスコア・クエリ最適化インデックス
-- 日付: 2026-04-03
-- ============================================================
--
-- チームダッシュボード・選手一覧のクエリ高速化用。
-- daily_metrics テーブルに対して athlete_id + date DESC の
-- カバリングインデックスを作成する。
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_daily_metrics_team_conditioning
  ON daily_metrics (athlete_id, date DESC)
  INCLUDE (conditioning_score, fitness_ewma, fatigue_ewma, acwr);

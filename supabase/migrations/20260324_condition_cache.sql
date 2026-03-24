-- Phase 5 v3.2: コンディションスコアキャッシュ + daily_metrics 拡張
-- ADR-022 準拠: フィットネス疲労理論 (Fitness-Fatigue Model) + ACWR

-- ---------------------------------------------------------------------------
-- 1. daily_metrics に主観的コンディション指標カラムを追加
-- ---------------------------------------------------------------------------

ALTER TABLE daily_metrics
  ADD COLUMN IF NOT EXISTS srpe INTEGER,                           -- session RPE (0-100): 練習負荷の代理指標
  ADD COLUMN IF NOT EXISTS sleep_quality INTEGER                   -- 睡眠の質 (1=最悪 〜 5=最良)
    CHECK (sleep_quality IS NULL OR sleep_quality BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS fatigue_feeling INTEGER                 -- 主観的疲労感 (1=最悪 〜 5=最良)
    CHECK (fatigue_feeling IS NULL OR fatigue_feeling BETWEEN 1 AND 5);

COMMENT ON COLUMN daily_metrics.srpe IS 'Session RPE (0-100). 練習強度 × 練習時間(分) で算出する選手入力値。';
COMMENT ON COLUMN daily_metrics.sleep_quality IS '睡眠の質 (1=非常に悪い / 3=普通 / 5=非常に良い)';
COMMENT ON COLUMN daily_metrics.fatigue_feeling IS '主観的疲労感 (1=非常に疲れている / 3=普通 / 5=非常に元気)';

-- ---------------------------------------------------------------------------
-- 2. athlete_condition_cache テーブル
--    EWMA Fitness / Fatigue / Readiness / ACWR を日次キャッシュ
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS athlete_condition_cache (
  athlete_id          UUID        NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  date                DATE        NOT NULL,

  -- フィットネス疲労モデル (α₄₂ = 2/43, α₇ = 2/8)
  fitness_score       NUMERIC     NOT NULL DEFAULT 0,     -- EWMA(42日) 長期適応
  fatigue_score       NUMERIC     NOT NULL DEFAULT 0,     -- EWMA(7日)  短期疲労
  readiness_score     NUMERIC     NOT NULL DEFAULT 50     -- (fitness - fatigue) 正規化 0-100
    CHECK (readiness_score BETWEEN 0 AND 100),

  -- ACWR: Acute (7日) / Chronic (28日平均)
  acwr                NUMERIC     NOT NULL DEFAULT 1.0,
  acwr_acute          NUMERIC     NOT NULL DEFAULT 0,
  acwr_chronic        NUMERIC     NOT NULL DEFAULT 0,

  -- Level 1/2 区分 (Level 2 = HRVデバイス連携あり)
  level               INTEGER     NOT NULL DEFAULT 1
    CHECK (level IN (1, 2)),

  -- Level 2 専用: HRVベースラインからの乖離率 (例: -0.12 = 12%低下)
  hrv_baseline_delta  NUMERIC,

  -- 主観ペナルティ係数 (sleep_quality / fatigue_feeling 低下時に readiness を補正)
  subjective_penalty  NUMERIC     NOT NULL DEFAULT 0,     -- 0.0-1.0 の減算率

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (athlete_id, date)
);

COMMENT ON TABLE athlete_condition_cache IS
  'フィットネス疲労理論 + ACWR + HRV融合による選手コンディションの日次計算キャッシュ。
   計算は /api/athlete/checkin または /api/staff/team-condition から書き込む。';

-- インデックス
CREATE INDEX IF NOT EXISTS idx_acc_athlete_date
  ON athlete_condition_cache (athlete_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_acc_readiness
  ON athlete_condition_cache (date, readiness_score);

-- ---------------------------------------------------------------------------
-- 3. updated_at 自動更新トリガー
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_condition_cache_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_condition_cache_updated_at ON athlete_condition_cache;
CREATE TRIGGER trg_condition_cache_updated_at
  BEFORE UPDATE ON athlete_condition_cache
  FOR EACH ROW EXECUTE FUNCTION update_condition_cache_updated_at();

-- ---------------------------------------------------------------------------
-- 4. RLS ポリシー
-- ---------------------------------------------------------------------------

ALTER TABLE athlete_condition_cache ENABLE ROW LEVEL SECURITY;

-- スタッフ: 同組織の選手データを参照可能
CREATE POLICY "staff_read_condition_cache"
  ON athlete_condition_cache
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM staff s
      JOIN athletes a ON a.org_id = s.org_id
      WHERE s.auth_user_id = auth.uid()
        AND a.id = athlete_condition_cache.athlete_id
    )
  );

-- 選手: 自分自身のデータのみ参照可能
CREATE POLICY "athlete_read_own_condition_cache"
  ON athlete_condition_cache
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM athletes a
      WHERE a.auth_user_id = auth.uid()
        AND a.id = athlete_condition_cache.athlete_id
    )
  );

-- Service Role のみ INSERT/UPDATE（APIサーバーから実行）
-- RLS は anon/authenticated のみ適用されるため service role は自動バイパス

-- ============================================================
-- conditioning_assessments: コンディショニングアセスメント
-- Active選手の3軸評価（負荷集中 × 運動効率 × 疼痛パターン）を記録
-- ============================================================

CREATE TABLE IF NOT EXISTS conditioning_assessments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id        UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  org_id            UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  staff_id          UUID NOT NULL REFERENCES staff(id),

  -- パイプライン連携（Daily Input → 自動判定との紐付け）
  trace_id          UUID,
  pipeline_decision TEXT CHECK (pipeline_decision IN ('RED', 'ORANGE', 'YELLOW', 'GREEN')),
  pipeline_priority TEXT CHECK (pipeline_priority IN (
    'P1_SAFETY', 'P2_MECHANICAL_RISK', 'P3_DECOUPLING', 'P4_GAS_EXHAUSTION', 'P5_NORMAL'
  )),

  -- 3軸分析結果
  load_analysis       JSONB NOT NULL DEFAULT '{}',
  efficiency_analysis JSONB NOT NULL DEFAULT '{}',
  pain_analysis       JSONB NOT NULL DEFAULT '{}',

  -- 総合評価
  risk_category     TEXT CHECK (risk_category IN (
    'overreaching', 'accumulated_fatigue', 'pain_management', 'observation'
  )),
  staff_notes       TEXT,

  -- AI補助（Pro限定）
  ai_suggestion     JSONB,
  ai_adopted        BOOLEAN DEFAULT false,

  -- シミュレータ連携
  selected_scenario   JSONB,
  simulation_params   JSONB,
  feature_snapshot    JSONB,

  -- ステータス
  status            TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'completed', 'reviewed')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at      TIMESTAMPTZ
);

COMMENT ON TABLE conditioning_assessments IS
  'Active選手のコンディショニングアセスメント。3軸評価（負荷集中/運動効率/疼痛パターン）+ 総合評価 + シミュレータ結果を保持';

-- インデックス
CREATE INDEX idx_cond_assess_athlete
  ON conditioning_assessments(athlete_id, created_at DESC);
CREATE INDEX idx_cond_assess_org
  ON conditioning_assessments(org_id, created_at DESC);
CREATE INDEX idx_cond_assess_status
  ON conditioning_assessments(status) WHERE status = 'draft';

-- RLS
ALTER TABLE conditioning_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_own_org_select" ON conditioning_assessments
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM staff WHERE id = auth.uid())
  );

CREATE POLICY "staff_own_org_insert" ON conditioning_assessments
  FOR INSERT WITH CHECK (
    org_id IN (SELECT org_id FROM staff WHERE id = auth.uid())
  );

CREATE POLICY "staff_own_org_update" ON conditioning_assessments
  FOR UPDATE USING (
    org_id IN (SELECT org_id FROM staff WHERE id = auth.uid())
  );

-- updated_at 自動更新トリガー
CREATE OR REPLACE FUNCTION update_conditioning_assessment_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_conditioning_assessment_updated
  BEFORE UPDATE ON conditioning_assessments
  FOR EACH ROW EXECUTE FUNCTION update_conditioning_assessment_timestamp();

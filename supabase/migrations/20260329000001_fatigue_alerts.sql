-- ============================================================
-- Migration: 20260329_fatigue_alerts
-- fatigue_alerts テーブルの作成
-- 後続の 20260329000002, 20260329000003, 20260601000001,
-- 20260615000001 が参照するため、先に作成する必要がある。
-- ============================================================

CREATE TABLE IF NOT EXISTS public.fatigue_alerts (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id               UUID NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  alert_date               DATE NOT NULL DEFAULT CURRENT_DATE,
  predicted_fatigue_state   TEXT NOT NULL DEFAULT 'normal'
    CHECK (predicted_fatigue_state IN ('low', 'normal', 'moderate', 'high')),
  confidence_score         NUMERIC,
  recommended_action       TEXT,
  alert_status             TEXT NOT NULL DEFAULT 'pending'
    CHECK (alert_status IN ('pending', 'acknowledged', 'dismissed', 'resolved')),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_fatigue_alerts_athlete_date
  ON public.fatigue_alerts (athlete_id, alert_date DESC);

-- RLS
ALTER TABLE public.fatigue_alerts ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.fatigue_alerts IS 'DBN 疲労予測アラート。dbn-predict Edge Function が INSERT し、AT/PT が確認・対応する。';

-- =============================================================================
-- Migration: 20260615_fatigue_alerts_acknowledge.sql
-- Phase 3 Sprint 6: fatigue_alerts テーブルに AT/PT 承認フローを追加
-- =============================================================================

-- fatigue_alerts に承認管理カラムを追加
ALTER TABLE fatigue_alerts
  ADD COLUMN IF NOT EXISTS acknowledged_by     UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS acknowledged_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS acknowledgement_note TEXT;

-- alert_status に 'acknowledged' / 'dismissed' を追加
ALTER TABLE fatigue_alerts
  DROP CONSTRAINT IF EXISTS fatigue_alerts_alert_status_check;

ALTER TABLE fatigue_alerts
  ADD CONSTRAINT fatigue_alerts_alert_status_check
  CHECK (alert_status IN ('pending', 'acknowledged', 'dismissed', 'resolved'));

-- インデックス
CREATE INDEX IF NOT EXISTS idx_fatigue_alerts_team_date
  ON fatigue_alerts (alert_date, alert_status)
  WHERE alert_status = 'pending';

-- RLS: service_role からの全アクセス許可（dbn_retrain.py が INSERT する）
ALTER TABLE fatigue_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fatigue_alerts_service_role ON fatigue_alerts;
CREATE POLICY fatigue_alerts_service_role ON fatigue_alerts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Staff: 所属チームのアスリートのアラートを参照・更新可能
DROP POLICY IF EXISTS fatigue_alerts_staff_access ON fatigue_alerts;
CREATE POLICY fatigue_alerts_staff_access ON fatigue_alerts
  FOR ALL TO authenticated
  USING (athlete_id IN (
    SELECT a.id FROM athletes a
    JOIN staff s ON s.team_id = a.team_id
    WHERE s.id = auth.uid()
  ));

-- v_active_fatigue_alerts VIEW: acknowledged_by の名前付き
DROP VIEW IF EXISTS v_active_fatigue_alerts;
CREATE OR REPLACE VIEW v_active_fatigue_alerts AS
SELECT
  fa.id,
  fa.athlete_id,
  a.name AS athlete_name,
  a.team_id,
  fa.alert_date,
  fa.predicted_fatigue_state,
  fa.confidence_score,
  fa.recommended_action,
  fa.alert_status,
  fa.acknowledged_by,
  fa.acknowledged_at,
  fa.acknowledgement_note,
  fa.created_at
FROM fatigue_alerts fa
JOIN athletes a ON a.id = fa.athlete_id
WHERE
  fa.alert_date >= CURRENT_DATE - INTERVAL '1 day'
  AND fa.alert_status IN ('pending', 'acknowledged')
ORDER BY
  fa.alert_status ASC,           -- pending 優先
  fa.confidence_score DESC,
  fa.alert_date ASC;

-- コメント
COMMENT ON COLUMN fatigue_alerts.acknowledged_by IS 'アラートを確認したスタッフの user_id';
COMMENT ON COLUMN fatigue_alerts.acknowledgement_note IS 'AT/PT による対応メモ';

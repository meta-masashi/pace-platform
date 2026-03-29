-- ============================================================
-- Migration 021: inference_trace_logs テーブル作成
-- PACE v6.0 — 推論証跡テーブル（法的免責・知財防衛の要）
-- Append-Only: UPDATE/DELETE 完全禁止
-- ============================================================
-- 実行手順:
--   Supabase ダッシュボード → SQL エディタ → このファイルの内容を貼り付けて実行
--   ※ 自動実行禁止。手動でのみ実行すること。
-- 前提: athletes, organizations, staff テーブルが存在すること
-- ============================================================

-- ============================================================
-- 1. inference_trace_logs テーブル作成
-- ============================================================

CREATE TABLE IF NOT EXISTS public.inference_trace_logs (
  trace_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  athlete_id UUID NOT NULL REFERENCES public.athletes(id) ON DELETE RESTRICT,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  staff_id UUID REFERENCES public.staff(id),
  timestamp_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  pipeline_version VARCHAR(10) NOT NULL DEFAULT 'v6',
  inference_snapshot JSONB NOT NULL,
  decision VARCHAR(10) NOT NULL CHECK (decision IN ('RED', 'ORANGE', 'YELLOW', 'GREEN')),
  priority VARCHAR(30) NOT NULL CHECK (priority IN ('P1_SAFETY', 'P2_MECHANICAL_RISK', 'P3_DECOUPLING', 'P4_GAS_EXHAUSTION', 'P5_NORMAL')),
  decision_reason TEXT NOT NULL,
  execution_time_ms INTEGER,
  data_quality_score FLOAT CHECK (data_quality_score >= 0 AND data_quality_score <= 1),
  overrides_applied TEXT[],
  acknowledged_by UUID REFERENCES public.staff(id),
  acknowledged_at TIMESTAMPTZ,
  acknowledge_action VARCHAR(20) CHECK (acknowledge_action IS NULL OR acknowledge_action IN ('approved', 'modified', 'rejected', 'override')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. Immutability: UPDATE/DELETE 完全禁止（Append-Only）
-- ============================================================

-- acknowledge 関連カラムのみ UPDATE 許可（1回のみ）
CREATE OR REPLACE FUNCTION enforce_trace_log_immutability()
RETURNS TRIGGER AS $$
BEGIN
  -- acknowledged_by が既にセットされている場合は更新拒否
  IF OLD.acknowledged_by IS NOT NULL THEN
    RAISE EXCEPTION 'inference_trace_logs: 承認済みレコードの変更は禁止されています';
  END IF;

  -- acknowledge 関連以外の変更を禁止
  IF NEW.trace_id != OLD.trace_id
    OR NEW.athlete_id != OLD.athlete_id
    OR NEW.org_id != OLD.org_id
    OR NEW.timestamp_utc != OLD.timestamp_utc
    OR NEW.inference_snapshot != OLD.inference_snapshot
    OR NEW.decision != OLD.decision
    OR NEW.priority != OLD.priority
    OR NEW.decision_reason != OLD.decision_reason
  THEN
    RAISE EXCEPTION 'inference_trace_logs: 推論結果フィールドの変更は禁止されています（Append-Only）';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_trace_log_immutability
  BEFORE UPDATE ON public.inference_trace_logs
  FOR EACH ROW
  EXECUTE FUNCTION enforce_trace_log_immutability();

-- DELETE は完全禁止
CREATE OR REPLACE FUNCTION prevent_trace_log_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'inference_trace_logs: レコードの削除は禁止されています（法的監査要件）';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_trace_log_delete
  BEFORE DELETE ON public.inference_trace_logs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_trace_log_delete();

-- ============================================================
-- 3. RLS ポリシー
-- ============================================================

ALTER TABLE public.inference_trace_logs ENABLE ROW LEVEL SECURITY;

-- INSERT: 認証済みスタッフのみ（自組織）
CREATE POLICY "trace_logs_insert_own_org" ON public.inference_trace_logs
  FOR INSERT
  WITH CHECK (org_id = (SELECT s.org_id FROM public.staff s WHERE s.id = auth.uid()));

-- SELECT: 自組織のスタッフのみ閲覧可
CREATE POLICY "trace_logs_select_own_org" ON public.inference_trace_logs
  FOR SELECT
  USING (org_id = (SELECT s.org_id FROM public.staff s WHERE s.id = auth.uid()));

-- UPDATE: acknowledge のみ（同組織スタッフ）
CREATE POLICY "trace_logs_update_acknowledge" ON public.inference_trace_logs
  FOR UPDATE
  USING (org_id = (SELECT s.org_id FROM public.staff s WHERE s.id = auth.uid()))
  WITH CHECK (org_id = (SELECT s.org_id FROM public.staff s WHERE s.id = auth.uid()));

-- ============================================================
-- 4. インデックス
-- ============================================================

-- アスリート別・日時降順（個人履歴表示用）
CREATE INDEX IF NOT EXISTS idx_trace_logs_athlete_date
  ON public.inference_trace_logs (athlete_id, timestamp_utc DESC);

-- 組織別・優先度別（ダッシュボード・アラート用）
CREATE INDEX IF NOT EXISTS idx_trace_logs_org_priority
  ON public.inference_trace_logs (org_id, priority, timestamp_utc DESC);

-- 高リスク判定のクイックルックアップ（RED, ORANGE のみ）
CREATE INDEX IF NOT EXISTS idx_trace_logs_decision
  ON public.inference_trace_logs (decision) WHERE decision IN ('RED', 'ORANGE');

-- 未承認の高優先度アラート（Human-in-the-Loop 運用画面用）
CREATE INDEX IF NOT EXISTS idx_trace_logs_unacknowledged
  ON public.inference_trace_logs (org_id, priority)
  WHERE acknowledged_by IS NULL AND priority IN ('P1_SAFETY', 'P2_MECHANICAL_RISK');

-- ============================================================
-- 5. コメント
-- ============================================================

COMMENT ON TABLE public.inference_trace_logs IS 'v6.0 推論証跡テーブル — Append-Only（法的免責・知財防衛）';
COMMENT ON COLUMN public.inference_trace_logs.inference_snapshot IS '推論の全思考過程をJSONBスナップショットとして保存';
COMMENT ON COLUMN public.inference_trace_logs.acknowledged_by IS '推奨アクションを確認したスタッフID（Human-in-the-Loop証跡）';
COMMENT ON COLUMN public.inference_trace_logs.acknowledge_action IS '承認アクション（approved/modified/rejected/override）';

-- ============================================================
-- 実行確認
-- ============================================================
-- 以下のクエリでテーブルが作成されたことを確認:
-- SELECT column_name, data_type
--   FROM information_schema.columns
--   WHERE table_schema = 'public'
--     AND table_name = 'inference_trace_logs'
--   ORDER BY ordinal_position;

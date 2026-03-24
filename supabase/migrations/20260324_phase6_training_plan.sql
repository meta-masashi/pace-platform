-- =============================================================================
-- Phase 6 Sprint 1: AIエージェント週次トレーニング計画テーブル
-- ADR-028: AIエージェント自律トレーニング計画生成アーキテクチャ
--
-- 手動実行用マイグレーション
-- 実行方法: Supabase Dashboard > SQL Editor に貼り付けて実行
--           または: supabase db push（ローカル開発環境）
--
-- 依存: 002_rls.sql の get_my_org_id() ヘルパー関数が存在すること
--       ADR-019 の audit_log テーブルと log_phi_mutation() が存在すること
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. weekly_training_plans テーブル
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS weekly_training_plans (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 関連エンティティ
  org_id               UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  team_id              UUID        REFERENCES teams(id) ON DELETE SET NULL,
  athlete_id           UUID        NOT NULL REFERENCES athletes(id) ON DELETE RESTRICT,

  -- 対象週
  week_start_date      DATE        NOT NULL,  -- 月曜日の日付
  week_end_date        DATE        NOT NULL GENERATED ALWAYS AS (week_start_date + 6) STORED,

  -- AIエージェント生成情報
  -- 生成者: 'agent'（自動）or 'staff'（スタッフによる手動作成）
  generated_by         TEXT        NOT NULL DEFAULT 'agent' CHECK (generated_by IN ('agent', 'staff')),
  agent_model          TEXT,       -- 使用した LLM モデル（例: 'gemini-2.0-flash'）
  agent_iterations     INTEGER,    -- ReAct エージェントの反復回数（コスト管理用）
  agent_input_tokens   INTEGER,    -- 消費入力トークン数（コスト集計用）
  agent_output_tokens  INTEGER,    -- 消費出力トークン数（コスト集計用）

  -- 承認ステータス（ADR-028 Human-in-the-loop 設計）
  -- 'generating'        : エージェント実行中
  -- 'pending_approval'  : スタッフ承認待ち（エージェント完了）
  -- 'approved'          : スタッフ承認済み（アスリートに配信）
  -- 'rejected'          : スタッフ却下
  -- 'expired'           : 7日以内に承認されなかった（cron で自動遷移）
  status               TEXT        NOT NULL DEFAULT 'generating'
                                   CHECK (status IN ('generating', 'pending_approval', 'approved', 'rejected', 'expired')),

  -- 承認ループ情報（Human-in-the-loop）
  -- 承認なしで 'approved' になる経路を排除する設計
  approved_by          UUID        REFERENCES staff(id) ON DELETE SET NULL,  -- 承認したスタッフ
  approved_at          TIMESTAMPTZ,
  rejection_reason     TEXT,

  -- 計画コンテンツ（AIエージェント生成）
  -- 構造: { summary, weekly_load_target: { monday: {...}, ... }, reasoning, risk_flags, staff_notes }
  plan_content         JSONB       NOT NULL DEFAULT '{}',

  -- スタッフによる修正内容（'修正して承認' フロー）
  staff_edits          TEXT,       -- スタッフが加えた変更の説明（自由記述）
  staff_edited_content JSONB,      -- スタッフが修正した計画内容（修正版）

  -- エージェント実行の中間ステップ（デバッグ・監査用）
  agent_intermediate_steps JSONB  NOT NULL DEFAULT '[]',

  -- エラー情報
  error_type           TEXT,       -- 'parse_error' | 'api_error' | 'max_iterations' | NULL
  error_message        TEXT,

  -- アスリートへの配信状態
  -- 'not_sent': 未配信（pending/rejected/expired 時）
  -- 'sent'    : 配信済み（approved 後に Realtime で配信）
  -- 'viewed'  : アスリートが閲覧済み
  delivery_status      TEXT        NOT NULL DEFAULT 'not_sent'
                                   CHECK (delivery_status IN ('not_sent', 'sent', 'viewed')),
  sent_at              TIMESTAMPTZ,
  viewed_at            TIMESTAMPTZ,

  -- メタデータ
  metadata             JSONB       NOT NULL DEFAULT '{}',

  -- タイムスタンプ
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 同一選手の同一週に承認済み計画は1件のみ許可
  UNIQUE (athlete_id, week_start_date, status)
    DEFERRABLE INITIALLY DEFERRED  -- 却下→再生成→承認のフローを許可するため遅延チェック
);

-- コメント
COMMENT ON TABLE weekly_training_plans IS 'AIエージェントが生成した週次トレーニング計画。スタッフの承認なしでアスリートに配信されない設計（ADR-028）';
COMMENT ON COLUMN weekly_training_plans.status IS '承認フロー状態: generating → pending_approval → approved/rejected/expired';
COMMENT ON COLUMN weekly_training_plans.agent_intermediate_steps IS 'LangChain ReAct エージェントの推論ステップ。デバッグ・監査用。本番では定期的に圧縮/削除を検討';
COMMENT ON COLUMN weekly_training_plans.staff_edited_content IS 'スタッフが修正した計画。NULL の場合は plan_content が最終版';

-- -----------------------------------------------------------------------------
-- 2. インデックス
-- -----------------------------------------------------------------------------

-- アスリートの計画履歴
CREATE INDEX IF NOT EXISTS idx_training_plans_athlete
  ON weekly_training_plans(athlete_id, week_start_date DESC);

-- 承認待ち一覧（スタッフの承認ダッシュボード）
CREATE INDEX IF NOT EXISTS idx_training_plans_pending
  ON weekly_training_plans(org_id, status, created_at DESC)
  WHERE status = 'pending_approval';

-- 組織内の全計画
CREATE INDEX IF NOT EXISTS idx_training_plans_org
  ON weekly_training_plans(org_id, week_start_date DESC);

-- 配信状態管理
CREATE INDEX IF NOT EXISTS idx_training_plans_delivery
  ON weekly_training_plans(delivery_status, sent_at)
  WHERE delivery_status = 'sent';

-- -----------------------------------------------------------------------------
-- 3. updated_at 自動更新トリガー
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_weekly_training_plans_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER weekly_training_plans_updated_at
  BEFORE UPDATE ON weekly_training_plans
  FOR EACH ROW
  EXECUTE FUNCTION update_weekly_training_plans_updated_at();

-- -----------------------------------------------------------------------------
-- 4. 承認ガード関数
-- 'approved' への遷移は approved_by と approved_at が必須
-- 承認なしで選手に計画が届く経路を DB レベルで封鎖する（ADR-028 設計原則）
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION check_training_plan_approval()
RETURNS TRIGGER AS $$
BEGIN
  -- status が 'approved' に変わる場合、承認者情報が必須
  IF NEW.status = 'approved' THEN
    IF NEW.approved_by IS NULL THEN
      RAISE EXCEPTION
        'weekly_training_plans: status を approved にするには approved_by が必須です（ADR-028: Human-in-the-loop 必須）';
    END IF;
    IF NEW.approved_at IS NULL THEN
      NEW.approved_at = NOW();  -- 未設定の場合は自動セット
    END IF;
  END IF;

  -- status が 'approved' から他のステータスに変更される場合は禁止（承認の取り消し防止）
  IF OLD.status = 'approved' AND NEW.status != 'approved' THEN
    RAISE EXCEPTION
      'weekly_training_plans: 承認済み計画のステータスを変更することは禁止されています';
  END IF;

  -- delivery_status の不正な手動設定を防止
  -- 'sent' への遷移は status = 'approved' の場合のみ許可
  IF NEW.delivery_status = 'sent' AND NEW.status != 'approved' THEN
    RAISE EXCEPTION
      'weekly_training_plans: 未承認の計画を配信することはできません（ADR-028: 承認必須）';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER training_plan_approval_guard
  BEFORE UPDATE ON weekly_training_plans
  FOR EACH ROW
  EXECUTE FUNCTION check_training_plan_approval();

-- -----------------------------------------------------------------------------
-- 5. 期限切れ自動遷移関数（cron job から呼び出す）
-- 7日以内に承認されなかった計画を 'expired' に遷移
-- Supabase cron: SELECT expire_pending_training_plans(); を週次実行
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION expire_pending_training_plans()
RETURNS INTEGER AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE weekly_training_plans
  SET status = 'expired'
  WHERE status = 'pending_approval'
    AND created_at < NOW() - INTERVAL '7 days';

  GET DIAGNOSTICS expired_count = ROW_COUNT;

  RETURN expired_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION expire_pending_training_plans() IS
  '7日以上承認されていない pending_approval 計画を expired に遷移する。Supabase cron またはEdge Functionから週次で呼び出す';

-- -----------------------------------------------------------------------------
-- 6. RLS（Row Level Security）
-- RLS パターン: staff.id = auth.uid()（既存パターン準拠）
-- -----------------------------------------------------------------------------

ALTER TABLE weekly_training_plans ENABLE ROW LEVEL SECURITY;

-- スタッフは自組織の全計画を参照可能
CREATE POLICY "training_plans_select_staff"
  ON weekly_training_plans
  FOR SELECT
  TO authenticated
  USING (org_id = get_my_org_id());

-- 計画の INSERT は Edge Function（service_role）経由のみ。
-- authenticated ロールからの直接作成を禁止。
-- （アプリから直接 INSERT できないようにすることでエージェント外の計画生成を防止）
CREATE POLICY "training_plans_insert_deny_direct"
  ON weekly_training_plans
  FOR INSERT
  TO authenticated
  WITH CHECK (FALSE);

-- 更新（承認・却下）はスタッフのみ。自組織の計画のみ操作可能。
CREATE POLICY "training_plans_update_staff"
  ON weekly_training_plans
  FOR UPDATE
  TO authenticated
  USING (org_id = get_my_org_id())
  WITH CHECK (org_id = get_my_org_id());

-- 削除は禁止（audit trail 保持のため）
CREATE POLICY "training_plans_delete_deny"
  ON weekly_training_plans
  FOR DELETE
  TO authenticated
  USING (FALSE);

-- -----------------------------------------------------------------------------
-- 7. training_plan_feedback テーブル（アスリートのフィードバック収集）
-- 配信後にアスリートが「計画についての評価」を返す
-- 将来的なエージェント改善のための学習データ
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS training_plan_feedback (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id            UUID        NOT NULL REFERENCES weekly_training_plans(id) ON DELETE CASCADE,
  athlete_id         UUID        NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,

  -- 評価（5段階）
  rating             INTEGER     CHECK (rating BETWEEN 1 AND 5),

  -- 実際のトレーニング達成状況
  -- 'completed': 計画通り完了
  -- 'partial'  : 一部完了
  -- 'skipped'  : 未実施
  completion_status  TEXT        CHECK (completion_status IN ('completed', 'partial', 'skipped')),

  -- 自由記述コメント
  comment            TEXT,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_training_plan_feedback_plan
  ON training_plan_feedback(plan_id);

ALTER TABLE training_plan_feedback ENABLE ROW LEVEL SECURITY;

-- スタッフは自組織のフィードバックを参照可能
CREATE POLICY "training_feedback_select_staff"
  ON training_plan_feedback
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM weekly_training_plans tp
      WHERE tp.id = plan_id
        AND tp.org_id = get_my_org_id()
    )
  );

-- アスリートは自分のフィードバックのみ作成可能
-- ※ アスリート認証の実装後に有効化予定
-- CREATE POLICY "training_feedback_insert_athlete"
--   ON training_plan_feedback
--   FOR INSERT
--   TO authenticated
--   WITH CHECK (athlete_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 8. PHI 書き込み監査トリガー（ADR-019 継承）
-- -----------------------------------------------------------------------------

-- weekly_training_plans は間接的にアスリートの健康情報（ACWR・疲労スコア）を参照して生成されるため PHI に準じて監査
CREATE TRIGGER audit_weekly_training_plans
  AFTER INSERT OR UPDATE OR DELETE ON weekly_training_plans
  FOR EACH ROW
  EXECUTE FUNCTION log_phi_mutation();

-- -----------------------------------------------------------------------------
-- 実行確認クエリ（コメントを外して確認）
-- -----------------------------------------------------------------------------
-- SELECT table_name, row_security
-- FROM information_schema.tables
-- WHERE table_name IN ('weekly_training_plans', 'training_plan_feedback');

-- SELECT trigger_name, event_manipulation, event_object_table
-- FROM information_schema.triggers
-- WHERE event_object_table IN ('weekly_training_plans', 'training_plan_feedback')
-- ORDER BY event_object_table, trigger_name;

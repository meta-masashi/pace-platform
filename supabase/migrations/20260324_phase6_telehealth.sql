-- =============================================================================
-- Phase 6 Sprint 1: TeleHealth セッション管理テーブル
-- ADR-027: TeleHealthビデオ通話アーキテクチャ
--
-- 手動実行用マイグレーション
-- 実行方法: Supabase Dashboard > SQL Editor に貼り付けて実行
--           または: supabase db push（ローカル開発環境）
--
-- 依存: ADR-019 の audit_log テーブルが存在すること
--       002_rls.sql の get_my_org_id() ヘルパー関数が存在すること
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. telehealth_sessions テーブル
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS telehealth_sessions (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 関連エンティティ
  org_id               UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  team_id              UUID        REFERENCES teams(id) ON DELETE SET NULL,
  staff_id             UUID        NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  athlete_id           UUID        NOT NULL REFERENCES athletes(id) ON DELETE RESTRICT,

  -- Daily.co ルーム情報
  daily_room_name      TEXT        NOT NULL UNIQUE,
  daily_room_url       TEXT        NOT NULL,

  -- セッション状態
  -- 'scheduled'      : 予約済み（ルーム未開始）
  -- 'active'         : 通話中
  -- 'completed'      : 正常終了
  -- 'cancelled'      : キャンセル
  -- 'no_show'        : スタッフ or アスリートが不参加
  status               TEXT        NOT NULL DEFAULT 'scheduled'
                                   CHECK (status IN ('scheduled', 'active', 'completed', 'cancelled', 'no_show')),

  -- スケジュール
  scheduled_at         TIMESTAMPTZ NOT NULL,
  started_at           TIMESTAMPTZ,
  ended_at             TIMESTAMPTZ,
  duration_seconds     INTEGER     GENERATED ALWAYS AS (
                         CASE
                           WHEN ended_at IS NOT NULL AND started_at IS NOT NULL
                           THEN EXTRACT(EPOCH FROM (ended_at - started_at))::INTEGER
                           ELSE NULL
                         END
                       ) STORED,

  -- Daily.co ルーム設定
  max_duration_minutes INTEGER     NOT NULL DEFAULT 60 CHECK (max_duration_minutes <= 60),
  enable_recording     BOOLEAN     NOT NULL DEFAULT FALSE,

  -- 録画情報（enable_recording = true の場合のみ）
  recording_s3_key     TEXT,       -- S3 パス（pace-cv-sessions/telehealth/{session_id}.mp4）
  daily_recording_id   TEXT,       -- Daily.co 側の録画 ID

  -- 法務コンプライアンス（ADR-027 法務審査フレームワーク）
  -- スタッフ・アスリート双方の同意取得を必須とする
  staff_consent_at     TIMESTAMPTZ,
  athlete_consent_at   TIMESTAMPTZ,

  -- セッション後メモ（スタッフが SOAP Note 作成のための手動メモ）
  post_session_notes   TEXT,

  -- 参加者確認フラグ（Webhook で更新）
  staff_joined_at      TIMESTAMPTZ,
  athlete_joined_at    TIMESTAMPTZ,
  staff_left_at        TIMESTAMPTZ,
  athlete_left_at      TIMESTAMPTZ,

  -- メタデータ
  metadata             JSONB       NOT NULL DEFAULT '{}',

  -- タイムスタンプ
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 2. インデックス
-- -----------------------------------------------------------------------------

-- スタッフが自分のセッション一覧を取得（よく使うクエリ）
CREATE INDEX IF NOT EXISTS idx_telehealth_sessions_staff
  ON telehealth_sessions(staff_id, scheduled_at DESC);

-- アスリートのセッション履歴
CREATE INDEX IF NOT EXISTS idx_telehealth_sessions_athlete
  ON telehealth_sessions(athlete_id, scheduled_at DESC);

-- 組織内の全セッション一覧
CREATE INDEX IF NOT EXISTS idx_telehealth_sessions_org
  ON telehealth_sessions(org_id, scheduled_at DESC);

-- 状態別フィルタリング（active セッションの検索等）
CREATE INDEX IF NOT EXISTS idx_telehealth_sessions_status
  ON telehealth_sessions(status, scheduled_at);

-- Daily.co room_name による検索（Webhook 受信時に使用）
CREATE INDEX IF NOT EXISTS idx_telehealth_sessions_daily_room_name
  ON telehealth_sessions(daily_room_name);

-- -----------------------------------------------------------------------------
-- 3. updated_at 自動更新トリガー
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_telehealth_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER telehealth_sessions_updated_at
  BEFORE UPDATE ON telehealth_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_telehealth_sessions_updated_at();

-- -----------------------------------------------------------------------------
-- 4. RLS（Row Level Security）
-- RLS パターン: staff.id = auth.uid()（既存パターン準拠）
-- -----------------------------------------------------------------------------

ALTER TABLE telehealth_sessions ENABLE ROW LEVEL SECURITY;

-- スタッフは自分の組織内のセッションのみ参照可能
CREATE POLICY "telehealth_sessions_select_staff"
  ON telehealth_sessions
  FOR SELECT
  TO authenticated
  USING (org_id = get_my_org_id());

-- セッション作成はスタッフのみ（自分の org_id で作成）
CREATE POLICY "telehealth_sessions_insert_staff"
  ON telehealth_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id = get_my_org_id()
    AND staff_id = auth.uid()
  );

-- 更新はセッションを作成したスタッフ（staff_id）のみ
CREATE POLICY "telehealth_sessions_update_staff"
  ON telehealth_sessions
  FOR UPDATE
  TO authenticated
  USING (
    org_id = get_my_org_id()
    AND staff_id = auth.uid()
  )
  WITH CHECK (
    org_id = get_my_org_id()
    AND staff_id = auth.uid()
  );

-- 削除はシステム管理者のみ（authenticated ロールからの削除は禁止）
-- service_role が直接操作する
CREATE POLICY "telehealth_sessions_delete_deny"
  ON telehealth_sessions
  FOR DELETE
  TO authenticated
  USING (FALSE);

-- -----------------------------------------------------------------------------
-- 5. PHI 書き込み監査トリガー（ADR-019 継承）
-- -----------------------------------------------------------------------------

-- telehealth_sessions は PHI（セッション参加者情報）を含む
-- 書き込み操作（INSERT / UPDATE / DELETE）を audit_log に記録する
CREATE TRIGGER audit_telehealth_sessions
  AFTER INSERT OR UPDATE OR DELETE ON telehealth_sessions
  FOR EACH ROW
  EXECUTE FUNCTION log_phi_mutation();

-- -----------------------------------------------------------------------------
-- 6. telehealth_consent_records テーブル（同意記録）
-- 法務要件: スタッフ・アスリートの同意を個別に記録・保存
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS telehealth_consent_records (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     UUID        NOT NULL REFERENCES telehealth_sessions(id) ON DELETE CASCADE,
  user_type      TEXT        NOT NULL CHECK (user_type IN ('staff', 'athlete')),
  user_id        UUID        NOT NULL,
  consent_text   TEXT        NOT NULL,  -- 同意時に表示された免責文言のスナップショット
  consented_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address     INET,
  user_agent     TEXT
);

CREATE INDEX IF NOT EXISTS idx_telehealth_consent_session
  ON telehealth_consent_records(session_id);

ALTER TABLE telehealth_consent_records ENABLE ROW LEVEL SECURITY;

-- 同意記録は参照のみ許可（削除・更新は不可）
CREATE POLICY "telehealth_consent_select"
  ON telehealth_consent_records
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM telehealth_sessions ts
      WHERE ts.id = session_id
        AND ts.org_id = get_my_org_id()
    )
  );

CREATE POLICY "telehealth_consent_insert"
  ON telehealth_consent_records
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM telehealth_sessions ts
      WHERE ts.id = session_id
        AND ts.org_id = get_my_org_id()
    )
  );

-- 同意記録の更新・削除は禁止（法務要件）
CREATE POLICY "telehealth_consent_update_deny"
  ON telehealth_consent_records FOR UPDATE TO authenticated USING (FALSE);

CREATE POLICY "telehealth_consent_delete_deny"
  ON telehealth_consent_records FOR DELETE TO authenticated USING (FALSE);

-- -----------------------------------------------------------------------------
-- 実行確認クエリ（コメントを外して確認）
-- -----------------------------------------------------------------------------
-- SELECT table_name, row_security
-- FROM information_schema.tables
-- WHERE table_name IN ('telehealth_sessions', 'telehealth_consent_records');

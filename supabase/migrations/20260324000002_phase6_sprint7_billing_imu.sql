-- =============================================================================
-- Phase 6 Sprint 7: 保険請求連携 + IMUセンサー連携 DB スキーマ
-- ADR-030: IMUセンサーベンダー選定（Polar H10 + react-native-ble-plx）
-- ADR-031: 保険請求パートナーAPI統合方式
--
-- 手動実行用マイグレーション
-- 実行方法: Supabase Dashboard > SQL Editor に貼り付けて実行
-- 依存: 001_initial_schema.sql / 002_rls.sql / Phase 6 telehealth migration
-- =============================================================================

-- =============================================================================
-- SECTION A: 保険請求連携テーブル (P6-028)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A-1. billing_codes テーブル（ICD-10-CM / 診療報酬コードマスター）
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS billing_codes (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code_type    TEXT        NOT NULL CHECK (code_type IN ('ICD10CM', 'shinryo_hoshu')),
  code         TEXT        NOT NULL,
  description  TEXT        NOT NULL,
  description_ja TEXT,
  unit_price   INTEGER,    -- 診療報酬点数（ICD10CM は NULL）
  is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (code_type, code)
);

COMMENT ON TABLE billing_codes IS 'ICD-10-CM 傷病コード + 診療報酬点数表マスター (ADR-031)';

CREATE INDEX IF NOT EXISTS idx_billing_codes_type_code ON billing_codes(code_type, code);
CREATE INDEX IF NOT EXISTS idx_billing_codes_active     ON billing_codes(is_active);

-- RLS
ALTER TABLE billing_codes ENABLE ROW LEVEL SECURITY;

-- 全スタッフが参照可能（マスターデータ）
CREATE POLICY "billing_codes_select"
  ON billing_codes FOR SELECT TO authenticated USING (TRUE);

-- 書き込みは service_role のみ（マスターデータ更新はバックエンドのみ）
CREATE POLICY "billing_codes_insert_deny"
  ON billing_codes FOR INSERT TO authenticated WITH CHECK (FALSE);

CREATE POLICY "billing_codes_update_deny"
  ON billing_codes FOR UPDATE TO authenticated USING (FALSE);

-- -----------------------------------------------------------------------------
-- A-2. billing_claims テーブル（請求レコード）
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS billing_claims (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- 関連エンティティ
  athlete_id          UUID        NOT NULL REFERENCES athletes(id)  ON DELETE RESTRICT,
  staff_id            UUID        NOT NULL REFERENCES staff(id)     ON DELETE RESTRICT,
  soap_note_id        UUID        REFERENCES soap_notes(id)         ON DELETE SET NULL,
  assessment_id       UUID        REFERENCES assessments(id)        ON DELETE SET NULL,

  -- 請求コード（AIが抽出したコードをスタッフが承認）
  diagnosis_code      TEXT,       -- ICD-10-CM コード（billing_codes.code）
  diagnosis_label     TEXT,       -- コード説明（キャッシュ）
  procedure_codes     JSONB       NOT NULL DEFAULT '[]',
  -- [{code: string, description: string, unit_price: integer, quantity: integer}]

  -- 請求金額
  total_points        INTEGER,    -- 診療報酬点数合計
  claim_amount_yen    INTEGER,    -- 請求金額（円）

  -- 請求ステータス
  -- draft: 作成中（AI抽出済み、未承認）
  -- pending_review: スタッフレビュー待ち
  -- submitted: パートナーAPIに送信済み
  -- paid: 支払完了
  -- rejected: 差し戻し
  status              TEXT        NOT NULL DEFAULT 'draft'
                                  CHECK (status IN ('draft', 'pending_review', 'submitted', 'paid', 'rejected')),

  -- パートナーAPI連携
  claim_reference_id  UUID        NOT NULL DEFAULT gen_random_uuid(), -- 冪等性キー
  partner_claim_id    TEXT,       -- パートナーシステム側のID（送信後に設定）
  submitted_at        TIMESTAMPTZ,
  partner_response    JSONB,      -- パートナーAPIからのレスポンス

  -- 審査
  reviewed_by         UUID        REFERENCES staff(id) ON DELETE SET NULL,
  reviewed_at         TIMESTAMPTZ,
  rejection_reason    TEXT,

  -- メタデータ
  notes               TEXT,
  ai_extracted        BOOLEAN     NOT NULL DEFAULT FALSE, -- AI自動抽出フラグ
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE billing_claims IS '保険請求レコード。AIによるSOAP自動コーディング → スタッフ承認 → パートナーAPI送信フロー (ADR-031)';

CREATE INDEX IF NOT EXISTS idx_billing_claims_org    ON billing_claims(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_claims_status ON billing_claims(org_id, status);
CREATE INDEX IF NOT EXISTS idx_billing_claims_athlete ON billing_claims(athlete_id);

-- updated_at トリガー
CREATE OR REPLACE FUNCTION update_billing_claims_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER billing_claims_updated_at
  BEFORE UPDATE ON billing_claims
  FOR EACH ROW EXECUTE FUNCTION update_billing_claims_updated_at();

-- RLS
ALTER TABLE billing_claims ENABLE ROW LEVEL SECURITY;

-- master ロールのみ請求データを参照・操作可能
CREATE POLICY "billing_claims_select_master"
  ON billing_claims FOR SELECT TO authenticated
  USING (
    org_id = get_my_org_id()
    AND EXISTS (
      SELECT 1 FROM staff s
      WHERE s.id = auth.uid() AND s.role = 'master'
    )
  );

CREATE POLICY "billing_claims_insert_master"
  ON billing_claims FOR INSERT TO authenticated
  WITH CHECK (
    org_id = get_my_org_id()
    AND EXISTS (
      SELECT 1 FROM staff s
      WHERE s.id = auth.uid() AND s.role = 'master'
    )
  );

CREATE POLICY "billing_claims_update_master"
  ON billing_claims FOR UPDATE TO authenticated
  USING (
    org_id = get_my_org_id()
    AND EXISTS (
      SELECT 1 FROM staff s
      WHERE s.id = auth.uid() AND s.role = 'master'
    )
  );

CREATE POLICY "billing_claims_delete_deny"
  ON billing_claims FOR DELETE TO authenticated USING (FALSE);

-- =============================================================================
-- SECTION B: IMUセンサー連携テーブル (P6-032)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- B-1. imu_devices テーブル（センサーデバイスペアリング情報）
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS imu_devices (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  athlete_id      UUID        NOT NULL REFERENCES athletes(id)      ON DELETE CASCADE,

  -- BLE デバイス情報
  device_name     TEXT        NOT NULL,   -- "Polar H10 XXXXXXXX"
  device_id       TEXT        NOT NULL,   -- BLE デバイスアドレス（MAC or UUID）
  vendor          TEXT        NOT NULL DEFAULT 'polar',
                                          -- 'polar' | 'catapult' | 'generic'
  model           TEXT,                   -- "H10", "Vector" 等

  -- ペアリング状態
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  paired_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at    TIMESTAMPTZ,

  -- ファームウェア情報
  firmware_version TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (org_id, device_id)
);

COMMENT ON TABLE imu_devices IS 'IMU/BLEセンサーデバイスペアリング情報。Polar H10対応 (ADR-030)';

CREATE INDEX IF NOT EXISTS idx_imu_devices_athlete ON imu_devices(athlete_id);
CREATE INDEX IF NOT EXISTS idx_imu_devices_org     ON imu_devices(org_id);

CREATE OR REPLACE FUNCTION update_imu_devices_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER imu_devices_updated_at
  BEFORE UPDATE ON imu_devices
  FOR EACH ROW EXECUTE FUNCTION update_imu_devices_updated_at();

-- RLS
ALTER TABLE imu_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "imu_devices_select"
  ON imu_devices FOR SELECT TO authenticated
  USING (org_id = get_my_org_id());

CREATE POLICY "imu_devices_insert"
  ON imu_devices FOR INSERT TO authenticated
  WITH CHECK (org_id = get_my_org_id());

CREATE POLICY "imu_devices_update"
  ON imu_devices FOR UPDATE TO authenticated
  USING (org_id = get_my_org_id());

CREATE POLICY "imu_devices_delete"
  ON imu_devices FOR DELETE TO authenticated
  USING (org_id = get_my_org_id());

-- -----------------------------------------------------------------------------
-- B-2. imu_sessions テーブル（IMUセンサーセッションデータ）
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS imu_sessions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  athlete_id      UUID        NOT NULL REFERENCES athletes(id)      ON DELETE CASCADE,
  device_id       UUID        NOT NULL REFERENCES imu_devices(id)   ON DELETE CASCADE,

  -- セッション情報
  session_date    DATE        NOT NULL,
  started_at      TIMESTAMPTZ NOT NULL,
  ended_at        TIMESTAMPTZ,
  duration_seconds INTEGER    GENERATED ALWAYS AS (
    CASE
      WHEN ended_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (ended_at - started_at))::INTEGER
      ELSE NULL
    END
  ) STORED,

  -- 集計指標（センサーから計算）
  player_load     NUMERIC(10, 4),   -- PlayerLoad（加速度ベース）
  avg_hr          INTEGER,          -- 平均心拍数（bpm）
  max_hr          INTEGER,          -- 最大心拍数
  hrv_rmssd       NUMERIC(8, 3),    -- HRV RMSSD（ms）
  steps           INTEGER,          -- 歩数
  distance_m      NUMERIC(10, 2),   -- 移動距離（m）

  -- 生データ参照（S3 保存パス）
  raw_data_s3_key TEXT,

  -- ACWR 統合フラグ
  integrated_to_acwr BOOLEAN  NOT NULL DEFAULT FALSE,
  acwr_date          DATE,    -- athlete_condition_cache に反映した日付

  -- 品質フラグ
  data_quality    TEXT        DEFAULT 'good'
                              CHECK (data_quality IN ('good', 'poor', 'incomplete')),
  notes           TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE imu_sessions IS 'IMUセンサーセッションデータ。PlayerLoad を daily_load として ACWR に統合 (ADR-030)';

CREATE INDEX IF NOT EXISTS idx_imu_sessions_athlete_date ON imu_sessions(athlete_id, session_date DESC);
CREATE INDEX IF NOT EXISTS idx_imu_sessions_org_date     ON imu_sessions(org_id, session_date DESC);
CREATE INDEX IF NOT EXISTS idx_imu_sessions_acwr         ON imu_sessions(athlete_id, integrated_to_acwr);

-- RLS
ALTER TABLE imu_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "imu_sessions_select"
  ON imu_sessions FOR SELECT TO authenticated
  USING (org_id = get_my_org_id());

CREATE POLICY "imu_sessions_insert"
  ON imu_sessions FOR INSERT TO authenticated
  WITH CHECK (org_id = get_my_org_id());

CREATE POLICY "imu_sessions_update"
  ON imu_sessions FOR UPDATE TO authenticated
  USING (org_id = get_my_org_id());

CREATE POLICY "imu_sessions_delete_deny"
  ON imu_sessions FOR DELETE TO authenticated USING (FALSE);

-- =============================================================================
-- 実行確認クエリ（コメントを外して確認）
-- =============================================================================
-- SELECT table_name FROM information_schema.tables
-- WHERE table_name IN (
--   'billing_codes', 'billing_claims', 'imu_devices', 'imu_sessions'
-- );

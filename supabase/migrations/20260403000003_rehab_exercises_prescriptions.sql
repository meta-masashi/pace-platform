-- ============================================================
-- rehab_exercises: リハビリ種目マスタ
-- リハビリ・シミュレータが参照する種目別パラメータ
-- ============================================================

CREATE TABLE IF NOT EXISTS rehab_exercises (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  name_en           TEXT,
  category          TEXT NOT NULL CHECK (category IN (
    'OKC', 'CKC', 'balance', 'agility', 'sport_specific', 'stretching', 'strengthening'
  )),
  target_tissue     TEXT NOT NULL,
  intensity_level   TEXT NOT NULL CHECK (intensity_level IN ('low', 'medium', 'high')),
  tissue_load       JSONB NOT NULL DEFAULT '{"target": 0.0, "adjacent": 0.0}',
  expected_effect   JSONB DEFAULT '{}',
  min_phase         SMALLINT NOT NULL DEFAULT 1 CHECK (min_phase BETWEEN 1 AND 4),
  contraindications TEXT[] DEFAULT '{}',
  sport_tags        TEXT[] DEFAULT '{}',
  description       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE rehab_exercises IS
  'リハビリ種目マスタ。種目ごとの組織負荷・効果・最低フェーズ・禁忌を定義';

CREATE INDEX idx_rehab_exercises_category ON rehab_exercises(category);
CREATE INDEX idx_rehab_exercises_tissue ON rehab_exercises(target_tissue);
CREATE INDEX idx_rehab_exercises_phase ON rehab_exercises(min_phase);

-- RLS: 全ユーザー読み取り可、書き込みはスタッフのみ
ALTER TABLE rehab_exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "all_read" ON rehab_exercises
  FOR SELECT USING (true);

CREATE POLICY "staff_insert" ON rehab_exercises
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM staff WHERE id = auth.uid())
  );

CREATE POLICY "staff_update" ON rehab_exercises
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM staff WHERE id = auth.uid())
  );

-- ============================================================
-- rehab_prescriptions: リハビリ処方
-- 選手の rehab_program に紐づく種目処方
-- ============================================================

CREATE TABLE IF NOT EXISTS rehab_prescriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id      UUID NOT NULL REFERENCES rehab_programs(id) ON DELETE CASCADE,
  athlete_id      UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  exercise_id     UUID NOT NULL REFERENCES rehab_exercises(id),
  start_day       SMALLINT NOT NULL CHECK (start_day >= 0),
  end_day         SMALLINT CHECK (end_day IS NULL OR end_day >= start_day),
  sets            SMALLINT CHECK (sets IS NULL OR sets > 0),
  reps            SMALLINT CHECK (reps IS NULL OR reps > 0),
  duration_sec    SMALLINT CHECK (duration_sec IS NULL OR duration_sec > 0),
  notes           TEXT,
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'completed', 'cancelled')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE rehab_prescriptions IS
  'リハビリプログラムに紐づく種目処方。start_day は受傷後の日数';

CREATE INDEX idx_rehab_rx_program ON rehab_prescriptions(program_id);
CREATE INDEX idx_rehab_rx_athlete ON rehab_prescriptions(athlete_id);
CREATE INDEX idx_rehab_rx_status ON rehab_prescriptions(status) WHERE status = 'active';

-- RLS
ALTER TABLE rehab_prescriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_own_org" ON rehab_prescriptions
  FOR ALL USING (
    athlete_id IN (
      SELECT a.id FROM athletes a
      WHERE a.org_id IN (SELECT org_id FROM staff WHERE id = auth.uid())
    )
  );

-- updated_at 自動更新トリガー
CREATE OR REPLACE FUNCTION update_rehab_prescription_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_rehab_prescription_updated
  BEFORE UPDATE ON rehab_prescriptions
  FOR EACH ROW EXECUTE FUNCTION update_rehab_prescription_timestamp();

-- ============================================================
-- 初期シードデータ: 汎用リハビリ種目
-- ============================================================

INSERT INTO rehab_exercises (name, name_en, category, target_tissue, intensity_level, tissue_load, expected_effect, min_phase, contraindications, sport_tags, description) VALUES
-- Phase 1: 急性期（低強度）
('膝伸展（OKC）', 'Knee Extension (OKC)', 'OKC', 'quadriceps', 'low',
 '{"target": 0.1, "adjacent": 0.05}',
 '{"ROM": "+", "strength": "+"}',
 1, '{}', '{"soccer","basketball","rugby"}',
 'セッティングでの膝伸展。急性期から実施可能'),

('足関節ポンピング', 'Ankle Pumping', 'OKC', 'ankle', 'low',
 '{"target": 0.05, "adjacent": 0.02}',
 '{"circulation": "++", "ROM": "+"}',
 1, '{}', '{"soccer","basketball","baseball","rugby"}',
 '循環促進目的。ベッド上で即日開始'),

('SLR（下肢挙上）', 'Straight Leg Raise', 'OKC', 'hip_flexor', 'low',
 '{"target": 0.1, "adjacent": 0.05}',
 '{"strength": "+", "neuromuscular": "+"}',
 1, '{}', '{"soccer","basketball","rugby"}',
 '股関節屈曲筋力維持。急性期から'),

('タオルギャザー', 'Towel Gathering', 'OKC', 'foot_intrinsic', 'low',
 '{"target": 0.05, "adjacent": 0.02}',
 '{"strength": "+", "proprioception": "+"}',
 1, '{}', '{"soccer","basketball","baseball","rugby"}',
 '足部固有筋の賦活'),

-- Phase 2: 修正練習期（低〜中強度）
('ミニスクワット', 'Mini Squat', 'CKC', 'quadriceps', 'low',
 '{"target": 0.2, "adjacent": 0.1}',
 '{"strength": "++", "ROM": "+"}',
 2, '{"ACL_acute"}', '{"soccer","basketball","rugby"}',
 '膝屈曲30°までのスクワット'),

('カーフレイズ', 'Calf Raise', 'CKC', 'gastrocnemius', 'low',
 '{"target": 0.15, "adjacent": 0.05}',
 '{"strength": "++", "endurance": "+"}',
 2, '{}', '{"soccer","basketball","baseball","rugby"}',
 '両脚でのカーフレイズ'),

('バランスボード', 'Balance Board', 'balance', 'ankle', 'low',
 '{"target": 0.1, "adjacent": 0.05}',
 '{"proprioception": "++", "neuromuscular": "+"}',
 2, '{}', '{"soccer","basketball","rugby"}',
 '固有受容覚の再教育'),

('片脚立ち', 'Single Leg Stand', 'balance', 'ankle', 'low',
 '{"target": 0.1, "adjacent": 0.05}',
 '{"proprioception": "++", "stability": "+"}',
 2, '{}', '{"soccer","basketball","baseball","rugby"}',
 '目開き→目閉じへ段階的に'),

('サイドランジ', 'Side Lunge', 'CKC', 'hip_adductor', 'medium',
 '{"target": 0.3, "adjacent": 0.15}',
 '{"strength": "++", "ROM": "++", "flexibility": "+"}',
 2, '{"MCL_acute","groin_acute"}', '{"soccer","basketball","rugby"}',
 '内転筋群の強化とストレッチ'),

('片脚RDL', 'Single Leg RDL', 'CKC', 'hamstring', 'medium',
 '{"target": 0.25, "adjacent": 0.1}',
 '{"strength": "++", "balance": "++", "posterior_chain": "++"}',
 2, '{"hamstring_acute"}', '{"soccer","basketball","rugby"}',
 '後面連鎖の強化。Phase 2後半から'),

-- Phase 3: 段階的復帰（中〜高強度）
('ラテラルステップ', 'Lateral Step', 'agility', 'hip_abductor', 'medium',
 '{"target": 0.35, "adjacent": 0.15}',
 '{"agility": "++", "strength": "+", "neuromuscular": "++"}',
 3, '{"ankle_acute","MCL_acute"}', '{"soccer","basketball","rugby"}',
 '側方移動パターンの再獲得'),

('フォワードランジ', 'Forward Lunge', 'CKC', 'quadriceps', 'medium',
 '{"target": 0.3, "adjacent": 0.15}',
 '{"strength": "++", "ROM": "+", "stability": "+"}',
 3, '{"ACL_subacute"}', '{"soccer","basketball","rugby"}',
 '前方ランジ。膝安定性の強化'),

('ジョギング', 'Jogging', 'agility', 'cardiovascular', 'medium',
 '{"target": 0.3, "adjacent": 0.2}',
 '{"endurance": "++", "cardiovascular": "++"}',
 3, '{"stress_fracture"}', '{"soccer","basketball","rugby"}',
 '直線ジョギングから開始'),

('ボックスジャンプ（低）', 'Box Jump (Low)', 'agility', 'quadriceps', 'medium',
 '{"target": 0.4, "adjacent": 0.2}',
 '{"power": "++", "neuromuscular": "++"}',
 3, '{"ACL_subacute","patellar_tendon"}', '{"soccer","basketball"}',
 '低い台（20-30cm）でのジャンプ着地'),

('チューブトレーニング（肩）', 'Tubing Shoulder Exercise', 'OKC', 'rotator_cuff', 'low',
 '{"target": 0.15, "adjacent": 0.05}',
 '{"strength": "++", "stability": "+"}',
 2, '{}', '{"baseball"}',
 '投球肩のインナーマッスル強化'),

('スローイングプログラム（段階1）', 'Throwing Program Phase 1', 'sport_specific', 'shoulder', 'medium',
 '{"target": 0.35, "adjacent": 0.2}',
 '{"sport_specific": "++", "neuromuscular": "+"}',
 3, '{"shoulder_acute","UCL_acute"}', '{"baseball"}',
 '短距離・低強度からの段階的投球再開'),

-- Phase 4: フル復帰（高強度・競技特異的）
('カッティング（軽）', 'Light Cutting', 'agility', 'knee', 'high',
 '{"target": 0.5, "adjacent": 0.25}',
 '{"agility": "+++", "sport_specific": "++", "neuromuscular": "++"}',
 4, '{"ACL_subacute","MCL_subacute"}', '{"soccer","basketball","rugby"}',
 '方向転換動作。低速から開始'),

('スプリント', 'Sprint', 'agility', 'hamstring', 'high',
 '{"target": 0.6, "adjacent": 0.3}',
 '{"speed": "+++", "power": "++"}',
 4, '{"hamstring_subacute"}', '{"soccer","basketball","rugby"}',
 '70% → 80% → 90% → 100% と段階的に'),

('コンタクトドリル', 'Contact Drill', 'sport_specific', 'full_body', 'high',
 '{"target": 0.7, "adjacent": 0.4}',
 '{"sport_specific": "+++", "confidence": "++"}',
 4, '{"rib_fracture","concussion_recent"}', '{"rugby"}',
 'ラグビー特有の接触プレー段階的導入'),

('フルスローイング', 'Full Throwing', 'sport_specific', 'shoulder', 'high',
 '{"target": 0.6, "adjacent": 0.35}',
 '{"sport_specific": "+++", "power": "++"}',
 4, '{"shoulder_subacute","UCL_subacute"}', '{"baseball"}',
 '試合強度でのフルスローイング');

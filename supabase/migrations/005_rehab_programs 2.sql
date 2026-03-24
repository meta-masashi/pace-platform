-- ========================================
-- PACE v3.0 — リハビリ管理
-- 実行手順: Supabase ダッシュボード → SQL エディタ → 実行 → 「実行完了」と返信
-- 前提: 004_assessments.sql 実行済み
-- ========================================

-- ========================================
-- exercises テーブル（エクササイズDB: Excelからインポート）
-- ========================================
CREATE TABLE IF NOT EXISTS public.exercises (
  id                          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category                    TEXT,
  phase                       INTEGER,
  name_en                     TEXT,
  name_ja                     TEXT,
  target_axis                 TEXT,
  sets                        INTEGER,
  reps                        TEXT,
  time_sec                    INTEGER,
  percent_1rm                 FLOAT,
  rpe                         INTEGER CHECK (rpe >= 1 AND rpe <= 10),
  cues                        TEXT,
  progressions                JSONB DEFAULT '[]',
  contraindication_tags_json  JSONB DEFAULT '[]',
  created_at                  TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at                  TIMESTAMPTZ DEFAULT now() NOT NULL
);

DROP TRIGGER IF EXISTS handle_updated_at ON public.exercises;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.exercises
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ========================================
-- rehab_programs テーブル
-- ========================================
CREATE TABLE IF NOT EXISTS public.rehab_programs (
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  athlete_id           UUID NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  org_id               UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  diagnosis_code       TEXT,
  current_phase        INTEGER NOT NULL DEFAULT 1 CHECK (current_phase BETWEEN 1 AND 4),
  start_date           DATE NOT NULL,
  estimated_rtp_date   DATE,
  status               TEXT NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active', 'completed', 'on_hold')),
  created_at           TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at           TIMESTAMPTZ DEFAULT now() NOT NULL
);

DROP TRIGGER IF EXISTS handle_updated_at ON public.rehab_programs;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.rehab_programs
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ========================================
-- rehab_phase_gates テーブル（フェーズ進捗ゲート）
-- ========================================
CREATE TABLE IF NOT EXISTS public.rehab_phase_gates (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  program_id            UUID NOT NULL REFERENCES public.rehab_programs(id) ON DELETE CASCADE,
  org_id                UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  phase                 INTEGER NOT NULL CHECK (phase BETWEEN 1 AND 4),
  gate_criteria_json    JSONB DEFAULT '{}',
  gate_met_at           TIMESTAMPTZ,
  verified_by_staff_id  UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at            TIMESTAMPTZ DEFAULT now() NOT NULL
);

DROP TRIGGER IF EXISTS handle_updated_at ON public.rehab_phase_gates;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.rehab_phase_gates
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ========================================
-- workouts テーブル（AI生成メニュー）
-- ========================================
CREATE TABLE IF NOT EXISTS public.workouts (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  athlete_id            UUID REFERENCES public.athletes(id) ON DELETE CASCADE,
  team_id               UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  org_id                UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  generated_by_ai       BOOLEAN NOT NULL DEFAULT TRUE,
  generated_at          TIMESTAMPTZ DEFAULT now() NOT NULL,
  approved_by_staff_id  UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  approved_at           TIMESTAMPTZ,
  distributed_at        TIMESTAMPTZ,
  menu_json             JSONB DEFAULT '{}',
  created_at            TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at            TIMESTAMPTZ DEFAULT now() NOT NULL,
  -- athlete_id または team_id のいずれか一方が必須
  CONSTRAINT workouts_target_check CHECK (
    (athlete_id IS NOT NULL) OR (team_id IS NOT NULL)
  )
);

DROP TRIGGER IF EXISTS handle_updated_at ON public.workouts;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.workouts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ========================================
-- soap_notes テーブル
-- ========================================
CREATE TABLE IF NOT EXISTS public.soap_notes (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  athlete_id   UUID NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  org_id       UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  staff_id     UUID NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  s_text       TEXT,
  o_text       TEXT,
  a_text       TEXT,
  p_text       TEXT,
  ai_assisted  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at   TIMESTAMPTZ DEFAULT now() NOT NULL
);

DROP TRIGGER IF EXISTS handle_updated_at ON public.soap_notes;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.soap_notes
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ========================================
-- RLS の有効化
-- ========================================
ALTER TABLE public.exercises          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rehab_programs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rehab_phase_gates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workouts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.soap_notes         ENABLE ROW LEVEL SECURITY;

-- ※ ポリシー詳細は 008_rls_policies.sql で定義

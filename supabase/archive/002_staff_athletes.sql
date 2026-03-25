-- ========================================
-- PACE v3.0 — スタッフ・選手管理
-- 実行手順: Supabase ダッシュボード → SQL エディタ → 実行 → 「実行完了」と返信
-- 前提: 001_organizations_teams.sql 実行済み
-- ========================================

-- ========================================
-- staff テーブル
-- id = Supabase Auth の uid と一致させる
-- ========================================
CREATE TABLE IF NOT EXISTS public.staff (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  team_id     UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  role        TEXT NOT NULL CHECK (role IN ('master', 'AT', 'PT', 'S&C')),
  is_leader   BOOLEAN NOT NULL DEFAULT FALSE,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT now() NOT NULL
);

DROP TRIGGER IF EXISTS handle_updated_at ON public.staff;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ========================================
-- athletes テーブル
-- ========================================
CREATE TABLE IF NOT EXISTS public.athletes (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id         UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  team_id        UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  name           TEXT NOT NULL,
  position       TEXT,
  number         INTEGER,
  age            INTEGER,
  sex            TEXT CHECK (sex IN ('male', 'female', 'other')),
  sport          TEXT,                        -- 競技種目（動的事前確率算出に使用）
  profile_photo  TEXT,                        -- Supabase Storage URL
  created_at     TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at     TIMESTAMPTZ DEFAULT now() NOT NULL
);

DROP TRIGGER IF EXISTS handle_updated_at ON public.athletes;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.athletes
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ========================================
-- athlete_locks テーブル（Hard / Soft Lock）
-- ========================================
CREATE TABLE IF NOT EXISTS public.athlete_locks (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  athlete_id       UUID NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  set_by_staff_id  UUID NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  lock_type        TEXT NOT NULL CHECK (lock_type IN ('hard', 'soft')),
  tag              TEXT NOT NULL,
  reason           TEXT,
  set_at           TIMESTAMPTZ DEFAULT now() NOT NULL,
  expires_at       TIMESTAMPTZ
);

-- ========================================
-- RLS の有効化
-- ========================================
ALTER TABLE public.staff         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.athletes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.athlete_locks ENABLE ROW LEVEL SECURITY;

-- ※ ポリシー詳細は 008_rls_policies.sql で定義

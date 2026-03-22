-- athlete_invites table
CREATE TABLE IF NOT EXISTS public.athlete_invites (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code         TEXT        UNIQUE NOT NULL,
  org_id       UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  team_id      UUID        NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  athlete_name TEXT,
  created_by   UUID        REFERENCES public.staff(id),
  used_at      TIMESTAMPTZ,
  used_by_athlete_id UUID REFERENCES public.athletes(id),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_athlete_invites_code ON public.athlete_invites(code);
CREATE INDEX IF NOT EXISTS idx_athlete_invites_team ON public.athlete_invites(team_id);

COMMENT ON TABLE public.athlete_invites IS '選手招待コード — スタッフが発行し選手が新規登録時に使用';
COMMENT ON COLUMN public.athlete_invites.code IS '8文字英数字の招待コード（1回使い切り）';

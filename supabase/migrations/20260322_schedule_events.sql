-- TABLE: schedule_events
CREATE TABLE IF NOT EXISTS public.schedule_events (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       UUID        NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  title         TEXT        NOT NULL,
  event_type    TEXT        NOT NULL CHECK (event_type IN ('practice','match','recovery','meeting','off')),
  start_time    TIMESTAMPTZ NOT NULL,
  end_time      TIMESTAMPTZ NOT NULL,
  location      TEXT,
  notes         TEXT,
  created_by    UUID        REFERENCES public.staff(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schedule_events_team_id ON public.schedule_events(team_id);
CREATE INDEX IF NOT EXISTS idx_schedule_events_start_time ON public.schedule_events(team_id, start_time);

-- RLS
ALTER TABLE public.schedule_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "schedule_events_select" ON public.schedule_events;
CREATE POLICY "schedule_events_select" ON public.schedule_events
  FOR SELECT USING (
    team_id IN (
      SELECT id FROM public.teams WHERE org_id = (
        SELECT org_id FROM public.staff WHERE id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "schedule_events_insert" ON public.schedule_events;
CREATE POLICY "schedule_events_insert" ON public.schedule_events
  FOR INSERT WITH CHECK (
    team_id IN (
      SELECT id FROM public.teams WHERE org_id = (
        SELECT org_id FROM public.staff WHERE id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "schedule_events_update" ON public.schedule_events;
CREATE POLICY "schedule_events_update" ON public.schedule_events
  FOR UPDATE USING (
    team_id IN (
      SELECT id FROM public.teams WHERE org_id = (
        SELECT org_id FROM public.staff WHERE id = auth.uid()
      )
    )
  );

-- Allow service role to bypass RLS for seeding
DROP POLICY IF EXISTS "schedule_events_service_role" ON public.schedule_events;
CREATE POLICY "schedule_events_service_role" ON public.schedule_events
  USING (true) WITH CHECK (true);

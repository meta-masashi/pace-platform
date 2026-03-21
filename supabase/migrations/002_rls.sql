-- Enable RLS on all tables
alter table organizations enable row level security;
alter table teams enable row level security;
alter table staff enable row level security;
alter table athletes enable row level security;
alter table daily_metrics enable row level security;
alter table assessment_nodes enable row level security;
alter table alpha_chains enable row level security;
alter table assessments enable row level security;
alter table assessment_responses enable row level security;
alter table athlete_locks enable row level security;
alter table exercises enable row level security;
alter table rehab_programs enable row level security;
alter table rehab_phase_gates enable row level security;
alter table workouts enable row level security;
alter table soap_notes enable row level security;
alter table rtp_injury_nodes enable row level security;
alter table mc_tracking enable row level security;
alter table channels enable row level security;
alter table messages enable row level security;
alter table audit_logs enable row level security;

-- Helper function: get current user's org_id
create or replace function get_my_org_id()
returns uuid
language sql stable
as $$
  select org_id from staff where id = auth.uid()
$$;

-- Helper function: check if current user has a role
create or replace function has_role(check_role text)
returns boolean
language sql stable
as $$
  select exists(
    select 1 from staff
    where id = auth.uid()
    and role = check_role
    and is_active = true
  )
$$;

-- Helper function: check if master role
create or replace function is_master()
returns boolean
language sql stable
as $$
  select has_role('master')
$$;

-- Organizations: user can see their own org
create policy "org_select" on organizations for select
  using (id = get_my_org_id());

-- Teams: org-scoped
create policy "teams_select" on teams for select
  using (org_id = get_my_org_id());

create policy "teams_modify" on teams for all
  using (org_id = get_my_org_id() and is_master());

-- Staff: org-scoped
create policy "staff_select" on staff for select
  using (org_id = get_my_org_id());

create policy "staff_insert" on staff for insert
  with check (org_id = get_my_org_id() and is_master());

create policy "staff_update" on staff for update
  using (org_id = get_my_org_id() and (id = auth.uid() or is_master()));

-- Athletes: org-scoped
create policy "athletes_select" on athletes for select
  using (org_id = get_my_org_id());

create policy "athletes_modify" on athletes for all
  using (org_id = get_my_org_id() and is_master());

-- Daily metrics: org-scoped via athlete
create policy "daily_metrics_select" on daily_metrics for select
  using (athlete_id in (select id from athletes where org_id = get_my_org_id()));

create policy "daily_metrics_insert" on daily_metrics for insert
  with check (athlete_id in (select id from athletes where org_id = get_my_org_id()));

-- Assessment nodes: public read (shared knowledge base)
create policy "assessment_nodes_read" on assessment_nodes for select
  using (true);

create policy "assessment_nodes_write" on assessment_nodes for all
  using (is_master());

-- Alpha chains: public read
create policy "alpha_chains_read" on alpha_chains for select
  using (true);

-- Exercises: public read
create policy "exercises_read" on exercises for select
  using (true);

-- Assessments: org-scoped
create policy "assessments_select" on assessments for select
  using (athlete_id in (select id from athletes where org_id = get_my_org_id()));

create policy "assessments_insert" on assessments for insert
  with check (
    athlete_id in (select id from athletes where org_id = get_my_org_id())
    and staff_id = auth.uid()
  );

create policy "assessments_update" on assessments for update
  using (
    athlete_id in (select id from athletes where org_id = get_my_org_id())
    and staff_id = auth.uid()
  );

-- Assessment responses: org-scoped via assessment
create policy "assessment_responses_select" on assessment_responses for select
  using (assessment_id in (
    select id from assessments where athlete_id in (
      select id from athletes where org_id = get_my_org_id()
    )
  ));

create policy "assessment_responses_insert" on assessment_responses for insert
  with check (assessment_id in (
    select id from assessments where staff_id = auth.uid()
  ));

-- Athlete locks: org-scoped; HARD LOCK write = master only
create policy "locks_select" on athlete_locks for select
  using (athlete_id in (select id from athletes where org_id = get_my_org_id()));

create policy "locks_insert_hard" on athlete_locks for insert
  with check (
    athlete_id in (select id from athletes where org_id = get_my_org_id())
    and (lock_type = 'soft' or is_master())
    and set_by_staff_id = auth.uid()
  );

create policy "locks_update_hard" on athlete_locks for update
  using (
    athlete_id in (select id from athletes where org_id = get_my_org_id())
    and (lock_type = 'soft' or is_master())
  );

-- Rehab programs: org-scoped
create policy "rehab_programs_select" on rehab_programs for select
  using (athlete_id in (select id from athletes where org_id = get_my_org_id()));

create policy "rehab_programs_modify" on rehab_programs for all
  using (athlete_id in (select id from athletes where org_id = get_my_org_id()));

-- Rehab gates: org-scoped via program
create policy "rehab_gates_all" on rehab_phase_gates for all
  using (program_id in (
    select id from rehab_programs where athlete_id in (
      select id from athletes where org_id = get_my_org_id()
    )
  ));

-- Workouts: org-scoped
create policy "workouts_select" on workouts for select
  using (
    (athlete_id is null or athlete_id in (select id from athletes where org_id = get_my_org_id()))
    and (team_id is null or team_id in (select id from teams where org_id = get_my_org_id()))
  );

create policy "workouts_insert" on workouts for insert
  with check (
    (athlete_id is null or athlete_id in (select id from athletes where org_id = get_my_org_id()))
    and (team_id is null or team_id in (select id from teams where org_id = get_my_org_id()))
  );

-- SOAP notes: org-scoped
create policy "soap_notes_select" on soap_notes for select
  using (athlete_id in (select id from athletes where org_id = get_my_org_id()));

create policy "soap_notes_insert" on soap_notes for insert
  with check (
    athlete_id in (select id from athletes where org_id = get_my_org_id())
    and staff_id = auth.uid()
  );

create policy "soap_notes_update" on soap_notes for update
  using (
    athlete_id in (select id from athletes where org_id = get_my_org_id())
    and staff_id = auth.uid()
  );

-- RTP nodes: public read
create policy "rtp_nodes_read" on rtp_injury_nodes for select using (true);

-- MC tracking: org-scoped via athlete
create policy "mc_tracking_all" on mc_tracking for all
  using (athlete_id in (select id from athletes where org_id = get_my_org_id()));

-- Channels: org-scoped via team
create policy "channels_select" on channels for select
  using (team_id in (select id from teams where org_id = get_my_org_id()));

create policy "channels_modify" on channels for all
  using (team_id in (select id from teams where org_id = get_my_org_id()) and is_master());

-- Messages: org-scoped via channel
create policy "messages_select" on messages for select
  using (channel_id in (
    select id from channels where team_id in (
      select id from teams where org_id = get_my_org_id()
    )
  ));

create policy "messages_insert" on messages for insert
  with check (
    channel_id in (
      select id from channels where team_id in (
        select id from teams where org_id = get_my_org_id()
      )
    )
    and staff_id = auth.uid()
  );

-- Audit logs: org-scoped, insert-only for non-master
create policy "audit_select" on audit_logs for select
  using (org_id = get_my_org_id() and is_master());

create policy "audit_insert" on audit_logs for insert
  with check (org_id = get_my_org_id());

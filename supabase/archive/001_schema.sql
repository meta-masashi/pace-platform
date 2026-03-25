-- Enable required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "vector";     -- pgvector: vector similarity search (RAG / embeddings)

-- Multi-tenant
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan text not null default 'pro' check (plan in ('pro', 'standard')),
  athlete_limit int not null default 30,
  created_at timestamptz not null default now()
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

-- Staff (linked to Supabase Auth users)
create table staff (
  id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  team_id uuid references teams(id),
  name text not null,
  email text not null,
  role text not null check (role in ('master', 'AT', 'PT', 'S&C')),
  is_leader boolean not null default false,
  is_active boolean not null default true,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- Athletes
create table athletes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  team_id uuid references teams(id),
  name text not null,
  position text,
  number int,
  age int,
  sex text check (sex in ('male', 'female')),
  profile_photo text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Daily metrics (check-in data)
create table daily_metrics (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes(id) on delete cascade,
  date date not null default current_date,
  nrs numeric(3,1) not null default 0 check (nrs >= 0 and nrs <= 10),
  hrv numeric(6,2),
  acwr numeric(4,2),
  sleep_score int check (sleep_score between 1 and 5),
  subjective_condition int check (subjective_condition between 1 and 5),
  hp_computed int,
  created_at timestamptz not null default now(),
  unique(athlete_id, date)
);

-- Assessment nodes (imported from Excel)
create table assessment_nodes (
  node_id text primary key,
  file_type text not null check (file_type in ('F1_Acute', 'F2_Chronic', 'F3_Performance')),
  phase text not null,
  category text,
  question_text text not null,
  target_axis text,
  lr_yes numeric(8,4) not null default 1,
  lr_no numeric(8,4) not null default 1,
  kappa numeric(4,3),
  routing_rules jsonb not null default '[]',
  prescription_tags jsonb not null default '[]',
  contraindication_tags jsonb not null default '[]',
  time_decay_lambda numeric(6,4) not null default 0,
  evidence_level text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Alpha chains
create table alpha_chains (
  chain_id text primary key,
  chain_name text not null,
  nodes jsonb not null default '[]',
  causal_reasoning text,
  cross_axis_indicators jsonb not null default '[]',
  created_at timestamptz not null default now()
);

-- Assessments
create table assessments (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes(id) on delete cascade,
  staff_id uuid not null references staff(id),
  assessment_type text not null check (assessment_type in ('F1_Acute', 'F2_Chronic', 'F3_Performance')),
  status text not null default 'in_progress' check (status in ('in_progress', 'completed', 'cancelled')),
  primary_diagnosis_code text,
  primary_diagnosis_label text,
  primary_diagnosis_confidence numeric(4,3),
  differentials jsonb not null default '[]',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table assessment_responses (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments(id) on delete cascade,
  node_id text not null references assessment_nodes(node_id),
  answer text not null check (answer in ('yes', 'no', 'unclear')),
  responded_at timestamptz not null default now()
);

-- Locks
create table athlete_locks (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes(id) on delete cascade,
  set_by_staff_id uuid not null references staff(id),
  lock_type text not null check (lock_type in ('hard', 'soft')),
  tag text not null,
  reason text not null,
  set_at timestamptz not null default now(),
  expires_at timestamptz,
  is_active boolean not null default true
);

-- Exercises (imported from Excel)
create table exercises (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  phase text not null,
  name_en text,
  name_ja text not null,
  target_axis text,
  sets int,
  reps int,
  time_sec int,
  percent_1rm numeric(5,2),
  rpe numeric(4,1),
  cues text,
  progressions text,
  contraindication_tags jsonb not null default '[]',
  created_at timestamptz not null default now()
);

-- Rehab programs
create table rehab_programs (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes(id) on delete cascade,
  diagnosis_code text,
  diagnosis_label text not null,
  current_phase int not null default 1 check (current_phase between 1 and 4),
  start_date date not null default current_date,
  estimated_rtp_date date,
  status text not null default 'active' check (status in ('active', 'completed', 'on_hold')),
  rom numeric(6,2),
  swelling_grade int check (swelling_grade between 0 and 3),
  lsi_percent numeric(5,2),
  created_at timestamptz not null default now()
);

create table rehab_phase_gates (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references rehab_programs(id) on delete cascade,
  phase int not null check (phase between 1 and 4),
  gate_criteria jsonb not null default '{}',
  gate_met_at timestamptz,
  verified_by_staff_id uuid references staff(id),
  created_at timestamptz not null default now()
);

-- Workouts (AI generated menus)
create table workouts (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid references athletes(id) on delete cascade,
  team_id uuid references teams(id),
  workout_type text not null check (workout_type in ('individual', 'team')),
  generated_by_ai boolean not null default true,
  menu jsonb not null default '[]',
  total_duration_min int,
  notes text,
  approved_by_staff_id uuid references staff(id),
  approved_at timestamptz,
  distributed_at timestamptz,
  generated_at timestamptz not null default now(),
  gemini_tokens_used int
);

-- SOAP Notes
create table soap_notes (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes(id) on delete cascade,
  staff_id uuid not null references staff(id),
  s_text text not null default '',
  o_text text not null default '',
  a_text text not null default '',
  p_text text not null default '',
  ai_assisted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RTP injury nodes
create table rtp_injury_nodes (
  node_id text primary key,
  injury_type text not null,
  phase int not null check (phase between 1 and 4),
  gate_criteria jsonb not null default '{}',
  lsi_target numeric(5,2),
  test_battery jsonb not null default '[]',
  created_at timestamptz not null default now()
);

-- MC tracking nodes
create table mc_tracking_nodes (
  node_id text primary key,
  phase text not null,
  question_text text not null,
  lr_yes numeric(8,4),
  lr_no numeric(8,4),
  risk_flags jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table mc_tracking (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes(id) on delete cascade,
  date date not null default current_date,
  cycle_phase text,
  lmp_date date,
  node_responses jsonb not null default '{}',
  risk_flags jsonb not null default '[]',
  created_at timestamptz not null default now(),
  unique(athlete_id, date)
);

-- Community
create table channels (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  name text not null,
  channel_type text not null default 'text',
  created_at timestamptz not null default now(),
  unique(team_id, name)
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels(id) on delete cascade,
  staff_id uuid not null references staff(id),
  content text not null,
  attachments jsonb not null default '[]',
  created_at timestamptz not null default now()
);

-- Audit log
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  staff_id uuid references staff(id),
  action text not null,
  target_type text,
  target_id text,
  details jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);

-- Indexes for performance
create index on daily_metrics (athlete_id, date desc);
create index on assessments (athlete_id, created_at desc);
create index on assessment_responses (assessment_id);
create index on athlete_locks (athlete_id, is_active);
create index on rehab_programs (athlete_id, status);
create index on workouts (athlete_id, generated_at desc);
create index on soap_notes (athlete_id, created_at desc);
create index on audit_logs (org_id, created_at desc);
create index on messages (channel_id, created_at asc);

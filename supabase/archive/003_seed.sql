-- Dev seed: PACE FC
-- Note: actual auth.users entries must be created separately via Supabase Auth API
-- These seeds assume auth user IDs are provided via env vars in seed scripts

insert into organizations (id, name, plan, athlete_limit) values
  ('00000000-0000-0000-0000-000000000001', 'PACE FC', 'pro', 30);

insert into teams (id, org_id, name) values
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'トップチーム');

-- Channels
insert into channels (id, team_id, name) values
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000002', 'medical'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000002', 'team'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000002', 's-and-c'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000002', 'rehab');

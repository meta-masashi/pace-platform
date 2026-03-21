# Supabase Database Setup

## Prerequisites

Install the Supabase CLI:

```bash
brew install supabase/tap/supabase
```

## Running Migrations

### Remote (production / staging)

Push all pending migration files in `supabase/migrations/` to the linked project:

```bash
supabase db push
```

This applies `001_schema.sql`, `002_rls.sql`, and any subsequent migration files in order.

To link a project first:

```bash
supabase link --project-ref <your-project-ref>
```

### Local development

Start the local Supabase stack (requires Docker):

```bash
supabase start
```

Apply migrations to the local instance:

```bash
supabase db reset
```

`db reset` drops the local database, recreates it, runs all migration files in order, then runs any seed SQL found in `supabase/seed.sql`. To include the dev seed data, copy or symlink `migrations/003_seed.sql` to `supabase/seed.sql`:

```bash
cp supabase/migrations/003_seed.sql supabase/seed.sql
supabase db reset
```

## Required Environment Variables

Create a `.env.local` file in the project root with the following values. These are available in the Supabase dashboard under Settings > API.

```env
# Public Supabase URL (safe to expose in browser)
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co

# Public anon key (safe to expose in browser; protected by RLS)
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>

# Service role key (server-side only — never expose to the browser)
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

For local development, `supabase start` prints these values to the terminal after startup. You can also retrieve them at any time with:

```bash
supabase status
```

## Migration File Overview

| File | Purpose |
|---|---|
| `001_schema.sql` | All table definitions, constraints, and performance indexes |
| `002_rls.sql` | Row Level Security policies and helper functions (`get_my_org_id`, `has_role`, `is_master`) |
| `003_seed.sql` | Development seed data: PACE FC org, top team, and default channels |

## RLS Design Notes

- Every table with an `org_id` column (direct or via join) is isolated per organization.
- The `get_my_org_id()` helper resolves the calling user's org by looking up `staff.org_id` via `auth.uid()`.
- `assessment_nodes`, `alpha_chains`, `exercises`, and `rtp_injury_nodes` are shared knowledge bases with public SELECT access.
- Hard locks (`athlete_locks` with `lock_type = 'hard'`) can only be inserted or updated by staff with `role = 'master'`.
- Audit logs are insert-accessible to all staff in the org, but only `master` role can read them.

-- Rate limit sliding window persistence
-- Requires: pg_cron extension for auto-cleanup (see note below)
--
-- SETUP INSTRUCTIONS:
--   1. Enable pg_cron in Supabase dashboard → Database → Extensions → pg_cron
--   2. Then run this migration (or supabase db push)
--   If pg_cron is NOT available, omit the cron.schedule() call below and instead
--   set up a scheduled job (e.g. pg_cron, external cron, or Supabase Edge Function)
--   that runs:  DELETE FROM public.rate_limit_log WHERE ts < now() - interval '2 minutes';

CREATE TABLE IF NOT EXISTS public.rate_limit_log (
  id          bigserial   PRIMARY KEY,
  key         text        NOT NULL,         -- "{userId}:{route}"
  ts          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rate_limit_log_key_ts ON public.rate_limit_log (key, ts);

-- Auto-cleanup: delete rows older than 2 minutes every minute.
-- NOTE: This requires pg_cron. Enable it in Supabase dashboard → Database → Extensions.
-- If pg_cron is not enabled, comment out the SELECT below and handle cleanup manually.
SELECT cron.schedule(
  'rate-limit-cleanup',
  '* * * * *',
  $$DELETE FROM public.rate_limit_log WHERE ts < now() - interval '2 minutes'$$
);

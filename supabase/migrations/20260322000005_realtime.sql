-- Enable Supabase Realtime for messages table
-- Run this in Supabase Dashboard > SQL Editor

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.channels;

-- Add read_by column if not exists (production DB was created without it)
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS read_by JSONB NOT NULL DEFAULT '[]'::jsonb;

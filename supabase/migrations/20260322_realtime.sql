-- Enable Supabase Realtime for messages table
-- Run this in Supabase Dashboard > SQL Editor

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.channels;

-- Ensure read_by column is jsonb (for read receipt upserts)
ALTER TABLE public.messages
  ALTER COLUMN read_by SET DEFAULT '[]'::jsonb,
  ALTER COLUMN read_by SET NOT NULL;

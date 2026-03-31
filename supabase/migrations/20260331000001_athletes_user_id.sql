-- Migration: Add user_id column to athletes table
-- Links athlete records to auth.users for athlete mobile app login.

ALTER TABLE athletes
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_athletes_user_id ON athletes (user_id) WHERE user_id IS NOT NULL;

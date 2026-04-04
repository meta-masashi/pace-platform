-- Migration: Add sport column to organizations and athletes tables
-- Purpose: Enable sport-specific inference pipeline configuration (SportProfile)
-- Related: BUG-11 (onboarding API was not saving sport to organizations)

-- Add sport column to organizations
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS sport TEXT NOT NULL DEFAULT 'other'
  CHECK (sport IN ('soccer', 'baseball', 'basketball', 'rugby', 'other'));

-- Add sport column to athletes (needed by inference pipeline)
ALTER TABLE athletes
  ADD COLUMN IF NOT EXISTS sport TEXT NOT NULL DEFAULT 'soccer'
  CHECK (sport IN ('soccer', 'baseball', 'basketball', 'rugby', 'other'));

-- Add is_contact_sport flag to athletes (used for contact-sport injury risk multiplier)
ALTER TABLE athletes
  ADD COLUMN IF NOT EXISTS is_contact_sport BOOLEAN NOT NULL DEFAULT false;

-- Backfill: If athletes already have sport set, update the organization to match
UPDATE organizations o
SET sport = sub.athlete_sport
FROM (
  SELECT DISTINCT ON (a.org_id)
    a.org_id,
    a.sport AS athlete_sport
  FROM athletes a
  WHERE a.sport IS NOT NULL
    AND a.sport != ''
    AND a.sport IN ('soccer', 'baseball', 'basketball', 'rugby', 'other')
  ORDER BY a.org_id, a.created_at ASC
) sub
WHERE o.id = sub.org_id
  AND o.sport = 'other';

-- Add comment for documentation
COMMENT ON COLUMN organizations.sport IS
  'Sport type selected during team setup. Drives SportProfile selection for inference pipeline and UI/UX customization. Valid: soccer, baseball, basketball, rugby, other.';

-- Index for querying organizations by sport (analytics, filtering)
CREATE INDEX IF NOT EXISTS idx_organizations_sport ON organizations (sport);

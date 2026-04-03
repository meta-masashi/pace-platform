-- Migration: Add sport column to organizations table
-- Purpose: Enable sport-specific inference pipeline configuration (SportProfile)
-- Related: BUG-11 (onboarding API was not saving sport to organizations)

-- Add sport column with CHECK constraint for valid sport IDs
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS sport TEXT NOT NULL DEFAULT 'other'
  CHECK (sport IN ('soccer', 'baseball', 'basketball', 'rugby', 'other'));

-- Backfill: If athletes already have sport set, update the organization to match
UPDATE organizations o
SET sport = sub.athlete_sport
FROM (
  SELECT DISTINCT ON (a.organization_id)
    a.organization_id,
    a.sport AS athlete_sport
  FROM athletes a
  WHERE a.sport IS NOT NULL
    AND a.sport != ''
    AND a.sport IN ('soccer', 'baseball', 'basketball', 'rugby', 'other')
  ORDER BY a.organization_id, a.created_at ASC
) sub
WHERE o.id = sub.organization_id
  AND o.sport = 'other';

-- Add comment for documentation
COMMENT ON COLUMN organizations.sport IS
  'Sport type selected during team setup. Drives SportProfile selection for inference pipeline and UI/UX customization. Valid: soccer, baseball, basketball, rugby, other.';

-- Index for querying organizations by sport (analytics, filtering)
CREATE INDEX IF NOT EXISTS idx_organizations_sport ON organizations (sport);

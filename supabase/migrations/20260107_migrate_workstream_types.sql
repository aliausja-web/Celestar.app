-- Migration: Update Workstream Types to Generic Execution-Focused Values
-- Date: 2026-01-07
-- Purpose: Replace domain-biased types with generic execution types

-- Update existing workstream types to new values
UPDATE workstreams
SET type = CASE
  -- Map legacy values to new execution-focused types
  WHEN type = 'event' OR type = 'events' THEN 'operations_live'
  WHEN type = 'infrastructure' THEN 'build_fitout'
  WHEN type = 'logistics' THEN 'install_logistics'
  WHEN type = 'marketing' THEN 'branding_creative'
  WHEN type = 'operations' THEN 'operations_live'
  WHEN type = 'technology' THEN 'it_systems'
  WHEN type = 'other' THEN 'other'
  -- If already using new values, keep them
  WHEN type IN (
    'site',
    'build_fitout',
    'mep_utilities',
    'install_logistics',
    'it_systems',
    'test_commission',
    'operations_live',
    'compliance_permits',
    'branding_creative',
    'other'
  ) THEN type
  -- Unknown types default to 'other'
  ELSE 'other'
END
WHERE type IS NOT NULL;

-- Add comment to table for documentation
COMMENT ON COLUMN workstreams.type IS 'Execution type: site, build_fitout, mep_utilities, install_logistics, it_systems, test_commission, operations_live, compliance_permits, branding_creative, other. Describes execution structure, not org charts. Metadata only, no effect on status logic.';

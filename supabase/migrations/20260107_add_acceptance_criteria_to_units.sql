-- Add acceptance_criteria column to units table
-- This field stores the criteria that must be met for the unit to be considered complete

ALTER TABLE units ADD COLUMN IF NOT EXISTS acceptance_criteria text;

COMMENT ON COLUMN units.acceptance_criteria IS 'Defines what needs to be done for this unit to be considered complete and approved';

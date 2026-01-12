-- ============================================================================
-- AUTO-UPDATE: Workstream Status on Unit Changes
-- Migration: 20260112_auto_update_workstream_status.sql
-- Date: 2026-01-12
--
-- PURPOSE: Automatically update workstream status when units are added/changed
-- FIXES: Bug where workstream stays PENDING after adding units
-- ============================================================================

-- Create trigger function to update workstream status
CREATE OR REPLACE FUNCTION trigger_update_workstream_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the workstream status whenever a unit is inserted, updated, or deleted
  UPDATE workstreams
  SET overall_status = compute_workstream_status(id),
      last_update_time = now()
  WHERE id = COALESCE(NEW.workstream_id, OLD.workstream_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_unit_update_workstream ON units;

-- Create trigger on units table
CREATE TRIGGER trigger_unit_update_workstream
  AFTER INSERT OR UPDATE OR DELETE ON units
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_workstream_status();

COMMENT ON FUNCTION trigger_update_workstream_status IS 'Automatically updates workstream status when units are added, changed, or removed';

-- Immediately update all workstream statuses to current state
UPDATE workstreams
SET overall_status = compute_workstream_status(id),
    last_update_time = now();

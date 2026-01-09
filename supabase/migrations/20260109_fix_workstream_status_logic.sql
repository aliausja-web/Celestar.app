-- ============================================================================
-- FIX: Workstream Status Logic - Commercial Production Critical
-- Migration: 20260109_fix_workstream_status_logic.sql
-- Date: 2026-01-09
--
-- ISSUE: Workstream status incorrectly computed when workstream has no units
-- SYMPTOM: Empty workstream shows GREEN even though it has no verified units
-- IMPACT: Critical for commercial use - false sense of readiness
--
-- SOLUTION: Workstream is only GREEN if:
--   1. It has at least one unit (not empty)
--   2. ALL units are GREEN (fully verified)
-- Otherwise, workstream is RED
-- ============================================================================

CREATE OR REPLACE FUNCTION compute_workstream_status(workstream_id_param uuid)
RETURNS text AS $$
DECLARE
  v_total_units integer;
  v_green_units integer;
BEGIN
  -- Count total units in this workstream
  SELECT COUNT(*)
  INTO v_total_units
  FROM units
  WHERE workstream_id = workstream_id_param;

  -- If workstream has NO units, it's RED (not ready)
  IF v_total_units = 0 THEN
    RETURN 'RED';
  END IF;

  -- Count GREEN units
  SELECT COUNT(*)
  INTO v_green_units
  FROM units
  WHERE workstream_id = workstream_id_param
  AND computed_status = 'GREEN';

  -- Workstream is GREEN only if ALL units are GREEN
  IF v_green_units = v_total_units THEN
    RETURN 'GREEN';
  ELSE
    RETURN 'RED';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION compute_workstream_status IS 'Computes workstream overall_status. Returns GREEN only if workstream has units AND all units are verified (GREEN). Empty workstreams return RED.';

-- Update all existing workstream statuses to reflect correct logic
UPDATE workstreams
SET overall_status = compute_workstream_status(id),
    last_update_time = now();

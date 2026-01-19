-- ============================================================================
-- GOVERNANCE LOCKS - Final Audit-Safe Hardening
-- Migration: 20260119_governance_locks.sql
-- Date: 2026-01-19
--
-- PURPOSE: Close two final governance loopholes:
-- 1. FIELD_CONTRIBUTOR-created units must be confirmed before counting
-- 2. Replace hard delete with archive (audit-safe soft delete)
-- ============================================================================

-- ============================================================================
-- TASK 1: UNCONFIRMED UNIT SCOPE
-- ============================================================================

-- Add confirmation tracking columns to units
ALTER TABLE units
  ADD COLUMN IF NOT EXISTS is_confirmed boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmed_by uuid REFERENCES profiles(user_id);

COMMENT ON COLUMN units.is_confirmed IS 'False if created by FIELD_CONTRIBUTOR and awaiting LEAD/OWNER confirmation';
COMMENT ON COLUMN units.confirmed_at IS 'Timestamp when unit was confirmed by authorized role';
COMMENT ON COLUMN units.confirmed_by IS 'User who confirmed the unit';

-- Index for efficient filtering of unconfirmed units
CREATE INDEX IF NOT EXISTS idx_units_confirmation
  ON units(is_confirmed, workstream_id)
  WHERE is_confirmed = false;

-- ============================================================================
-- TASK 2: ARCHIVE INSTEAD OF DELETE
-- ============================================================================

-- Add archive columns to programs
ALTER TABLE programs
  ADD COLUMN IF NOT EXISTS is_archived boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES profiles(user_id);

COMMENT ON COLUMN programs.is_archived IS 'Soft delete - archived programs are hidden but retained for audit';
COMMENT ON COLUMN programs.archived_at IS 'Timestamp when program was archived';
COMMENT ON COLUMN programs.archived_by IS 'User who archived the program';

-- Add archive columns to workstreams
ALTER TABLE workstreams
  ADD COLUMN IF NOT EXISTS is_archived boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES profiles(user_id);

COMMENT ON COLUMN workstreams.is_archived IS 'Soft delete - archived workstreams are hidden but retained for audit';

-- Add archive columns to units
ALTER TABLE units
  ADD COLUMN IF NOT EXISTS is_archived boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES profiles(user_id);

COMMENT ON COLUMN units.is_archived IS 'Soft delete - archived units are hidden but retained for audit';

-- Indexes for efficient filtering of archived items
CREATE INDEX IF NOT EXISTS idx_programs_archived ON programs(is_archived) WHERE is_archived = false;
CREATE INDEX IF NOT EXISTS idx_workstreams_archived ON workstreams(is_archived) WHERE is_archived = false;
CREATE INDEX IF NOT EXISTS idx_units_archived ON units(is_archived) WHERE is_archived = false;

-- ============================================================================
-- UPDATE COMPUTE_WORKSTREAM_STATUS TO IGNORE UNCONFIRMED AND ARCHIVED UNITS
-- ============================================================================

CREATE OR REPLACE FUNCTION compute_workstream_status(workstream_id_param uuid)
RETURNS text AS $$
DECLARE
  v_has_blocked boolean;
  v_has_red boolean;
  v_unit_count integer;
BEGIN
  -- Count only CONFIRMED and NON-ARCHIVED units
  SELECT COUNT(*) INTO v_unit_count
  FROM units
  WHERE workstream_id = workstream_id_param
    AND is_confirmed = true
    AND is_archived = false;

  -- If no confirmed, non-archived units, return null (empty workstream)
  IF v_unit_count = 0 THEN
    RETURN NULL;
  END IF;

  -- Check for any BLOCKED units (confirmed and non-archived only)
  SELECT EXISTS(
    SELECT 1 FROM units
    WHERE workstream_id = workstream_id_param
      AND is_blocked = true
      AND is_confirmed = true
      AND is_archived = false
  ) INTO v_has_blocked;

  IF v_has_blocked THEN
    RETURN 'BLOCKED';
  END IF;

  -- Check for any RED units (confirmed and non-archived only)
  SELECT EXISTS(
    SELECT 1 FROM units
    WHERE workstream_id = workstream_id_param
      AND computed_status = 'RED'
      AND is_confirmed = true
      AND is_archived = false
  ) INTO v_has_red;

  IF v_has_red THEN
    RETURN 'RED';
  END IF;

  -- All confirmed, non-archived units are GREEN
  RETURN 'GREEN';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION compute_workstream_status IS 'Computes workstream status ignoring unconfirmed and archived units';

-- ============================================================================
-- UPDATE COMPUTE_UNIT_STATUS TO HANDLE ARCHIVED/UNCONFIRMED
-- ============================================================================

-- The existing compute_unit_status function doesn't need changes for archive
-- as archived units simply won't be queried. But we ensure is_confirmed units
-- still compute status normally.

-- ============================================================================
-- FUNCTION TO CASCADE ARCHIVE TO CHILDREN
-- ============================================================================

CREATE OR REPLACE FUNCTION cascade_archive_program(
  program_id_param uuid,
  archived_by_param uuid
)
RETURNS void AS $$
BEGIN
  -- Archive all workstreams under this program
  UPDATE workstreams
  SET
    is_archived = true,
    archived_at = now(),
    archived_by = archived_by_param
  WHERE program_id = program_id_param
    AND is_archived = false;

  -- Archive all units under those workstreams
  UPDATE units
  SET
    is_archived = true,
    archived_at = now(),
    archived_by = archived_by_param
  WHERE workstream_id IN (
    SELECT id FROM workstreams WHERE program_id = program_id_param
  )
  AND is_archived = false;

  -- Log audit event
  INSERT INTO unit_status_events (
    unit_id,
    event_type,
    triggered_by,
    reason,
    metadata
  )
  SELECT
    id,
    'unit_archived',
    archived_by_param,
    'Parent program archived',
    jsonb_build_object('program_id', program_id_param)
  FROM units
  WHERE workstream_id IN (
    SELECT id FROM workstreams WHERE program_id = program_id_param
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION cascade_archive_workstream(
  workstream_id_param uuid,
  archived_by_param uuid
)
RETURNS void AS $$
BEGIN
  -- Archive all units under this workstream
  UPDATE units
  SET
    is_archived = true,
    archived_at = now(),
    archived_by = archived_by_param
  WHERE workstream_id = workstream_id_param
    AND is_archived = false;

  -- Log audit events
  INSERT INTO unit_status_events (
    unit_id,
    event_type,
    triggered_by,
    reason,
    metadata
  )
  SELECT
    id,
    'unit_archived',
    archived_by_param,
    'Parent workstream archived',
    jsonb_build_object('workstream_id', workstream_id_param)
  FROM units
  WHERE workstream_id = workstream_id_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- ADD NEW EVENT TYPES TO STATUS_EVENTS CHECK CONSTRAINT
-- ============================================================================

-- Drop and recreate the constraint to include new event types
ALTER TABLE unit_status_events
  DROP CONSTRAINT IF EXISTS unit_status_events_event_type_check;

ALTER TABLE unit_status_events
  ADD CONSTRAINT unit_status_events_event_type_check
  CHECK (event_type IN (
    'blocked', 'unblocked', 'manual_escalation',
    'proof_approved', 'proof_rejected', 'status_computed',
    'unit_confirmed', 'unit_archived', 'workstream_archived', 'program_archived'
  ));

-- ============================================================================
-- BACKFILL: Set existing units as confirmed (they were created before this feature)
-- ============================================================================

UPDATE units
SET
  is_confirmed = true,
  confirmed_at = created_at
WHERE is_confirmed IS NULL OR confirmed_at IS NULL;

-- ============================================================================
-- SUMMARY
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'GOVERNANCE LOCKS APPLIED';
  RAISE NOTICE '========================================';
  RAISE NOTICE '1. Unit confirmation tracking added';
  RAISE NOTICE '   - is_confirmed, confirmed_at, confirmed_by columns';
  RAISE NOTICE '   - Existing units backfilled as confirmed';
  RAISE NOTICE '';
  RAISE NOTICE '2. Archive (soft delete) columns added';
  RAISE NOTICE '   - programs, workstreams, units now have is_archived';
  RAISE NOTICE '   - Cascade archive functions created';
  RAISE NOTICE '';
  RAISE NOTICE '3. compute_workstream_status updated';
  RAISE NOTICE '   - Ignores unconfirmed units';
  RAISE NOTICE '   - Ignores archived units';
  RAISE NOTICE '';
  RAISE NOTICE '4. New audit event types added';
  RAISE NOTICE '   - unit_confirmed, unit_archived';
  RAISE NOTICE '   - workstream_archived, program_archived';
  RAISE NOTICE '========================================';
END $$;

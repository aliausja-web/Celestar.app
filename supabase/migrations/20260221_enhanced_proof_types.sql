-- ============================================================================
-- ENHANCED PROOF TYPES — Governance-Level Document Validation
-- Migration: 20260221_enhanced_proof_types.sql
-- Date: 2026-02-21
--
-- PURPOSE: Evolve proof system from "file attached" to structured, traceable,
-- governance-validated evidence. Backward-compatible: existing units unchanged.
--
-- CHANGES:
-- 1. unit_proofs: add structured fields (file_name, file_hash, reference_number,
--    expiry_date, notes, mime_type, file_size, is_expired)
-- 2. units: add proof configuration columns (requires_reviewer_approval,
--    requires_reference_number, requires_expiry_date)
-- 3. compute_unit_status(): fix proof_config typo bug + enforce new field rules
-- 4. check_proof_expiry(): cron-callable function to mark expired proofs
-- 5. unit_status_events: add proof_expired event type
-- ============================================================================

-- ============================================================================
-- 1. EXTEND unit_proofs WITH STRUCTURED GOVERNANCE FIELDS
-- ============================================================================

-- File identity fields (integrity + traceability)
ALTER TABLE unit_proofs ADD COLUMN IF NOT EXISTS file_name text;
ALTER TABLE unit_proofs ADD COLUMN IF NOT EXISTS file_size bigint;
ALTER TABLE unit_proofs ADD COLUMN IF NOT EXISTS mime_type text;
ALTER TABLE unit_proofs ADD COLUMN IF NOT EXISTS file_hash text;  -- SHA-256 hex, computed client-side before upload

-- Governance structured fields
ALTER TABLE unit_proofs ADD COLUMN IF NOT EXISTS reference_number text;  -- permit/cert/invoice ref
ALTER TABLE unit_proofs ADD COLUMN IF NOT EXISTS expiry_date date;       -- for time-bound proofs
ALTER TABLE unit_proofs ADD COLUMN IF NOT EXISTS notes text;             -- submitter notes (was in UI, now persisted)

-- Expiry state (set by check_proof_expiry() cron function)
ALTER TABLE unit_proofs ADD COLUMN IF NOT EXISTS is_expired boolean DEFAULT false;

COMMENT ON COLUMN unit_proofs.file_hash IS 'SHA-256 hex hash computed client-side before upload. For tamper-evidence audit trail.';
COMMENT ON COLUMN unit_proofs.reference_number IS 'Structured governance field: permit number, cert ID, invoice ref, etc.';
COMMENT ON COLUMN unit_proofs.expiry_date IS 'Expiry date of this proof (e.g. permit validity). NULL = no expiry.';
COMMENT ON COLUMN unit_proofs.is_expired IS 'Set true by check_proof_expiry() when expiry_date < today.';

CREATE INDEX IF NOT EXISTS idx_unit_proofs_expiry
  ON unit_proofs(expiry_date, is_expired)
  WHERE expiry_date IS NOT NULL;

-- ============================================================================
-- 2. ADD PROOF CONFIGURATION COLUMNS TO units
-- ============================================================================

-- Default true: preserves existing behaviour (all units already require approval)
ALTER TABLE units ADD COLUMN IF NOT EXISTS requires_reviewer_approval boolean DEFAULT true;
-- Default false: new capabilities, opt-in only
ALTER TABLE units ADD COLUMN IF NOT EXISTS requires_reference_number boolean DEFAULT false;
ALTER TABLE units ADD COLUMN IF NOT EXISTS requires_expiry_date boolean DEFAULT false;

COMMENT ON COLUMN units.requires_reviewer_approval IS 'If true (default), only reviewer-approved proofs count toward GREEN. Set false for auto-green on valid upload.';
COMMENT ON COLUMN units.requires_reference_number IS 'If true, every counted proof must have reference_number set.';
COMMENT ON COLUMN units.requires_expiry_date IS 'If true, every counted proof must have a non-expired expiry_date set.';

CREATE INDEX IF NOT EXISTS idx_units_proof_config
  ON units(requires_reviewer_approval, requires_reference_number, requires_expiry_date);

-- ============================================================================
-- 3. UPDATE compute_unit_status() — Fix proof_config bug + enforce new fields
-- ============================================================================
-- NOTE: Migration 20260113 introduced a typo ("proof_config" instead of
-- "proof_requirements"). COALESCE masked it with defaults, so existing
-- behaviour was unaffected. This migration corrects it properly.

CREATE OR REPLACE FUNCTION compute_unit_status(unit_id_param uuid)
RETURNS text AS $$
DECLARE
  v_is_blocked boolean;
  v_required_count integer;
  v_required_types jsonb;
  v_approved_proof_count integer;
  v_dependencies_satisfied boolean;
  v_has_all_types boolean;
  v_requires_reviewer_approval boolean;
  v_requires_reference_number boolean;
  v_requires_expiry_date boolean;
BEGIN
  -- Fetch unit configuration
  SELECT
    is_blocked,
    COALESCE((proof_requirements->>'required_count')::integer, 1),
    proof_requirements->'required_types',
    COALESCE(requires_reviewer_approval, true),
    COALESCE(requires_reference_number, false),
    COALESCE(requires_expiry_date, false)
  INTO
    v_is_blocked,
    v_required_count,
    v_required_types,
    v_requires_reviewer_approval,
    v_requires_reference_number,
    v_requires_expiry_date
  FROM units
  WHERE id = unit_id_param;

  -- FIRST: Explicit block overrides everything
  IF v_is_blocked = true THEN
    RETURN 'BLOCKED';
  END IF;

  -- SECOND: Hard dependencies must be satisfied
  v_dependencies_satisfied := unit_hard_dependencies_satisfied(unit_id_param);
  IF NOT v_dependencies_satisfied THEN
    RETURN 'RED';
  END IF;

  -- THIRD: Count qualifying proofs
  -- Approval requirement: default true (current behaviour), false = any valid proof counts
  -- Structured field requirements: enforced only when unit is configured to require them
  SELECT COUNT(*) INTO v_approved_proof_count
  FROM unit_proofs
  WHERE unit_id = unit_id_param
    AND is_valid = true
    AND is_superseded = false
    AND (
      NOT v_requires_reviewer_approval
      OR approval_status = 'approved'
    )
    AND (
      NOT v_requires_reference_number
      OR reference_number IS NOT NULL
    )
    AND (
      NOT v_requires_expiry_date
      OR (
        expiry_date IS NOT NULL
        AND expiry_date >= CURRENT_DATE
        AND is_expired = false
      )
    );

  IF v_approved_proof_count < v_required_count THEN
    RETURN 'RED';
  END IF;

  -- FOURTH: Check required proof types (if specified)
  IF v_required_types IS NOT NULL AND jsonb_array_length(v_required_types) > 0 THEN
    SELECT COUNT(DISTINCT type) = jsonb_array_length(v_required_types)
    INTO v_has_all_types
    FROM unit_proofs
    WHERE unit_id = unit_id_param
      AND is_valid = true
      AND is_superseded = false
      AND (NOT v_requires_reviewer_approval OR approval_status = 'approved')
      AND type::text IN (SELECT jsonb_array_elements_text(v_required_types));

    IF NOT v_has_all_types THEN
      RETURN 'RED';
    END IF;
  END IF;

  -- All conditions satisfied
  RETURN 'GREEN';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION compute_unit_status IS
  'Computes unit GREEN/RED/BLOCKED status from proof evidence. '
  'Extended (2026-02-21) to enforce requires_reviewer_approval, '
  'requires_reference_number, requires_expiry_date. '
  'Fixes proof_config→proof_requirements typo from 20260113 migration.';

-- ============================================================================
-- 4. ADD check_proof_expiry() — Called by cron to mark expired proofs
-- ============================================================================

CREATE OR REPLACE FUNCTION check_proof_expiry()
RETURNS TABLE(proofs_expired integer, units_reverted integer) AS $$
DECLARE
  v_proof RECORD;
  v_unit_id uuid;
  v_old_status text;
  v_new_status text;
  v_proofs_expired integer := 0;
  v_units_reverted integer := 0;
  v_affected_unit_ids uuid[] := '{}';
BEGIN
  -- Step 1: Mark all past-due proofs as expired
  FOR v_proof IN
    SELECT id, unit_id
    FROM unit_proofs
    WHERE expiry_date IS NOT NULL
      AND expiry_date < CURRENT_DATE
      AND is_expired = false
  LOOP
    UPDATE unit_proofs
    SET
      is_expired = true,
      is_valid = false  -- Invalidate so it no longer counts
    WHERE id = v_proof.id;

    v_proofs_expired := v_proofs_expired + 1;

    -- Collect affected unit_ids (deduplicate in step 2)
    IF NOT (v_proof.unit_id = ANY(v_affected_unit_ids)) THEN
      v_affected_unit_ids := array_append(v_affected_unit_ids, v_proof.unit_id);
    END IF;
  END LOOP;

  -- Step 2: Recompute status for each affected unit
  FOREACH v_unit_id IN ARRAY v_affected_unit_ids LOOP
    SELECT computed_status INTO v_old_status
    FROM units WHERE id = v_unit_id;

    v_new_status := compute_unit_status(v_unit_id);

    UPDATE units
    SET
      computed_status = v_new_status,
      status_computed_at = now(),
      last_status_change_time = CASE
        WHEN computed_status != v_new_status THEN now()
        ELSE last_status_change_time
      END
    WHERE id = v_unit_id;

    -- Log to unit_status_events audit trail if status changed to RED
    IF v_old_status IS DISTINCT FROM v_new_status THEN
      v_units_reverted := v_units_reverted + 1;

      INSERT INTO unit_status_events (
        unit_id,
        event_type,
        old_status,
        new_status,
        reason,
        metadata
      ) VALUES (
        v_unit_id,
        'proof_expired',
        v_old_status,
        v_new_status,
        'Proof expiry date passed — unit status recomputed',
        jsonb_build_object(
          'expired_proof_count', (
            SELECT COUNT(*) FROM unit_proofs
            WHERE unit_id = v_unit_id
              AND is_expired = true
              AND expiry_date < CURRENT_DATE
          ),
          'check_date', CURRENT_DATE
        )
      );

      -- Also update workstream status
      UPDATE workstreams
      SET
        overall_status = compute_workstream_status(
          (SELECT workstream_id FROM units WHERE id = v_unit_id)
        ),
        last_update_time = now()
      WHERE id = (SELECT workstream_id FROM units WHERE id = v_unit_id);
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_proofs_expired, v_units_reverted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION check_proof_expiry IS
  'Marks proofs past their expiry_date as expired and recomputes unit status. '
  'Call from cron alongside check_and_trigger_unit_escalations_v2(). '
  'Logs status changes to unit_status_events with event_type=proof_expired.';

-- ============================================================================
-- 5. EXTEND unit_status_events TO INCLUDE proof_expired event type
-- ============================================================================

-- Drop and recreate the constraint to add proof_expired
ALTER TABLE unit_status_events
  DROP CONSTRAINT IF EXISTS unit_status_events_event_type_check;

ALTER TABLE unit_status_events
  ADD CONSTRAINT unit_status_events_event_type_check
  CHECK (event_type IN (
    'blocked', 'unblocked', 'manual_escalation',
    'proof_approved', 'proof_rejected', 'status_computed',
    'unit_confirmed', 'unit_archived', 'workstream_archived', 'program_archived',
    'proof_expired'
  ));

-- ============================================================================
-- 6. VERIFY MIGRATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'ENHANCED PROOF TYPES — MIGRATION COMPLETE';
  RAISE NOTICE '========================================';
  RAISE NOTICE '1. unit_proofs extended:';
  RAISE NOTICE '   + file_name, file_size, mime_type, file_hash';
  RAISE NOTICE '   + reference_number, expiry_date, notes, is_expired';
  RAISE NOTICE '';
  RAISE NOTICE '2. units extended:';
  RAISE NOTICE '   + requires_reviewer_approval (default true)';
  RAISE NOTICE '   + requires_reference_number (default false)';
  RAISE NOTICE '   + requires_expiry_date (default false)';
  RAISE NOTICE '';
  RAISE NOTICE '3. compute_unit_status() updated:';
  RAISE NOTICE '   - Fixed proof_config->proof_requirements typo';
  RAISE NOTICE '   - Enforces structured field requirements';
  RAISE NOTICE '';
  RAISE NOTICE '4. check_proof_expiry() created (call from cron)';
  RAISE NOTICE '5. unit_status_events: proof_expired event type added';
  RAISE NOTICE '';
  RAISE NOTICE 'BACKWARD COMPATIBLE: all existing units/proofs unaffected';
  RAISE NOTICE '========================================';
END $$;

-- ============================================================================
-- CLOSE GOVERNANCE LOOPHOLES - Final Commercial Hardening
-- Migration: 20260113_close_governance_loopholes.sql
-- Date: 2026-01-13
--
-- PURPOSE: Close two critical governance loopholes before commercial release
-- 1. Prevent BLOCKED abuse by enforcing role-based blocking authority
-- 2. Enable safe proof correction via superseding mechanism
-- 3. Add strict validation for CUSTOM alert configurations
-- ============================================================================

-- ============================================================================
-- LOOPHOLE 1: BLOCKED AUTHORITY (Prevent "mute alerts" abuse)
-- ============================================================================

-- Add proposed_blocked tracking to unit_escalations
ALTER TABLE unit_escalations
  ADD COLUMN IF NOT EXISTS proposed_blocked boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS proposed_by_role text;

COMMENT ON COLUMN unit_escalations.proposed_blocked IS 'True if FIELD proposed blockage but lacks authority to confirm';
COMMENT ON COLUMN unit_escalations.proposed_by_role IS 'Role of user who proposed blockage';

-- Enforce non-empty blocked_reason when setting is_blocked
ALTER TABLE units
  DROP CONSTRAINT IF EXISTS units_blocked_reason_required,
  ADD CONSTRAINT units_blocked_reason_required
  CHECK (
    (is_blocked = false) OR
    (is_blocked = true AND blocked_reason IS NOT NULL AND LENGTH(TRIM(blocked_reason)) > 0)
  );

COMMENT ON CONSTRAINT units_blocked_reason_required ON units IS 'BLOCKED units must have non-empty reason';

-- Create status_events table for append-only audit trail
CREATE TABLE IF NOT EXISTS unit_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'blocked', 'unblocked', 'manual_escalation',
    'proof_approved', 'proof_rejected', 'status_computed'
  )),
  old_status text,
  new_status text,
  triggered_by uuid REFERENCES profiles(user_id),
  triggered_by_role text,
  reason text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_status_events_unit
  ON unit_status_events(unit_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_status_events_type
  ON unit_status_events(event_type, created_at DESC);

COMMENT ON TABLE unit_status_events IS 'Append-only audit trail for all unit status changes';

-- Function to log status events (called by triggers)
CREATE OR REPLACE FUNCTION log_unit_status_event()
RETURNS TRIGGER AS $$
BEGIN
  -- Log blocked state changes
  IF (OLD.is_blocked IS DISTINCT FROM NEW.is_blocked) THEN
    INSERT INTO unit_status_events (
      unit_id,
      event_type,
      old_status,
      new_status,
      triggered_by,
      triggered_by_role,
      reason,
      metadata
    ) VALUES (
      NEW.id,
      CASE WHEN NEW.is_blocked THEN 'blocked' ELSE 'unblocked' END,
      OLD.computed_status,
      NEW.computed_status,
      NEW.blocked_by,
      (SELECT role::text FROM profiles WHERE user_id = NEW.blocked_by),
      NEW.blocked_reason,
      jsonb_build_object(
        'blocked_at', NEW.blocked_at,
        'previous_blocked', OLD.is_blocked
      )
    );
  END IF;

  -- Log status changes
  IF (OLD.computed_status IS DISTINCT FROM NEW.computed_status) THEN
    INSERT INTO unit_status_events (
      unit_id,
      event_type,
      old_status,
      new_status,
      metadata
    ) VALUES (
      NEW.id,
      'status_computed',
      OLD.computed_status,
      NEW.computed_status,
      jsonb_build_object(
        'previous_escalation_level', OLD.current_escalation_level,
        'new_escalation_level', NEW.current_escalation_level
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for unit status event logging
DROP TRIGGER IF EXISTS trigger_log_unit_status ON units;
CREATE TRIGGER trigger_log_unit_status
  AFTER UPDATE ON units
  FOR EACH ROW
  EXECUTE FUNCTION log_unit_status_event();

COMMENT ON FUNCTION log_unit_status_event IS 'Logs all unit status changes to append-only audit trail';

-- ============================================================================
-- LOOPHOLE 2: PROOF SUPERSEDING (Safe correction without "unapprove")
-- ============================================================================

-- Add superseding fields to unit_proofs
ALTER TABLE unit_proofs
  ADD COLUMN IF NOT EXISTS is_superseded boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz,
  ADD COLUMN IF NOT EXISTS superseded_by uuid REFERENCES profiles(user_id),
  ADD COLUMN IF NOT EXISTS superseded_by_proof_id uuid REFERENCES unit_proofs(id);

COMMENT ON COLUMN unit_proofs.is_superseded IS 'True if this proof has been superseded by a newer approved proof';
COMMENT ON COLUMN unit_proofs.superseded_by_proof_id IS 'ID of the newer proof that superseded this one';

CREATE INDEX IF NOT EXISTS idx_proofs_active
  ON unit_proofs(unit_id, approval_status, is_superseded)
  WHERE approval_status = 'approved' AND is_superseded = false;

-- Function to supersede previous proofs when new proof is approved
CREATE OR REPLACE FUNCTION supersede_previous_proofs()
RETURNS TRIGGER AS $$
DECLARE
  v_previous_proof_count integer;
BEGIN
  -- Only run when approval status changes to 'approved'
  IF NEW.approval_status = 'approved' AND
     (OLD.approval_status IS NULL OR OLD.approval_status != 'approved') THEN

    -- Mark all previous approved proofs for this unit as superseded
    UPDATE unit_proofs
    SET
      is_superseded = true,
      superseded_at = now(),
      superseded_by = NEW.approved_by,
      superseded_by_proof_id = NEW.id
    WHERE unit_id = NEW.unit_id
      AND id != NEW.id
      AND approval_status = 'approved'
      AND is_superseded = false;

    GET DIAGNOSTICS v_previous_proof_count = ROW_COUNT;

    -- Log the superseding event if any proofs were superseded
    IF v_previous_proof_count > 0 THEN
      INSERT INTO unit_status_events (
        unit_id,
        event_type,
        triggered_by,
        triggered_by_role,
        reason,
        metadata
      ) VALUES (
        NEW.unit_id,
        'proof_approved',
        NEW.approved_by,
        (SELECT role::text FROM profiles WHERE user_id = NEW.approved_by),
        'New proof approved, superseding ' || v_previous_proof_count || ' previous proof(s)',
        jsonb_build_object(
          'new_proof_id', NEW.id,
          'proofs_superseded', v_previous_proof_count,
          'proof_type', NEW.type
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for proof superseding
DROP TRIGGER IF EXISTS trigger_supersede_proofs ON unit_proofs;
CREATE TRIGGER trigger_supersede_proofs
  AFTER UPDATE ON unit_proofs
  FOR EACH ROW
  WHEN (NEW.approval_status = 'approved')
  EXECUTE FUNCTION supersede_previous_proofs();

COMMENT ON FUNCTION supersede_previous_proofs IS 'Automatically supersedes previous approved proofs when new proof is approved';

-- Update compute_unit_status to ignore superseded proofs
CREATE OR REPLACE FUNCTION compute_unit_status(unit_id_param uuid)
RETURNS text AS $$
DECLARE
  v_is_blocked boolean;
  v_required_count integer;
  v_required_types jsonb;
  v_approved_proof_count integer;
  v_dependencies_satisfied boolean;
  v_has_all_types boolean;
BEGIN
  -- FIRST: Check if explicitly blocked
  SELECT is_blocked INTO v_is_blocked
  FROM units
  WHERE id = unit_id_param;

  IF v_is_blocked = true THEN
    RETURN 'BLOCKED';
  END IF;

  -- SECOND: Check hard dependencies
  v_dependencies_satisfied := unit_hard_dependencies_satisfied(unit_id_param);
  IF NOT v_dependencies_satisfied THEN
    RETURN 'RED';
  END IF;

  -- THIRD: Check proof requirements
  SELECT
    COALESCE(proof_config->>'required_count', '1')::integer,
    proof_config->'required_types'
  INTO v_required_count, v_required_types
  FROM units
  WHERE id = unit_id_param;

  -- Count APPROVED NON-SUPERSEDED proofs only
  SELECT COUNT(*) INTO v_approved_proof_count
  FROM unit_proofs
  WHERE unit_id = unit_id_param
    AND is_valid = true
    AND approval_status = 'approved'
    AND is_superseded = false;  -- CRITICAL: Ignore superseded proofs

  IF v_approved_proof_count < v_required_count THEN
    RETURN 'RED';
  END IF;

  -- Check required types if specified
  IF v_required_types IS NOT NULL AND jsonb_array_length(v_required_types) > 0 THEN
    SELECT COUNT(DISTINCT type) = jsonb_array_length(v_required_types)
    INTO v_has_all_types
    FROM unit_proofs
    WHERE unit_id = unit_id_param
      AND is_valid = true
      AND approval_status = 'approved'
      AND is_superseded = false  -- CRITICAL: Ignore superseded proofs
      AND type::text IN (SELECT jsonb_array_elements_text(v_required_types));

    IF NOT v_has_all_types THEN
      RETURN 'RED';
    END IF;
  END IF;

  -- All conditions met
  RETURN 'GREEN';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION compute_unit_status IS 'Updated to ignore superseded proofs in status computation';

-- ============================================================================
-- CUSTOM ALERT CONFIG VALIDATION
-- ============================================================================

-- Function to validate escalation_config jsonb
CREATE OR REPLACE FUNCTION validate_escalation_config()
RETURNS TRIGGER AS $$
DECLARE
  v_thresholds jsonb;
  v_threshold record;
  v_prev_percentage numeric := 0;
  v_count integer := 0;
BEGIN
  -- Only validate if escalation_config is being changed
  IF NEW.escalation_config IS DISTINCT FROM OLD.escalation_config THEN

    -- If alert_profile is CUSTOM, escalation_config must be valid
    IF NEW.alert_profile = 'CUSTOM' THEN

      -- Must have thresholds array
      IF NEW.escalation_config->'thresholds' IS NULL THEN
        RAISE EXCEPTION 'CUSTOM alert profile requires escalation_config.thresholds array';
      END IF;

      v_thresholds := NEW.escalation_config->'thresholds';

      -- Must be an array
      IF jsonb_typeof(v_thresholds) != 'array' THEN
        RAISE EXCEPTION 'escalation_config.thresholds must be an array';
      END IF;

      v_count := jsonb_array_length(v_thresholds);

      -- Length must be 1-5
      IF v_count < 1 OR v_count > 5 THEN
        RAISE EXCEPTION 'escalation_config.thresholds must have 1-5 elements, got %', v_count;
      END IF;

      -- Validate each threshold
      FOR v_threshold IN
        SELECT
          jsonb_array_elements(v_thresholds)->>'level' as level,
          (jsonb_array_elements(v_thresholds)->>'percentage_elapsed')::numeric as percentage_elapsed
      LOOP
        -- Level must be 1, 2, or 3
        IF v_threshold.level::integer NOT IN (1, 2, 3) THEN
          RAISE EXCEPTION 'Threshold level must be 1, 2, or 3, got %', v_threshold.level;
        END IF;

        -- Percentage must be between 0 and 100
        IF v_threshold.percentage_elapsed < 0 OR v_threshold.percentage_elapsed > 100 THEN
          RAISE EXCEPTION 'Threshold percentage must be between 0 and 100, got %', v_threshold.percentage_elapsed;
        END IF;

        -- Percentages must be strictly increasing
        IF v_threshold.percentage_elapsed <= v_prev_percentage THEN
          RAISE EXCEPTION 'Thresholds must be strictly increasing, got % after %',
            v_threshold.percentage_elapsed, v_prev_percentage;
        END IF;

        v_prev_percentage := v_threshold.percentage_elapsed;
      END LOOP;

    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for escalation config validation
DROP TRIGGER IF EXISTS trigger_validate_escalation_config ON units;
CREATE TRIGGER trigger_validate_escalation_config
  BEFORE INSERT OR UPDATE ON units
  FOR EACH ROW
  WHEN (NEW.alert_profile = 'CUSTOM' AND NEW.escalation_config IS NOT NULL)
  EXECUTE FUNCTION validate_escalation_config();

COMMENT ON FUNCTION validate_escalation_config IS 'Validates CUSTOM alert thresholds: 1-5 elements, 0-100 range, strictly increasing';

-- ============================================================================
-- SUMMARY
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'GOVERNANCE LOOPHOLES CLOSED';
  RAISE NOTICE '========================================';
  RAISE NOTICE '1. ✅ BLOCKED authority: role-based enforcement added';
  RAISE NOTICE '2. ✅ Proof superseding: safe correction mechanism added';
  RAISE NOTICE '3. ✅ Custom alert validation: strict config validation added';
  RAISE NOTICE '4. ✅ Audit trail: unit_status_events table created';
  RAISE NOTICE '';
  RAISE NOTICE 'Next Steps:';
  RAISE NOTICE '- Update /api/units/[id]/escalate to check role authority';
  RAISE NOTICE '- Update unit details UI to show superseded proofs';
  RAISE NOTICE '- Run tenant safety audit';
  RAISE NOTICE '- Create test harness';
  RAISE NOTICE '========================================';
END $$;

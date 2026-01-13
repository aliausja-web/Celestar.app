-- ============================================================================
-- FINAL HARDENING PASS - Production Safety
-- Migration: 20260112_hardening_pass.sql
-- Date: 2026-01-12
--
-- PURPOSE: Surgical hardening to raise platform from 8.5/10 to 9.5/10
-- SCOPE: Minimal changes only - no redesign, no architecture changes
-- ============================================================================

-- ============================================================================
-- 1. ADD BLOCKED STATE (Explicit Blocker Tracking)
-- ============================================================================

-- Extend unit status to include BLOCKED
ALTER TABLE units
  DROP CONSTRAINT IF EXISTS units_computed_status_check,
  ADD CONSTRAINT units_computed_status_check
  CHECK (computed_status IN ('RED', 'GREEN', 'BLOCKED'));

-- Add blocked metadata
ALTER TABLE units
  ADD COLUMN IF NOT EXISTS is_blocked boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS blocked_reason text,
  ADD COLUMN IF NOT EXISTS blocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS blocked_by uuid REFERENCES profiles(user_id);

-- Extend workstream status to handle BLOCKED
ALTER TABLE workstreams
  DROP CONSTRAINT IF EXISTS workstreams_overall_status_check,
  ADD CONSTRAINT workstreams_overall_status_check
  CHECK (overall_status IN ('RED', 'GREEN', 'BLOCKED') OR overall_status IS NULL);

COMMENT ON COLUMN units.is_blocked IS 'Explicit blocker flag - set via manual escalation or management action';
COMMENT ON COLUMN units.blocked_reason IS 'Why unit is blocked (external dependency, site issue, etc)';

-- ============================================================================
-- 2. UNIT-LEVEL ALERT CONFIGURATION (Optional Override)
-- ============================================================================

-- Add high_criticality flag for approval escalation
ALTER TABLE units
  ADD COLUMN IF NOT EXISTS high_criticality boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS alert_profile text DEFAULT 'STANDARD' CHECK (alert_profile IN ('STANDARD', 'CRITICAL', 'CUSTOM'));

COMMENT ON COLUMN units.high_criticality IS 'If true, requires PROGRAM_OWNER approval regardless of uploader';
COMMENT ON COLUMN units.alert_profile IS 'Alert profile: STANDARD (50/75/90), CRITICAL (30/60/90), or CUSTOM (uses escalation_config)';

-- Update escalation_config to support custom overrides
-- Default remains: 50%, 75%, 90% (unchanged)
-- Units can now override with custom thresholds in escalation_config jsonb

-- ============================================================================
-- 3. APPROVAL GUARDRAILS (High Criticality Units)
-- ============================================================================

-- Function to enforce high-criticality approval rules
CREATE OR REPLACE FUNCTION check_high_criticality_approval()
RETURNS TRIGGER AS $$
DECLARE
  v_unit_criticality boolean;
  v_approver_role text;
BEGIN
  -- Only check on approval status change
  IF NEW.approval_status != OLD.approval_status AND NEW.approval_status = 'approved' THEN

    -- Get unit criticality
    SELECT high_criticality INTO v_unit_criticality
    FROM units
    WHERE id = NEW.unit_id;

    -- Get approver role
    SELECT role::text INTO v_approver_role
    FROM profiles
    WHERE user_id = NEW.approved_by;

    -- If high criticality, only PROGRAM_OWNER or PLATFORM_ADMIN can approve
    IF v_unit_criticality = true THEN
      IF v_approver_role NOT IN ('PROGRAM_OWNER', 'PLATFORM_ADMIN') THEN
        RAISE EXCEPTION 'High criticality unit requires PROGRAM_OWNER or PLATFORM_ADMIN approval';
      END IF;
    END IF;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for high criticality check
DROP TRIGGER IF EXISTS trigger_high_criticality_approval ON unit_proofs;
CREATE TRIGGER trigger_high_criticality_approval
  BEFORE UPDATE ON unit_proofs
  FOR EACH ROW
  WHEN (NEW.approval_status = 'approved')
  EXECUTE FUNCTION check_high_criticality_approval();

COMMENT ON FUNCTION check_high_criticality_approval IS 'Enforces PROGRAM_OWNER approval for high-criticality units';

-- ============================================================================
-- 4. UPDATE STATUS COMPUTATION TO HANDLE BLOCKED
-- ============================================================================

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

  -- Count APPROVED proofs only
  SELECT COUNT(*) INTO v_approved_proof_count
  FROM unit_proofs
  WHERE unit_id = unit_id_param
    AND is_valid = true
    AND approval_status = 'approved';

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
      AND type::text IN (SELECT jsonb_array_elements_text(v_required_types));

    IF NOT v_has_all_types THEN
      RETURN 'RED';
    END IF;
  END IF;

  -- All conditions met
  RETURN 'GREEN';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION compute_unit_status IS 'Updated to handle BLOCKED state as first priority';

-- ============================================================================
-- 5. UPDATE WORKSTREAM STATUS TO HANDLE BLOCKED
-- ============================================================================

CREATE OR REPLACE FUNCTION compute_workstream_status(workstream_id_param uuid)
RETURNS text AS $$
DECLARE
  v_total_units integer;
  v_green_units integer;
  v_blocked_units integer;
BEGIN
  -- Count total units
  SELECT COUNT(*) INTO v_total_units
  FROM units
  WHERE workstream_id = workstream_id_param;

  -- Empty workstream = NULL (pending)
  IF v_total_units = 0 THEN
    RETURN NULL;
  END IF;

  -- Count blocked units
  SELECT COUNT(*) INTO v_blocked_units
  FROM units
  WHERE workstream_id = workstream_id_param
    AND computed_status = 'BLOCKED';

  -- If ANY unit is blocked, workstream is BLOCKED
  IF v_blocked_units > 0 THEN
    RETURN 'BLOCKED';
  END IF;

  -- Count GREEN units
  SELECT COUNT(*) INTO v_green_units
  FROM units
  WHERE workstream_id = workstream_id_param
    AND computed_status = 'GREEN';

  -- All units GREEN = workstream GREEN
  IF v_green_units = v_total_units THEN
    RETURN 'GREEN';
  END IF;

  -- Otherwise RED
  RETURN 'RED';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION compute_workstream_status IS 'Updated to prioritize BLOCKED status if any unit is blocked';

-- ============================================================================
-- 6. ALERT SUPPRESSION FOR BLOCKED UNITS
-- ============================================================================

-- Update escalation engine to skip BLOCKED units
CREATE OR REPLACE FUNCTION check_and_trigger_unit_escalations_v3()
RETURNS jsonb AS $$
DECLARE
  v_unit record;
  v_policy record;
  v_total_time_minutes numeric;
  v_time_elapsed_minutes numeric;
  v_percentage_elapsed numeric;
  v_alert_thresholds jsonb;
  v_escalations_created integer := 0;
BEGIN
  -- Loop through RED units that are past deadline and NOT blocked
  FOR v_unit IN
    SELECT
      u.id,
      u.title,
      u.workstream_id,
      u.required_green_by,
      u.created_at,
      u.current_escalation_level,
      u.is_blocked,  -- NEW: Check blocked status
      u.alert_profile,
      u.escalation_config,
      w.program_id
    FROM units u
    JOIN workstreams w ON u.workstream_id = w.id
    WHERE u.computed_status = 'RED'
      AND u.required_green_by IS NOT NULL
      AND u.required_green_by < now()
      AND u.current_escalation_level < 3
      AND u.is_blocked = false  -- CRITICAL: Skip blocked units
    ORDER BY u.required_green_by ASC
  LOOP
    -- Calculate percentage elapsed
    v_total_time_minutes := EXTRACT(EPOCH FROM (v_unit.required_green_by - v_unit.created_at)) / 60;
    v_time_elapsed_minutes := EXTRACT(EPOCH FROM (now() - v_unit.created_at)) / 60;
    v_percentage_elapsed := (v_time_elapsed_minutes / v_total_time_minutes) * 100;

    -- Determine thresholds based on alert profile
    IF v_unit.alert_profile = 'CRITICAL' THEN
      v_alert_thresholds := jsonb_build_array(
        jsonb_build_object('level', 1, 'percentage_elapsed', 30),
        jsonb_build_object('level', 2, 'percentage_elapsed', 60),
        jsonb_build_object('level', 3, 'percentage_elapsed', 90)
      );
    ELSIF v_unit.alert_profile = 'CUSTOM' AND v_unit.escalation_config->'thresholds' IS NOT NULL THEN
      v_alert_thresholds := v_unit.escalation_config->'thresholds';
    ELSE
      -- STANDARD (default): 50%, 75%, 90%
      v_alert_thresholds := jsonb_build_array(
        jsonb_build_object('level', 1, 'percentage_elapsed', 50),
        jsonb_build_object('level', 2, 'percentage_elapsed', 75),
        jsonb_build_object('level', 3, 'percentage_elapsed', 90)
      );
    END IF;

    -- Check each threshold level
    FOR v_policy IN
      SELECT
        (threshold->>'level')::integer as level,
        (threshold->>'percentage_elapsed')::numeric as percentage_threshold
      FROM jsonb_array_elements(v_alert_thresholds) AS threshold
      WHERE (threshold->>'level')::integer = v_unit.current_escalation_level + 1
    LOOP
      IF v_percentage_elapsed >= v_policy.percentage_threshold THEN
        -- Create escalation
        INSERT INTO unit_escalations (
          unit_id,
          workstream_id,
          program_id,
          escalation_level,
          triggered_at,
          threshold_minutes_past_deadline,
          escalation_type,
          status
        ) VALUES (
          v_unit.id,
          v_unit.workstream_id,
          v_unit.program_id,
          v_policy.level,
          now(),
          EXTRACT(EPOCH FROM (now() - v_unit.required_green_by)) / 60,
          'automatic',
          'active'
        );

        -- Update unit escalation level
        UPDATE units
        SET current_escalation_level = v_policy.level
        WHERE id = v_unit.id;

        v_escalations_created := v_escalations_created + 1;
        EXIT;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'escalations_created', v_escalations_created
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION check_and_trigger_unit_escalations_v3 IS 'Updated to skip BLOCKED units and support alert profiles';

-- ============================================================================
-- 7. EMPTY WORKSTREAM GUARDRAIL
-- ============================================================================

-- Add warning metadata for empty workstreams
ALTER TABLE workstreams
  ADD COLUMN IF NOT EXISTS empty_warning_shown boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS empty_since timestamptz;

-- Function to check and flag empty workstreams
CREATE OR REPLACE FUNCTION check_empty_workstreams()
RETURNS void AS $$
BEGIN
  -- Mark workstreams as empty if they have no units
  UPDATE workstreams
  SET
    empty_since = COALESCE(empty_since, now()),
    empty_warning_shown = false
  WHERE id IN (
    SELECT w.id
    FROM workstreams w
    LEFT JOIN units u ON u.workstream_id = w.id
    GROUP BY w.id
    HAVING COUNT(u.id) = 0
  )
  AND empty_since IS NULL;

  -- Clear empty flag when units are added
  UPDATE workstreams
  SET
    empty_since = NULL,
    empty_warning_shown = false
  WHERE id IN (
    SELECT w.id
    FROM workstreams w
    LEFT JOIN units u ON u.workstream_id = w.id
    GROUP BY w.id
    HAVING COUNT(u.id) > 0
  )
  AND empty_since IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update empty status when units are added/removed
CREATE OR REPLACE FUNCTION trigger_check_empty_workstream()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM check_empty_workstreams();
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_unit_count_change ON units;
CREATE TRIGGER trigger_unit_count_change
  AFTER INSERT OR DELETE ON units
  FOR EACH ROW
  EXECUTE FUNCTION trigger_check_empty_workstream();

COMMENT ON COLUMN workstreams.empty_since IS 'Timestamp when workstream became empty - used for warning threshold';

-- ============================================================================
-- 8. AUDIT TRAIL ENFORCEMENT (Immutability Checks)
-- ============================================================================

-- Ensure proof timestamps are immutable
CREATE OR REPLACE FUNCTION enforce_proof_immutability()
RETURNS TRIGGER AS $$
BEGIN
  -- Prevent changing uploaded_at timestamp
  IF OLD.uploaded_at IS DISTINCT FROM NEW.uploaded_at THEN
    RAISE EXCEPTION 'Proof upload timestamp is immutable';
  END IF;

  -- Prevent changing uploaded_by once set
  IF OLD.uploaded_by IS NOT NULL AND OLD.uploaded_by IS DISTINCT FROM NEW.uploaded_by THEN
    RAISE EXCEPTION 'Proof uploader cannot be changed';
  END IF;

  -- Prevent un-approving (approved → pending)
  IF OLD.approval_status = 'approved' AND NEW.approval_status != 'approved' THEN
    RAISE EXCEPTION 'Approved proofs cannot be un-approved (append-only)';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_proof_immutability ON unit_proofs;
CREATE TRIGGER trigger_proof_immutability
  BEFORE UPDATE ON unit_proofs
  FOR EACH ROW
  EXECUTE FUNCTION enforce_proof_immutability();

COMMENT ON FUNCTION enforce_proof_immutability IS 'Enforces append-only audit trail for proofs';

-- ============================================================================
-- 9. CREATE INDEXES FOR ATTENTION QUEUE PERFORMANCE
-- ============================================================================

-- Index for pending proofs
CREATE INDEX IF NOT EXISTS idx_proofs_pending_approval
  ON unit_proofs(approval_status, uploaded_at)
  WHERE approval_status = 'pending';

-- Index for RED units near deadline
CREATE INDEX IF NOT EXISTS idx_units_red_near_deadline
  ON units(computed_status, required_green_by)
  WHERE computed_status IN ('RED', 'BLOCKED') AND required_green_by IS NOT NULL;

-- Index for active escalations
CREATE INDEX IF NOT EXISTS idx_escalations_active
  ON unit_escalations(status, triggered_at, escalation_type)
  WHERE status = 'active';

-- ============================================================================
-- SUMMARY
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'HARDENING PASS COMPLETE';
  RAISE NOTICE '========================================';
  RAISE NOTICE '1. ✅ BLOCKED state added to units and workstreams';
  RAISE NOTICE '2. ✅ Alert profiles (STANDARD/CRITICAL/CUSTOM) added';
  RAISE NOTICE '3. ✅ High-criticality units require PROGRAM_OWNER approval';
  RAISE NOTICE '4. ✅ Alert suppression for BLOCKED units';
  RAISE NOTICE '5. ✅ Empty workstream tracking added';
  RAISE NOTICE '6. ✅ Proof immutability enforced';
  RAISE NOTICE '7. ✅ Indexes created for Attention Queue';
  RAISE NOTICE '';
  RAISE NOTICE 'Next Steps:';
  RAISE NOTICE '- Build Attention Queue API endpoint';
  RAISE NOTICE '- Build Attention Queue UI component';
  RAISE NOTICE '- Update unit details UI to show BLOCKED state';
  RAISE NOTICE '- Add empty workstream warning UI';
  RAISE NOTICE '========================================';
END $$;

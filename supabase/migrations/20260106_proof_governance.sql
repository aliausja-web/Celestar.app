-- Proof Governance Implementation
-- Migration: 20260106_proof_governance.sql
-- Requirement: Separation of duties (uploader ≠ approver), proof lifecycle states

-- ============================================================================
-- 1. ADD PROOF LIFECYCLE COLUMNS TO UNIT_PROOFS
-- ============================================================================

DO $$ BEGIN
  ALTER TABLE unit_proofs ADD COLUMN approval_status text DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected'));
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE unit_proofs ADD COLUMN approved_by uuid REFERENCES auth.users(id);
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE unit_proofs ADD COLUMN approved_by_email text;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE unit_proofs ADD COLUMN approved_at timestamptz;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE unit_proofs ADD COLUMN rejection_reason text;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

-- Create index for fast status queries
CREATE INDEX IF NOT EXISTS idx_unit_proofs_approval_status ON unit_proofs(approval_status);

-- ============================================================================
-- 2. ENFORCE SEPARATION OF DUTIES: UPLOADER ≠ APPROVER
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_proof_separation_of_duties()
RETURNS TRIGGER AS $$
BEGIN
  -- When approving a proof, check that approver is NOT the uploader
  IF NEW.approval_status = 'approved' AND NEW.approved_by IS NOT NULL THEN
    IF NEW.approved_by = NEW.uploaded_by THEN
      RAISE EXCEPTION 'Separation of duties violation: approver cannot be the same as uploader';
    END IF;
  END IF;

  -- Set approval timestamp
  IF NEW.approval_status != OLD.approval_status AND NEW.approval_status IN ('approved', 'rejected') THEN
    NEW.approved_at = now();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_enforce_proof_separation_of_duties ON unit_proofs;
CREATE TRIGGER trigger_enforce_proof_separation_of_duties
  BEFORE UPDATE ON unit_proofs
  FOR EACH ROW
  EXECUTE FUNCTION enforce_proof_separation_of_duties();

-- ============================================================================
-- 3. UPDATE STATUS COMPUTATION: GREEN ONLY WITH APPROVED PROOFS
-- ============================================================================

CREATE OR REPLACE FUNCTION compute_unit_status(unit_id_param uuid)
RETURNS text AS $$
DECLARE
  approved_proof_count integer;
  required_count integer;
  required_types jsonb;
  has_all_types boolean;
  dependencies_satisfied boolean;
BEGIN
  -- Get proof requirements
  SELECT
    (proof_requirements->>'required_count')::integer,
    proof_requirements->'required_types'
  INTO required_count, required_types
  FROM units
  WHERE id = unit_id_param;

  -- Check if hard dependencies are satisfied
  dependencies_satisfied := unit_hard_dependencies_satisfied(unit_id_param);

  -- If hard dependencies are not satisfied, status CANNOT be GREEN
  IF NOT dependencies_satisfied THEN
    RETURN 'RED';
  END IF;

  -- Count APPROVED valid proofs (not just uploaded)
  SELECT COUNT(*) INTO approved_proof_count
  FROM unit_proofs
  WHERE unit_id = unit_id_param
  AND is_valid = true
  AND approval_status = 'approved';  -- NEW: Must be approved

  -- Check if required count is met
  IF approved_proof_count < required_count THEN
    RETURN 'RED';
  END IF;

  -- Check if all required types are present with APPROVED proofs
  IF required_types IS NOT NULL AND jsonb_array_length(required_types) > 0 THEN
    SELECT COUNT(DISTINCT type) = jsonb_array_length(required_types) INTO has_all_types
    FROM unit_proofs
    WHERE unit_id = unit_id_param
    AND is_valid = true
    AND approval_status = 'approved'  -- NEW: Must be approved
    AND type::text IN (
      SELECT jsonb_array_elements_text(required_types)
    );

    IF NOT has_all_types THEN
      RETURN 'RED';
    END IF;
  END IF;

  -- All conditions met
  RETURN 'GREEN';
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4. LOG PROOF APPROVAL/REJECTION IN AUDIT TRAIL
-- ============================================================================

CREATE OR REPLACE FUNCTION log_proof_approval_event()
RETURNS TRIGGER AS $$
BEGIN
  -- Log approval/rejection to status_events
  IF NEW.approval_status != OLD.approval_status AND NEW.approval_status IN ('approved', 'rejected') THEN
    INSERT INTO status_events (
      unit_id,
      event_type,
      old_status,
      new_status,
      triggered_by,
      triggered_by_email,
      metadata
    )
    VALUES (
      NEW.unit_id,
      CASE
        WHEN NEW.approval_status = 'approved' THEN 'proof_approved'
        WHEN NEW.approval_status = 'rejected' THEN 'proof_rejected'
      END,
      (SELECT computed_status FROM units WHERE id = NEW.unit_id),
      compute_unit_status(NEW.unit_id),
      NEW.approved_by,
      NEW.approved_by_email,
      jsonb_build_object(
        'proof_id', NEW.id,
        'proof_type', NEW.type,
        'proof_url', NEW.url,
        'uploaded_by', NEW.uploaded_by,
        'uploaded_by_email', NEW.uploaded_by_email,
        'rejection_reason', NEW.rejection_reason
      )
    );

    -- Recompute unit status after approval/rejection
    UPDATE units
    SET
      computed_status = compute_unit_status(id),
      status_computed_at = now(),
      last_status_change_time = CASE
        WHEN computed_status != compute_unit_status(id) THEN now()
        ELSE last_status_change_time
      END
    WHERE id = NEW.unit_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_log_proof_approval_event ON unit_proofs;
CREATE TRIGGER trigger_log_proof_approval_event
  AFTER UPDATE ON unit_proofs
  FOR EACH ROW
  EXECUTE FUNCTION log_proof_approval_event();

-- ============================================================================
-- 5. UPDATE RLS POLICIES: Only authorized users can approve proofs
-- ============================================================================

-- The existing unit_proofs_update_policy already uses can_approve_proof()
-- which restricts to PROGRAM_OWNER and WORKSTREAM_LEAD
-- This enforces that only leads can approve proofs

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

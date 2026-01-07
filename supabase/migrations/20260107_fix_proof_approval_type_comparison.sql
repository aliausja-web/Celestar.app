-- Fix proof approval trigger type comparison error
-- Issue 1: approved_by (UUID) being compared to uploaded_by (TEXT)
-- Issue 2: log_proof_approval_event using wrong column names for status_events table
-- Solution: Cast UUID to text for comparison and fix status_events insert

CREATE OR REPLACE FUNCTION enforce_proof_separation_of_duties()
RETURNS TRIGGER AS $$
BEGIN
  -- When approving a proof, check that approver is NOT the uploader
  IF NEW.approval_status = 'approved' AND NEW.approved_by IS NOT NULL THEN
    -- Cast approved_by (UUID) to text to compare with uploaded_by (TEXT)
    IF NEW.approved_by::text = NEW.uploaded_by THEN
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

-- Fix the log_proof_approval_event trigger to use correct column names
CREATE OR REPLACE FUNCTION log_proof_approval_event()
RETURNS TRIGGER AS $$
BEGIN
  -- Log approval/rejection to status_events
  IF NEW.approval_status != OLD.approval_status AND NEW.approval_status IN ('approved', 'rejected') THEN
    INSERT INTO status_events (
      unit_id,
      old_status,
      new_status,
      changed_by,
      changed_by_email,
      reason,
      proof_id,
      notes
    )
    VALUES (
      NEW.unit_id,
      (SELECT computed_status FROM units WHERE id = NEW.unit_id),
      compute_unit_status(NEW.unit_id),
      NEW.approved_by::text,
      NEW.approved_by_email,
      CASE
        WHEN NEW.approval_status = 'approved' THEN 'Proof approved'
        WHEN NEW.approval_status = 'rejected' THEN 'Proof rejected: ' || COALESCE(NEW.rejection_reason, 'No reason provided')
      END,
      NEW.id,
      jsonb_build_object(
        'proof_type', NEW.type,
        'proof_url', NEW.url,
        'uploaded_by', NEW.uploaded_by,
        'uploaded_by_email', NEW.uploaded_by_email
      )::text
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

-- Triggers are already created, this just updates the functions

-- Fix proof approval trigger type comparison error
-- Issue: approved_by (UUID) being compared to uploaded_by (TEXT)
-- Solution: Cast UUID to text for comparison

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

-- Trigger is already created, this just updates the function

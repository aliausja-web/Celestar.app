-- Fix: reliably replace the in_app_notifications type check constraint.
-- The previous migration used DROP CONSTRAINT IF EXISTS with a guessed name.
-- Postgres auto-generates constraint names for inline CHECK clauses, so the
-- name may differ from what we expected — causing the DROP to silently no-op
-- and the old constraint to keep blocking 'proof_submitted' inserts.
--
-- This migration finds and drops whatever CHECK constraint exists on the
-- `type` column, then adds the canonical constraint with the full value list.

DO $$
DECLARE
  v_constraint_name text;
BEGIN
  -- Find any CHECK constraint on in_app_notifications that references the type column
  SELECT conname
    INTO v_constraint_name
    FROM pg_constraint
   WHERE conrelid = 'in_app_notifications'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%type%IN%';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE in_app_notifications DROP CONSTRAINT ' || quote_ident(v_constraint_name);
  END IF;
END $$;

-- Also drop by the guessed name in case it exists separately
ALTER TABLE in_app_notifications
  DROP CONSTRAINT IF EXISTS in_app_notifications_type_check;

-- Add the authoritative constraint with proof_submitted included
ALTER TABLE in_app_notifications
  ADD CONSTRAINT in_app_notifications_type_check
  CHECK (type IN (
    'escalation',
    'proof_approved',
    'proof_rejected',
    'proof_submitted',
    'status_change',
    'deadline_approaching',
    'manual_escalation'
  ));

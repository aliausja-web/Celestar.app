-- Migration: add proof_submitted notification type
-- Allows in-app notifications to be sent to WORKSTREAM_LEAD and PROGRAM_OWNER
-- when a FIELD_CONTRIBUTOR uploads a proof.

ALTER TABLE in_app_notifications
  DROP CONSTRAINT IF EXISTS in_app_notifications_type_check;

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

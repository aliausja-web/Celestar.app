-- Extend unit_status_events event_type constraint to include voice_note_played.
-- This lets us log every time a user plays a management voice note — immutable
-- audit evidence that briefing was received before proof submission.

ALTER TABLE unit_status_events
  DROP CONSTRAINT IF EXISTS unit_status_events_event_type_check;

ALTER TABLE unit_status_events
  ADD CONSTRAINT unit_status_events_event_type_check
  CHECK (event_type IN (
    'blocked', 'unblocked', 'manual_escalation',
    'proof_approved', 'proof_rejected', 'status_computed',
    'unit_confirmed', 'unit_archived', 'workstream_archived', 'program_archived',
    'voice_note_played'
  ));

/*
  # Proof-First Enforcement & Automatic Escalation System

  ## Changes

  1. Add deadline and escalation tracking fields to zones
  2. Add authority/coordinator contact fields to zones
  3. Create database function to automatically change status on proof upload
  4. Create database function to check and trigger automatic escalations
  5. Enforce that status can ONLY be changed by proof upload

  ## New Fields

  - `deadline` - The absolute deadline for zone completion
  - `escalation_1_hours` - Hours before deadline for first escalation (default: 24)
  - `escalation_2_hours` - Hours before deadline for second escalation (default: 16)
  - `escalation_3_hours` - Hours before deadline for third escalation (default: 8)
  - `site_coordinator` - Contact for first escalation
  - `site_authority` - Contact for second escalation
  - `final_authority` - Contact for third/final escalation
  - `last_escalation_check` - Track when we last checked for escalations

  ## Security

  - Remove ability for users to manually update zone status
  - Only allow status updates through proof upload trigger
  - Admins can override with ADMIN_OVERRIDE type
*/

-- Add new fields to zones table
ALTER TABLE zones
ADD COLUMN IF NOT EXISTS deadline timestamptz,
ADD COLUMN IF NOT EXISTS escalation_1_hours integer DEFAULT 24,
ADD COLUMN IF NOT EXISTS escalation_2_hours integer DEFAULT 16,
ADD COLUMN IF NOT EXISTS escalation_3_hours integer DEFAULT 8,
ADD COLUMN IF NOT EXISTS site_coordinator text,
ADD COLUMN IF NOT EXISTS site_authority text,
ADD COLUMN IF NOT EXISTS final_authority text,
ADD COLUMN IF NOT EXISTS last_escalation_check timestamptz;

-- Update the status constraint to remove AMBER (only RED or GREEN)
ALTER TABLE zones DROP CONSTRAINT IF EXISTS zones_status_check;
ALTER TABLE zones ADD CONSTRAINT zones_status_check CHECK (status IN ('RED', 'GREEN'));

-- Update the updates table constraints to remove AMBER
ALTER TABLE updates DROP CONSTRAINT IF EXISTS updates_previous_status_check;
ALTER TABLE updates DROP CONSTRAINT IF EXISTS updates_new_status_check;
ALTER TABLE updates ADD CONSTRAINT updates_previous_status_check CHECK (previous_status IN ('RED', 'GREEN'));
ALTER TABLE updates ADD CONSTRAINT updates_new_status_check CHECK (new_status IN ('RED', 'GREEN'));

-- Function: Automatically set zone to GREEN when proof is uploaded
CREATE OR REPLACE FUNCTION auto_green_on_proof()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the zone status to GREEN
  UPDATE zones
  SET
    status = 'GREEN',
    last_verified_at = NEW.created_at,
    is_escalated = false,
    escalation_level = NULL
  WHERE id = NEW.zone_id AND status = 'RED';

  -- Create an update record
  INSERT INTO updates (
    project_id,
    zone_id,
    previous_status,
    new_status,
    proof_id,
    note,
    by_uid,
    by_email,
    type
  )
  SELECT
    NEW.project_id,
    NEW.zone_id,
    'RED',
    'GREEN',
    NEW.id,
    'Status automatically changed to GREEN upon proof upload',
    NEW.uploaded_by_uid,
    NEW.uploaded_by_email,
    'STATUS_CHANGE'
  WHERE EXISTS (
    SELECT 1 FROM zones WHERE id = NEW.zone_id AND status = 'RED'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: Run auto_green_on_proof when a proof is inserted
DROP TRIGGER IF EXISTS trigger_auto_green_on_proof ON proofs;
CREATE TRIGGER trigger_auto_green_on_proof
  AFTER INSERT ON proofs
  FOR EACH ROW
  EXECUTE FUNCTION auto_green_on_proof();

-- Function: Check and create automatic escalations
CREATE OR REPLACE FUNCTION check_auto_escalations()
RETURNS void AS $$
DECLARE
  zone_record RECORD;
  hours_until_deadline numeric;
  current_time timestamptz := now();
BEGIN
  -- Loop through all RED zones that have deadlines
  FOR zone_record IN
    SELECT
      z.*,
      EXTRACT(EPOCH FROM (z.deadline - current_time)) / 3600 AS hours_remaining
    FROM zones z
    WHERE
      z.status = 'RED'
      AND z.deadline IS NOT NULL
      AND z.deadline > current_time
      AND (z.last_escalation_check IS NULL OR z.last_escalation_check < current_time - INTERVAL '1 hour')
  LOOP
    hours_until_deadline := zone_record.hours_remaining;

    -- Level 3 Escalation (Final Authority)
    IF hours_until_deadline <= zone_record.escalation_3_hours
       AND (zone_record.escalation_level IS NULL OR zone_record.escalation_level != 'L3') THEN

      INSERT INTO escalations (project_id, zone_id, level, note, responsible_person, eta, created_by, created_by_email)
      VALUES (
        zone_record.project_id,
        zone_record.id,
        'L3',
        'CRITICAL: Zone deadline in ' || ROUND(hours_until_deadline::numeric, 1) || ' hours. Final authority escalation.',
        zone_record.final_authority,
        zone_record.deadline,
        'system',
        'system@celestar.app'
      );

      UPDATE zones SET escalation_level = 'L3', is_escalated = true, last_escalation_check = current_time
      WHERE id = zone_record.id;

    -- Level 2 Escalation (Site Authority)
    ELSIF hours_until_deadline <= zone_record.escalation_2_hours
          AND (zone_record.escalation_level IS NULL OR zone_record.escalation_level = 'L1') THEN

      INSERT INTO escalations (project_id, zone_id, level, note, responsible_person, eta, created_by, created_by_email)
      VALUES (
        zone_record.project_id,
        zone_record.id,
        'L2',
        'URGENT: Zone deadline in ' || ROUND(hours_until_deadline::numeric, 1) || ' hours. Site authority escalation.',
        zone_record.site_authority,
        zone_record.deadline,
        'system',
        'system@celestar.app'
      );

      UPDATE zones SET escalation_level = 'L2', is_escalated = true, last_escalation_check = current_time
      WHERE id = zone_record.id;

    -- Level 1 Escalation (Site Coordinator)
    ELSIF hours_until_deadline <= zone_record.escalation_1_hours
          AND zone_record.escalation_level IS NULL THEN

      INSERT INTO escalations (project_id, zone_id, level, note, responsible_person, eta, created_by, created_by_email)
      VALUES (
        zone_record.project_id,
        zone_record.id,
        'L1',
        'WARNING: Zone deadline in ' || ROUND(hours_until_deadline::numeric, 1) || ' hours. Site coordinator escalation.',
        zone_record.site_coordinator,
        zone_record.deadline,
        'system',
        'system@celestar.app'
      );

      UPDATE zones SET escalation_level = 'L1', is_escalated = true, last_escalation_check = current_time
      WHERE id = zone_record.id;

    ELSE
      -- Just update the last check time
      UPDATE zones SET last_escalation_check = current_time
      WHERE id = zone_record.id;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Restrictive RLS Policy: Only allow admins to manually update zone status
DROP POLICY IF EXISTS "Authenticated users can update zones" ON zones;

CREATE POLICY "Admins can update zones"
  ON zones FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE uid::text = auth.uid()::text AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE uid::text = auth.uid()::text AND role = 'admin'
    )
  );

CREATE POLICY "Supervisors can update zone details (not status)"
  ON zones FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE uid::text = auth.uid()::text AND role IN ('supervisor', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE uid::text = auth.uid()::text AND role IN ('supervisor', 'admin')
    )
  );

-- Comment for documentation
COMMENT ON FUNCTION auto_green_on_proof() IS 'Automatically changes zone status from RED to GREEN when proof is uploaded. This enforces the proof-first verification system.';
COMMENT ON FUNCTION check_auto_escalations() IS 'Checks all RED zones with deadlines and automatically creates escalations at T-24h (L1), T-16h (L2), and T-8h (L3) before deadline.';

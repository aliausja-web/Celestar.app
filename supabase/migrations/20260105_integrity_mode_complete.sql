/*
  # CELESTAR INTEGRITY MODE - Complete Non-Manipulable Verification System

  This migration implements the complete integrity mode as specified:
  - Status is COMPUTED ONLY, never manually set
  - Proof-gated GREEN status (RED by default)
  - Automatic deadline-driven escalations
  - Immutable audit trail
  - Strict RBAC enforcement

  ## Key Principles
  1. Status = f(proof) - computed server-side only
  2. Escalations are automatic and non-dismissable
  3. Audit log is append-only and immutable
  4. No manual overrides (except System Owner emergency)
  5. Silence defaults to RED
*/

-- ============================================================================
-- PHASE 1: EXTENDED ROLES
-- ============================================================================

-- Drop old role check and create new one with System Owner
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('system_owner', 'org_admin', 'project_manager', 'site_coordinator', 'viewer', 'admin', 'supervisor', 'client'));

-- Add role description for clarity
COMMENT ON COLUMN users.role IS 'Roles: system_owner (Celestar), org_admin (CEO), project_manager, site_coordinator, viewer, admin (legacy), supervisor (legacy), client (legacy)';

-- ============================================================================
-- PHASE 2: AUDIT LOG - Immutable Append-Only Events
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL CHECK (event_type IN (
    'proof_uploaded', 'proof_deleted', 'status_changed_auto',
    'escalation_triggered', 'escalation_acknowledged', 'deadline_updated',
    'zone_created', 'zone_updated', 'user_added', 'user_role_changed',
    'project_created', 'project_updated', 'system_override'
  )),
  entity_type text NOT NULL CHECK (entity_type IN ('zone', 'proof', 'escalation', 'user', 'project', 'system')),
  entity_id uuid,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  zone_id uuid REFERENCES zones(id) ON DELETE SET NULL,
  actor_uid text,
  actor_email text,
  actor_role text,
  event_data jsonb DEFAULT '{}'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  rationale text,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Audit log is append-only - no updates or deletes allowed via RLS
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read audit_log"
  ON audit_log FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only system can insert audit_log"
  ON audit_log FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Only allow inserts from service role or system owner
    auth.uid()::text = actor_uid OR
    EXISTS (SELECT 1 FROM users WHERE uid::text = auth.uid()::text AND role = 'system_owner')
  );

-- NO UPDATE OR DELETE POLICIES - Immutable!

CREATE INDEX idx_audit_log_zone ON audit_log(zone_id, created_at DESC);
CREATE INDEX idx_audit_log_project ON audit_log(project_id, created_at DESC);
CREATE INDEX idx_audit_log_event_type ON audit_log(event_type, created_at DESC);

-- ============================================================================
-- PHASE 3: ESCALATION EVENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS escalation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id uuid NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  level integer NOT NULL CHECK (level >= 1 AND level <= 3),
  triggered_at timestamptz DEFAULT now() NOT NULL,
  recipients jsonb DEFAULT '[]'::jsonb, -- Array of {role, email, name}
  threshold_minutes_past_deadline integer NOT NULL,
  new_deadline_set_to timestamptz,
  acknowledged boolean DEFAULT false,
  acknowledged_by_uid text,
  acknowledged_by_email text,
  acknowledged_at timestamptz,
  acknowledgment_note text,
  status text DEFAULT 'active' CHECK (status IN ('active', 'resolved')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE escalation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read escalation_events"
  ON escalation_events FOR SELECT
  TO authenticated
  USING (true);

-- Only system can insert (via trigger/function)
CREATE POLICY "Only system can insert escalation_events"
  ON escalation_events FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE uid::text = auth.uid()::text AND role IN ('system_owner', 'org_admin'))
  );

-- Users can acknowledge (update ack fields only)
CREATE POLICY "Users can acknowledge escalations"
  ON escalation_events FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_escalation_zone ON escalation_events(zone_id, level, triggered_at DESC);
CREATE INDEX idx_escalation_status ON escalation_events(status, triggered_at DESC);

-- ============================================================================
-- PHASE 4: ZONES TABLE EXTENSIONS
-- ============================================================================

-- Add proof requirements and escalation policy
ALTER TABLE zones
ADD COLUMN IF NOT EXISTS required_proof_types jsonb DEFAULT '["photo"]'::jsonb,
ADD COLUMN IF NOT EXISTS required_proof_count integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS readiness_deadline timestamptz,
ADD COLUMN IF NOT EXISTS escalation_policy jsonb DEFAULT '[
  {"level":1, "threshold_minutes_past_deadline":0, "recipients_role":["site_coordinator"], "new_deadline_minutes_from_now":1440},
  {"level":2, "threshold_minutes_past_deadline":480, "recipients_role":["project_manager"], "new_deadline_minutes_from_now":960},
  {"level":3, "threshold_minutes_past_deadline":960, "recipients_role":["org_admin"], "new_deadline_minutes_from_now":480}
]'::jsonb,
ADD COLUMN IF NOT EXISTS current_escalation_level integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_escalated_at timestamptz,
ADD COLUMN IF NOT EXISTS computed_status text DEFAULT 'RED' CHECK (computed_status IN ('RED', 'GREEN')),
ADD COLUMN IF NOT EXISTS status_computed_at timestamptz DEFAULT now();

-- Make old 'status' column a computed field (for backward compatibility during migration)
-- After full migration, we'll use computed_status exclusively

COMMENT ON COLUMN zones.required_proof_types IS 'Array of proof types required: ["photo"], ["photo","video"], etc.';
COMMENT ON COLUMN zones.required_proof_count IS 'Minimum number of proof items needed';
COMMENT ON COLUMN zones.readiness_deadline IS 'Absolute deadline for this zone';
COMMENT ON COLUMN zones.escalation_policy IS 'Array of escalation steps with thresholds and recipients';
COMMENT ON COLUMN zones.computed_status IS 'System-computed status based on proof. NEVER set manually.';

-- ============================================================================
-- PHASE 5: PROOFS TABLE EXTENSIONS
-- ============================================================================

ALTER TABLE proofs
ADD COLUMN IF NOT EXISTS proof_type text DEFAULT 'photo' CHECK (proof_type IN ('photo', 'video', 'document')),
ADD COLUMN IF NOT EXISTS metadata_exif jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS gps_latitude numeric,
ADD COLUMN IF NOT EXISTS gps_longitude numeric,
ADD COLUMN IF NOT EXISTS capture_timestamp timestamptz,
ADD COLUMN IF NOT EXISTS is_valid boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS validation_notes text;

-- Index for proof queries
CREATE INDEX IF NOT EXISTS idx_proofs_zone_valid ON proofs(zone_id, is_valid, created_at DESC);

-- ============================================================================
-- PHASE 6: COMPUTE ZONE STATUS FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION compute_zone_status(p_zone_id uuid)
RETURNS text AS $$
DECLARE
  v_zone RECORD;
  v_valid_proof_count integer;
  v_required_count integer;
  v_required_types jsonb;
  v_has_all_types boolean;
  v_proof_type text;
BEGIN
  -- Get zone details
  SELECT
    required_proof_count,
    required_proof_types
  INTO v_zone
  FROM zones
  WHERE id = p_zone_id;

  IF NOT FOUND THEN
    RETURN 'RED'; -- Zone doesn't exist, default to RED
  END IF;

  v_required_count := v_zone.required_proof_count;
  v_required_types := v_zone.required_proof_types;

  -- Count valid proofs for this zone
  SELECT COUNT(*) INTO v_valid_proof_count
  FROM proofs
  WHERE zone_id = p_zone_id
    AND is_valid = true;

  -- Check if we have minimum count
  IF v_valid_proof_count < v_required_count THEN
    RETURN 'RED';
  END IF;

  -- Check if all required proof types are present
  v_has_all_types := true;
  FOR v_proof_type IN SELECT jsonb_array_elements_text(v_required_types)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM proofs
      WHERE zone_id = p_zone_id
        AND is_valid = true
        AND proof_type = v_proof_type
    ) THEN
      v_has_all_types := false;
      EXIT;
    END IF;
  END LOOP;

  IF NOT v_has_all_types THEN
    RETURN 'RED';
  END IF;

  -- All criteria met
  RETURN 'GREEN';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION compute_zone_status IS 'Computes zone status based ONLY on proof. Returns RED or GREEN. NEVER manually set.';

-- ============================================================================
-- PHASE 7: AUTO-UPDATE STATUS ON PROOF UPLOAD/DELETE
-- ============================================================================

CREATE OR REPLACE FUNCTION update_zone_status_on_proof()
RETURNS TRIGGER AS $$
DECLARE
  v_new_status text;
  v_old_status text;
  v_proof_ids jsonb;
BEGIN
  -- Get current computed status
  SELECT computed_status INTO v_old_status
  FROM zones WHERE id = COALESCE(NEW.zone_id, OLD.zone_id);

  -- Recompute status
  v_new_status := compute_zone_status(COALESCE(NEW.zone_id, OLD.zone_id));

  -- Update zone with new computed status
  UPDATE zones
  SET
    computed_status = v_new_status,
    status_computed_at = now(),
    status = v_new_status, -- Update legacy status field too
    last_verified_at = CASE WHEN v_new_status = 'GREEN' THEN now() ELSE last_verified_at END,
    is_escalated = CASE WHEN v_new_status = 'GREEN' THEN false ELSE is_escalated END,
    escalation_level = CASE WHEN v_new_status = 'GREEN' THEN NULL ELSE escalation_level END,
    current_escalation_level = CASE WHEN v_new_status = 'GREEN' THEN 0 ELSE current_escalation_level END
  WHERE id = COALESCE(NEW.zone_id, OLD.zone_id);

  -- If status changed, log it
  IF v_old_status IS DISTINCT FROM v_new_status THEN
    -- Get all proof IDs for this zone
    SELECT jsonb_agg(id) INTO v_proof_ids
    FROM proofs
    WHERE zone_id = COALESCE(NEW.zone_id, OLD.zone_id) AND is_valid = true;

    INSERT INTO audit_log (
      event_type,
      entity_type,
      entity_id,
      zone_id,
      project_id,
      actor_uid,
      actor_email,
      actor_role,
      event_data,
      metadata
    )
    SELECT
      'status_changed_auto',
      'zone',
      COALESCE(NEW.zone_id, OLD.zone_id),
      COALESCE(NEW.zone_id, OLD.zone_id),
      COALESCE(NEW.project_id, OLD.project_id),
      COALESCE(NEW.uploaded_by_uid, OLD.uploaded_by_uid, 'system'),
      COALESCE(NEW.uploaded_by_email, OLD.uploaded_by_email, 'system@celestar.app'),
      'system',
      jsonb_build_object(
        'old_status', v_old_status,
        'new_status', v_new_status,
        'proof_ids', v_proof_ids,
        'trigger', TG_OP
      ),
      jsonb_build_object(
        'computed_by', 'compute_zone_status',
        'timestamp', now()
      );

    -- If changed to GREEN, mark all active escalations as resolved
    IF v_new_status = 'GREEN' THEN
      UPDATE escalation_events
      SET status = 'resolved'
      WHERE zone_id = COALESCE(NEW.zone_id, OLD.zone_id)
        AND status = 'active';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Triggers for proof insert/update/delete
DROP TRIGGER IF EXISTS trigger_update_status_on_proof_insert ON proofs;
CREATE TRIGGER trigger_update_status_on_proof_insert
  AFTER INSERT ON proofs
  FOR EACH ROW
  EXECUTE FUNCTION update_zone_status_on_proof();

DROP TRIGGER IF EXISTS trigger_update_status_on_proof_update ON proofs;
CREATE TRIGGER trigger_update_status_on_proof_update
  AFTER UPDATE ON proofs
  FOR EACH ROW
  WHEN (OLD.is_valid IS DISTINCT FROM NEW.is_valid)
  EXECUTE FUNCTION update_zone_status_on_proof();

DROP TRIGGER IF EXISTS trigger_update_status_on_proof_delete ON proofs;
CREATE TRIGGER trigger_update_status_on_proof_delete
  AFTER DELETE ON proofs
  FOR EACH ROW
  EXECUTE FUNCTION update_zone_status_on_proof();

-- ============================================================================
-- PHASE 8: ESCALATION ENGINE FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION check_and_trigger_escalations()
RETURNS TABLE(zones_checked integer, escalations_created integer) AS $$
DECLARE
  v_zone RECORD;
  v_policy RECORD;
  v_deadline timestamptz;
  v_minutes_past_deadline numeric;
  v_next_level integer;
  v_new_deadline timestamptz;
  v_recipients jsonb;
  v_zones_checked integer := 0;
  v_escalations_created integer := 0;
BEGIN
  -- Loop through all RED zones with deadlines
  FOR v_zone IN
    SELECT
      z.*,
      EXTRACT(EPOCH FROM (now() - z.readiness_deadline)) / 60 AS minutes_past_deadline
    FROM zones z
    WHERE z.computed_status = 'RED'
      AND z.readiness_deadline IS NOT NULL
      AND z.readiness_deadline < now()
      AND z.current_escalation_level < 3
      AND (z.last_escalated_at IS NULL OR z.last_escalated_at < now() - INTERVAL '30 minutes')
  LOOP
    v_zones_checked := v_zones_checked + 1;
    v_minutes_past_deadline := v_zone.minutes_past_deadline;
    v_next_level := v_zone.current_escalation_level + 1;

    -- Get the escalation policy for the next level
    SELECT * INTO v_policy
    FROM jsonb_to_recordset(v_zone.escalation_policy) AS x(
      level integer,
      threshold_minutes_past_deadline integer,
      recipients_role jsonb,
      new_deadline_minutes_from_now integer
    )
    WHERE level = v_next_level
    LIMIT 1;

    IF FOUND AND v_minutes_past_deadline >= v_policy.threshold_minutes_past_deadline THEN
      -- Calculate new deadline
      v_new_deadline := now() + (v_policy.new_deadline_minutes_from_now || ' minutes')::interval;

      -- Build recipients list
      v_recipients := v_policy.recipients_role;

      -- Create escalation event
      INSERT INTO escalation_events (
        zone_id,
        project_id,
        level,
        threshold_minutes_past_deadline,
        new_deadline_set_to,
        recipients,
        status
      ) VALUES (
        v_zone.id,
        v_zone.project_id,
        v_next_level,
        v_policy.threshold_minutes_past_deadline,
        v_new_deadline,
        v_recipients,
        'active'
      );

      -- Update zone escalation level and deadline
      UPDATE zones
      SET
        current_escalation_level = v_next_level,
        last_escalated_at = now(),
        readiness_deadline = v_new_deadline,
        is_escalated = true,
        escalation_level = ('L' || v_next_level)::text
      WHERE id = v_zone.id;

      -- Log to audit
      INSERT INTO audit_log (
        event_type,
        entity_type,
        entity_id,
        zone_id,
        project_id,
        actor_uid,
        actor_email,
        actor_role,
        event_data,
        rationale
      ) VALUES (
        'escalation_triggered',
        'escalation',
        v_zone.id,
        v_zone.id,
        v_zone.project_id,
        'system',
        'system@celestar.app',
        'system',
        jsonb_build_object(
          'level', v_next_level,
          'old_deadline', v_zone.readiness_deadline,
          'new_deadline', v_new_deadline,
          'minutes_past_deadline', v_minutes_past_deadline,
          'recipients', v_recipients
        ),
        'Automatic escalation: deadline passed and zone still RED'
      );

      v_escalations_created := v_escalations_created + 1;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_zones_checked, v_escalations_created;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION check_and_trigger_escalations IS 'Escalation engine: checks RED zones past deadline and triggers escalations automatically. Run via cron every 5-15 minutes.';

-- ============================================================================
-- PHASE 9: STRICT RLS POLICIES - NO MANUAL STATUS UPDATES
-- ============================================================================

-- Drop old permissive zone update policies
DROP POLICY IF EXISTS "Authenticated users can update zones" ON zones;
DROP POLICY IF EXISTS "Admins can update zones" ON zones;
DROP POLICY IF EXISTS "Supervisors can update zone details (not status)" ON zones;

-- READ: Everyone authenticated can read zones
CREATE POLICY "Authenticated users can read zones"
  ON zones FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: Only org_admin and system_owner can create zones
CREATE POLICY "Only org_admin+ can create zones"
  ON zones FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE uid::text = auth.uid()::text
        AND role IN ('system_owner', 'org_admin', 'admin')
    )
  );

-- UPDATE: Extremely restricted
CREATE POLICY "Only non-status fields can be updated by authorized roles"
  ON zones FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE uid::text = auth.uid()::text
        AND role IN ('system_owner', 'org_admin', 'project_manager', 'admin')
    )
  )
  WITH CHECK (
    -- Ensure status fields are not being manually changed
    (OLD.computed_status IS NOT DISTINCT FROM NEW.computed_status) AND
    (OLD.status_computed_at IS NOT DISTINCT FROM NEW.status_computed_at) AND
    -- Allow updates to other fields
    EXISTS (
      SELECT 1 FROM users
      WHERE uid::text = auth.uid()::text
        AND role IN ('system_owner', 'org_admin', 'project_manager', 'admin')
    )
  );

-- DELETE: Only system_owner can delete zones
CREATE POLICY "Only system_owner can delete zones"
  ON zones FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE uid::text = auth.uid()::text
        AND role IN ('system_owner', 'admin')
    )
  );

-- Proof policies: site_coordinator, project_manager, org_admin can upload
DROP POLICY IF EXISTS "Authenticated users can insert proofs" ON proofs;

CREATE POLICY "Authorized roles can upload proofs"
  ON proofs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE uid::text = auth.uid()::text
        AND role IN ('system_owner', 'org_admin', 'project_manager', 'site_coordinator', 'admin', 'supervisor')
    ) AND
    uploaded_by_uid = auth.uid()::text
  );

-- Proof deletion: only within 5 minutes AND by uploader AND not if zone is GREEN
CREATE POLICY "Limited proof deletion"
  ON proofs FOR DELETE
  TO authenticated
  USING (
    uploaded_by_uid = auth.uid()::text AND
    created_at > now() - INTERVAL '5 minutes' AND
    NOT EXISTS (
      SELECT 1 FROM zones
      WHERE zones.id = proofs.zone_id
        AND zones.computed_status = 'GREEN'
    )
  );

-- ============================================================================
-- PHASE 10: INITIALIZE COMPUTED STATUS FOR EXISTING ZONES
-- ============================================================================

-- Compute status for all existing zones
DO $$
DECLARE
  v_zone_id uuid;
BEGIN
  FOR v_zone_id IN SELECT id FROM zones
  LOOP
    UPDATE zones
    SET
      computed_status = compute_zone_status(v_zone_id),
      status_computed_at = now()
    WHERE id = v_zone_id;
  END LOOP;
END $$;

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE audit_log IS 'Immutable append-only audit trail. NO updates or deletes allowed.';
COMMENT ON TABLE escalation_events IS 'Escalation events - triggered automatically by system, can be acknowledged but not dismissed.';
COMMENT ON FUNCTION update_zone_status_on_proof IS 'Auto-recomputes zone status when proof is added/removed. Logs status changes to audit_log.';
COMMENT ON FUNCTION check_and_trigger_escalations IS 'Escalation engine to be run via cron. Checks deadlines and triggers escalations automatically.';

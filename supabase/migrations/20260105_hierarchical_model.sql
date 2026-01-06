-- ============================================================================
-- CELESTAR EXECUTION READINESS PLATFORM - Hierarchical Model
-- ============================================================================
-- Generic execution model: Program → Workstream → Unit (Deliverable)
-- Supports: single projects, multi-site initiatives, phased programs, parallel workstreams
-- ============================================================================

-- ============================================================================
-- PHASE 1: CREATE CORE TABLES
-- ============================================================================

-- 1) PROGRAM: Top-level initiative
CREATE TABLE IF NOT EXISTS programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  owner_org text NOT NULL,
  start_time timestamptz,
  end_time timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  created_by text,
  created_by_email text
);

CREATE INDEX IF NOT EXISTS idx_programs_owner_org ON programs(owner_org);
CREATE INDEX IF NOT EXISTS idx_programs_created_at ON programs(created_at DESC);

-- 2) WORKSTREAM: Logical execution container (site, phase, area, etc.)
CREATE TABLE IF NOT EXISTS workstreams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text, -- Optional: 'site', 'phase', 'discipline', 'area', etc.
  ordering integer DEFAULT 0,
  overall_status text DEFAULT 'RED' CHECK (overall_status IN ('RED', 'GREEN')),
  last_update_time timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workstreams_program_id ON workstreams(program_id);
CREATE INDEX IF NOT EXISTS idx_workstreams_overall_status ON workstreams(overall_status);
CREATE INDEX IF NOT EXISTS idx_workstreams_ordering ON workstreams(program_id, ordering);

-- 3) UNIT (DELIVERABLE): Concrete item that can be proven complete
CREATE TABLE IF NOT EXISTS units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workstream_id uuid NOT NULL REFERENCES workstreams(id) ON DELETE CASCADE,
  title text NOT NULL,
  owner_party_name text NOT NULL,
  required_green_by timestamptz,
  proof_requirements jsonb DEFAULT '{"required_count": 1, "required_types": ["photo"]}'::jsonb,
  computed_status text DEFAULT 'RED' CHECK (computed_status IN ('RED', 'GREEN')),
  status_computed_at timestamptz DEFAULT now(),
  last_status_change_time timestamptz DEFAULT now(),

  -- Escalation tracking
  current_escalation_level integer DEFAULT 0 CHECK (current_escalation_level BETWEEN 0 AND 3),
  last_escalated_at timestamptz,
  escalation_policy jsonb DEFAULT '[
    {"level": 1, "threshold_minutes_past_deadline": 0, "recipients_role": ["coordinator"], "new_deadline_minutes_from_now": 1440},
    {"level": 2, "threshold_minutes_past_deadline": 480, "recipients_role": ["pm"], "new_deadline_minutes_from_now": 960},
    {"level": 3, "threshold_minutes_past_deadline": 960, "recipients_role": ["org_admin"], "new_deadline_minutes_from_now": 480}
  ]'::jsonb,

  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_units_workstream_id ON units(workstream_id);
CREATE INDEX IF NOT EXISTS idx_units_computed_status ON units(computed_status);
CREATE INDEX IF NOT EXISTS idx_units_required_green_by ON units(required_green_by);
CREATE INDEX IF NOT EXISTS idx_units_escalation_level ON units(current_escalation_level);

-- 4) PROOF: Evidence of completion
CREATE TABLE IF NOT EXISTS proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('photo', 'video', 'document', 'link')),
  url text NOT NULL,
  captured_at timestamptz,
  uploaded_at timestamptz DEFAULT now() NOT NULL,
  uploaded_by text NOT NULL,
  uploaded_by_email text,

  -- Validation
  is_valid boolean DEFAULT true,
  validation_notes text,

  -- Metadata
  metadata_exif jsonb DEFAULT '{}'::jsonb,
  gps_latitude numeric,
  gps_longitude numeric
);

CREATE INDEX IF NOT EXISTS idx_proofs_unit_id ON proofs(unit_id);
CREATE INDEX IF NOT EXISTS idx_proofs_is_valid ON proofs(is_valid);
CREATE INDEX IF NOT EXISTS idx_proofs_uploaded_at ON proofs(uploaded_at DESC);

-- 5) STATUS_EVENT: Immutable audit log
CREATE TABLE IF NOT EXISTS status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  old_status text CHECK (old_status IN ('RED', 'GREEN')),
  new_status text NOT NULL CHECK (new_status IN ('RED', 'GREEN')),
  changed_at timestamptz DEFAULT now() NOT NULL,
  changed_by text,
  changed_by_email text,
  reason text NOT NULL CHECK (reason IN ('valid_proof_received', 'proof_deleted', 'proof_invalidated', 'deadline_missed', 'manual_override', 'system_init')),
  proof_id uuid REFERENCES proofs(id) ON DELETE SET NULL,
  notes text
);

CREATE INDEX IF NOT EXISTS idx_status_events_unit_id ON status_events(unit_id);
CREATE INDEX IF NOT EXISTS idx_status_events_changed_at ON status_events(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_status_events_reason ON status_events(reason);

-- 6) ESCALATION_EVENTS: Track automatic escalations
CREATE TABLE IF NOT EXISTS unit_escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  workstream_id uuid NOT NULL REFERENCES workstreams(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE,

  level integer NOT NULL CHECK (level IN (1, 2, 3)),
  triggered_at timestamptz DEFAULT now() NOT NULL,
  recipients jsonb DEFAULT '[]'::jsonb,
  threshold_minutes_past_deadline integer NOT NULL,
  new_deadline_set_to timestamptz,

  acknowledged boolean DEFAULT false,
  acknowledged_by text,
  acknowledged_by_email text,
  acknowledged_at timestamptz,
  acknowledgment_note text,

  status text DEFAULT 'active' CHECK (status IN ('active', 'resolved')),
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_unit_escalations_unit_id ON unit_escalations(unit_id);
CREATE INDEX IF NOT EXISTS idx_unit_escalations_status ON unit_escalations(status);
CREATE INDEX IF NOT EXISTS idx_unit_escalations_level ON unit_escalations(level);
CREATE INDEX IF NOT EXISTS idx_unit_escalations_program_id ON unit_escalations(program_id);

-- ============================================================================
-- PHASE 2: STATUS COMPUTATION FUNCTIONS
-- ============================================================================

-- Compute unit status based on proof requirements
CREATE OR REPLACE FUNCTION compute_unit_status(unit_id_param uuid)
RETURNS text AS $$
DECLARE
  v_proof_reqs jsonb;
  v_required_count integer;
  v_required_types jsonb;
  v_actual_count integer;
  v_actual_types jsonb;
  v_has_all_types boolean;
BEGIN
  -- Get unit proof requirements
  SELECT proof_requirements INTO v_proof_reqs FROM units WHERE id = unit_id_param;

  v_required_count := COALESCE((v_proof_reqs->>'required_count')::integer, 1);
  v_required_types := COALESCE(v_proof_reqs->'required_types', '["photo"]'::jsonb);

  -- Count valid proofs
  SELECT COUNT(*), jsonb_agg(DISTINCT type)
  INTO v_actual_count, v_actual_types
  FROM proofs
  WHERE unit_id = unit_id_param AND is_valid = true;

  -- Check if all required proof types are present
  v_has_all_types := (
    SELECT bool_and(v_actual_types ? required_type::text)
    FROM jsonb_array_elements_text(v_required_types) AS required_type
  );

  -- Return GREEN only if both conditions met
  IF v_actual_count >= v_required_count AND COALESCE(v_has_all_types, false) THEN
    RETURN 'GREEN';
  ELSE
    RETURN 'RED';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Compute workstream overall status (RED if any unit is RED)
CREATE OR REPLACE FUNCTION compute_workstream_status(workstream_id_param uuid)
RETURNS text AS $$
DECLARE
  v_has_red boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM units
    WHERE workstream_id = workstream_id_param
    AND computed_status = 'RED'
  ) INTO v_has_red;

  IF v_has_red THEN
    RETURN 'RED';
  ELSE
    RETURN 'GREEN';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PHASE 3: AUTO-UPDATE TRIGGERS
-- ============================================================================

-- Trigger: Update unit status when proofs change
CREATE OR REPLACE FUNCTION trigger_update_unit_status()
RETURNS TRIGGER AS $$
DECLARE
  v_old_status text;
  v_new_status text;
  v_reason text;
BEGIN
  -- Get current status
  SELECT computed_status INTO v_old_status FROM units WHERE id = COALESCE(NEW.unit_id, OLD.unit_id);

  -- Compute new status
  v_new_status := compute_unit_status(COALESCE(NEW.unit_id, OLD.unit_id));

  -- Determine reason
  IF TG_OP = 'INSERT' THEN
    v_reason := 'valid_proof_received';
  ELSIF TG_OP = 'DELETE' THEN
    v_reason := 'proof_deleted';
  ELSE
    v_reason := 'proof_invalidated';
  END IF;

  -- If status changed, update unit and log
  IF v_old_status IS DISTINCT FROM v_new_status THEN
    UPDATE units
    SET computed_status = v_new_status,
        status_computed_at = now(),
        last_status_change_time = now()
    WHERE id = COALESCE(NEW.unit_id, OLD.unit_id);

    INSERT INTO status_events (unit_id, old_status, new_status, changed_by, changed_by_email, reason, proof_id)
    VALUES (
      COALESCE(NEW.unit_id, OLD.unit_id),
      v_old_status,
      v_new_status,
      COALESCE(NEW.uploaded_by, OLD.uploaded_by, 'system'),
      COALESCE(NEW.uploaded_by_email, OLD.uploaded_by_email, 'system@celestar.app'),
      v_reason,
      CASE WHEN TG_OP = 'INSERT' THEN NEW.id ELSE NULL END
    );

    -- If turned GREEN, resolve active escalations
    IF v_new_status = 'GREEN' THEN
      UPDATE unit_escalations
      SET status = 'resolved'
      WHERE unit_id = COALESCE(NEW.unit_id, OLD.unit_id) AND status = 'active';
    END IF;

    -- Update workstream overall_status
    UPDATE workstreams
    SET overall_status = compute_workstream_status(
      (SELECT workstream_id FROM units WHERE id = COALESCE(NEW.unit_id, OLD.unit_id))
    ),
    last_update_time = now()
    WHERE id = (SELECT workstream_id FROM units WHERE id = COALESCE(NEW.unit_id, OLD.unit_id));
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_proof_insert_update_unit_status ON proofs;
DROP TRIGGER IF EXISTS trigger_proof_delete_update_unit_status ON proofs;
DROP TRIGGER IF EXISTS trigger_proof_update_update_unit_status ON proofs;

CREATE TRIGGER trigger_proof_insert_update_unit_status
  AFTER INSERT ON proofs FOR EACH ROW EXECUTE FUNCTION trigger_update_unit_status();

CREATE TRIGGER trigger_proof_delete_update_unit_status
  AFTER DELETE ON proofs FOR EACH ROW EXECUTE FUNCTION trigger_update_unit_status();

CREATE TRIGGER trigger_proof_update_update_unit_status
  AFTER UPDATE OF is_valid ON proofs FOR EACH ROW
  WHEN (OLD.is_valid IS DISTINCT FROM NEW.is_valid)
  EXECUTE FUNCTION trigger_update_unit_status();

-- ============================================================================
-- PHASE 4: ESCALATION ENGINE
-- ============================================================================

CREATE OR REPLACE FUNCTION check_and_trigger_unit_escalations()
RETURNS TABLE(units_checked integer, escalations_created integer) AS $$
DECLARE
  v_unit RECORD;
  v_policy RECORD;
  v_units_checked integer := 0;
  v_escalations_created integer := 0;
  v_new_deadline timestamptz;
BEGIN
  FOR v_unit IN
    SELECT u.id, u.workstream_id, u.title, u.computed_status, u.required_green_by,
           u.current_escalation_level, u.escalation_policy,
           w.program_id,
           EXTRACT(EPOCH FROM (now() - u.required_green_by)) / 60 AS minutes_past_deadline
    FROM units u
    JOIN workstreams w ON w.id = u.workstream_id
    WHERE u.computed_status = 'RED'
      AND u.required_green_by IS NOT NULL
      AND u.required_green_by < now()
      AND u.current_escalation_level < 3
  LOOP
    v_units_checked := v_units_checked + 1;

    FOR v_policy IN
      SELECT * FROM jsonb_to_recordset(v_unit.escalation_policy) AS x(
        level integer,
        threshold_minutes_past_deadline integer,
        recipients_role jsonb,
        new_deadline_minutes_from_now integer
      )
      WHERE level = v_unit.current_escalation_level + 1
    LOOP
      IF v_unit.minutes_past_deadline >= v_policy.threshold_minutes_past_deadline THEN
        v_new_deadline := now() + (v_policy.new_deadline_minutes_from_now || ' minutes')::interval;

        INSERT INTO unit_escalations (unit_id, workstream_id, program_id, level, threshold_minutes_past_deadline, recipients, new_deadline_set_to, status)
        VALUES (v_unit.id, v_unit.workstream_id, v_unit.program_id, v_policy.level, v_policy.threshold_minutes_past_deadline,
                jsonb_build_array(jsonb_build_object('role', v_policy.recipients_role)), v_new_deadline, 'active');

        UPDATE units SET current_escalation_level = v_policy.level, last_escalated_at = now(), required_green_by = v_new_deadline
        WHERE id = v_unit.id;

        v_escalations_created := v_escalations_created + 1;
        EXIT;
      END IF;
    END LOOP;
  END LOOP;

  RETURN QUERY SELECT v_units_checked, v_escalations_created;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PHASE 5: ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE workstreams ENABLE ROW LEVEL SECURITY;
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE unit_escalations ENABLE ROW LEVEL SECURITY;

-- Programs: org_admin+ can manage
DROP POLICY IF EXISTS "Authenticated users can read programs" ON programs;
DROP POLICY IF EXISTS "Org admins can create programs" ON programs;
DROP POLICY IF EXISTS "Org admins can update programs" ON programs;
DROP POLICY IF EXISTS "System owners can delete programs" ON programs;

CREATE POLICY "Authenticated users can read programs" ON programs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Org admins can create programs" ON programs FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE uid::text = auth.uid()::text AND role IN ('system_owner', 'org_admin', 'admin')));
CREATE POLICY "Org admins can update programs" ON programs FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE uid::text = auth.uid()::text AND role IN ('system_owner', 'org_admin', 'admin')));
CREATE POLICY "System owners can delete programs" ON programs FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE uid::text = auth.uid()::text AND role IN ('system_owner', 'admin')));

-- Workstreams: org_admin+ can manage
DROP POLICY IF EXISTS "Authenticated users can read workstreams" ON workstreams;
DROP POLICY IF EXISTS "Org admins can manage workstreams" ON workstreams;

CREATE POLICY "Authenticated users can read workstreams" ON workstreams FOR SELECT TO authenticated USING (true);
CREATE POLICY "Org admins can manage workstreams" ON workstreams FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE uid::text = auth.uid()::text AND role IN ('system_owner', 'org_admin', 'admin')));

-- Units: org_admin+ can create, coordinator+ can read
DROP POLICY IF EXISTS "Authenticated users can read units" ON units;
DROP POLICY IF EXISTS "Org admins can manage units" ON units;

CREATE POLICY "Authenticated users can read units" ON units FOR SELECT TO authenticated USING (true);
CREATE POLICY "Org admins can manage units" ON units FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE uid::text = auth.uid()::text AND role IN ('system_owner', 'org_admin', 'admin')));

-- Proofs: coordinator+ can upload, limited deletion
DROP POLICY IF EXISTS "Authenticated users can read proofs" ON proofs;
DROP POLICY IF EXISTS "Coordinators can upload proofs" ON proofs;
DROP POLICY IF EXISTS "Limited proof deletion" ON proofs;

CREATE POLICY "Authenticated users can read proofs" ON proofs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Coordinators can upload proofs" ON proofs FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE uid::text = auth.uid()::text
                      AND role IN ('system_owner', 'org_admin', 'pm', 'coordinator', 'site_coordinator', 'admin', 'supervisor'))
              AND uploaded_by = auth.uid()::text);
CREATE POLICY "Limited proof deletion" ON proofs FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid()::text AND uploaded_at > now() - INTERVAL '5 minutes');

-- Status events: read-only for org_admin+, system can insert
DROP POLICY IF EXISTS "Org admins can read status events" ON status_events;
DROP POLICY IF EXISTS "System can insert status events" ON status_events;

CREATE POLICY "Org admins can read status events" ON status_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE uid::text = auth.uid()::text AND role IN ('system_owner', 'org_admin', 'admin')));
CREATE POLICY "System can insert status events" ON status_events FOR INSERT TO authenticated WITH CHECK (true);

-- Escalations: all can read, pm+ can acknowledge
DROP POLICY IF EXISTS "Authenticated users can read escalations" ON unit_escalations;
DROP POLICY IF EXISTS "System can insert escalations" ON unit_escalations;
DROP POLICY IF EXISTS "PMs can acknowledge escalations" ON unit_escalations;

CREATE POLICY "Authenticated users can read escalations" ON unit_escalations FOR SELECT TO authenticated USING (true);
CREATE POLICY "System can insert escalations" ON unit_escalations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "PMs can acknowledge escalations" ON unit_escalations FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE uid::text = auth.uid()::text AND role IN ('system_owner', 'org_admin', 'pm', 'project_manager', 'admin')))
  WITH CHECK (acknowledged = true AND acknowledged_by = auth.uid()::text);

-- ============================================================================
-- PHASE 6: INITIALIZE EXISTING DATA (if any)
-- ============================================================================

-- Initialize unit statuses
DO $$
DECLARE v_unit_id uuid;
BEGIN
  FOR v_unit_id IN SELECT id FROM units LOOP
    UPDATE units
    SET computed_status = compute_unit_status(v_unit_id),
        status_computed_at = now()
    WHERE id = v_unit_id;
  END LOOP;
END $$;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ HIERARCHICAL MODEL MIGRATION COMPLETE';
  RAISE NOTICE '📊 Tables: programs, workstreams, units, proofs, status_events, unit_escalations';
  RAISE NOTICE '🔒 RLS policies applied';
  RAISE NOTICE '⚙️  Functions: compute_unit_status(), compute_workstream_status(), check_and_trigger_unit_escalations()';
  RAISE NOTICE '🔄 Triggers: Auto-update unit status on proof changes';
  RAISE NOTICE '';
  RAISE NOTICE '🎯 Model: Program → Workstream → Unit (Deliverable)';
  RAISE NOTICE '📚 Generic execution readiness platform ready';
END $$;

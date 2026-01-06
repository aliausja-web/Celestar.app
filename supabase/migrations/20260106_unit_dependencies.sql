-- Unit Dependencies Implementation
-- Migration: 20260106_unit_dependencies.sql
-- Requirement: Hard/soft dependencies between units affecting status computation

-- ============================================================================
-- 1. CREATE UNIT_DEPENDENCIES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS unit_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  downstream_unit_id uuid NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  upstream_unit_id uuid NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  dependency_type text NOT NULL CHECK (dependency_type IN ('hard', 'soft')),
  created_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  notes text,
  UNIQUE(downstream_unit_id, upstream_unit_id),
  -- Prevent self-references
  CHECK (downstream_unit_id != upstream_unit_id)
);

CREATE INDEX IF NOT EXISTS idx_unit_dependencies_downstream ON unit_dependencies(downstream_unit_id);
CREATE INDEX IF NOT EXISTS idx_unit_dependencies_upstream ON unit_dependencies(upstream_unit_id);

-- ============================================================================
-- 2. UPDATE STATUS COMPUTATION TO RESPECT DEPENDENCIES
-- ============================================================================

-- New function: Check if a unit's hard dependencies are satisfied
CREATE OR REPLACE FUNCTION unit_hard_dependencies_satisfied(unit_id_param uuid)
RETURNS boolean AS $$
DECLARE
  unsatisfied_count integer;
BEGIN
  -- Count hard dependencies that are not GREEN
  SELECT COUNT(*) INTO unsatisfied_count
  FROM unit_dependencies ud
  JOIN units upstream ON upstream.id = ud.upstream_unit_id
  WHERE ud.downstream_unit_id = unit_id_param
  AND ud.dependency_type = 'hard'
  AND upstream.computed_status != 'GREEN';

  -- If no unsatisfied hard dependencies, return true
  RETURN unsatisfied_count = 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Updated: compute_unit_status with dependency checking
CREATE OR REPLACE FUNCTION compute_unit_status(unit_id_param uuid)
RETURNS text AS $$
DECLARE
  proof_count integer;
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

  -- Count valid proofs
  SELECT COUNT(*) INTO proof_count
  FROM unit_proofs
  WHERE unit_id = unit_id_param
  AND is_valid = true;

  -- Check if required count is met
  IF proof_count < required_count THEN
    RETURN 'RED';
  END IF;

  -- Check if all required types are present (if specified)
  IF required_types IS NOT NULL AND jsonb_array_length(required_types) > 0 THEN
    SELECT COUNT(DISTINCT type) = jsonb_array_length(required_types) INTO has_all_types
    FROM unit_proofs
    WHERE unit_id = unit_id_param
    AND is_valid = true
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
-- 3. TRIGGER TO RECOMPUTE DOWNSTREAM UNITS WHEN UPSTREAM STATUS CHANGES
-- ============================================================================

CREATE OR REPLACE FUNCTION recompute_downstream_units()
RETURNS TRIGGER AS $$
BEGIN
  -- When a unit's status changes, recompute all downstream units
  IF OLD.computed_status IS DISTINCT FROM NEW.computed_status THEN
    UPDATE units
    SET
      computed_status = compute_unit_status(id),
      status_computed_at = now()
    WHERE id IN (
      SELECT downstream_unit_id
      FROM unit_dependencies
      WHERE upstream_unit_id = NEW.id
      AND dependency_type = 'hard'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_recompute_downstream_units ON units;
CREATE TRIGGER trigger_recompute_downstream_units
  AFTER UPDATE ON units
  FOR EACH ROW
  EXECUTE FUNCTION recompute_downstream_units();

-- ============================================================================
-- 4. RLS POLICIES FOR UNIT_DEPENDENCIES
-- ============================================================================

ALTER TABLE unit_dependencies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS unit_dependencies_select_policy ON unit_dependencies;
CREATE POLICY unit_dependencies_select_policy ON unit_dependencies
  FOR SELECT
  USING (
    can_read_program((
      SELECT w.program_id FROM workstreams w
      JOIN units u ON u.workstream_id = w.id
      WHERE u.id = downstream_unit_id
    ))
  );

DROP POLICY IF EXISTS unit_dependencies_manage_policy ON unit_dependencies;
CREATE POLICY unit_dependencies_manage_policy ON unit_dependencies
  FOR ALL
  USING (
    can_manage_unit(downstream_unit_id)
  );

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

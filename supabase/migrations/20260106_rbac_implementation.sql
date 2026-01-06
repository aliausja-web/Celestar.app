-- RBAC Implementation for Execution Readiness Platform
-- Migration: 20260106_rbac_implementation.sql

-- ============================================================================
-- 1. CREATE APP_ROLE ENUM
-- ============================================================================
DO $$ BEGIN
  CREATE TYPE app_role AS ENUM (
    'PLATFORM_ADMIN',
    'PROGRAM_OWNER',
    'WORKSTREAM_LEAD',
    'FIELD_CONTRIBUTOR',
    'CLIENT_VIEWER'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 2. CREATE ORGS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS orgs (
  id text PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb
);

-- ============================================================================
-- 3. CREATE PROFILES TABLE (replaces/extends users table)
-- ============================================================================
CREATE TABLE IF NOT EXISTS profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id text NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  role app_role NOT NULL DEFAULT 'FIELD_CONTRIBUTOR',
  email text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Index for fast org lookups
CREATE INDEX IF NOT EXISTS idx_profiles_org_id ON profiles(org_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- ============================================================================
-- 4. ADD ORG_ID TO PROGRAMS TABLE
-- ============================================================================
DO $$ BEGIN
  ALTER TABLE programs ADD COLUMN org_id text REFERENCES orgs(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_programs_org_id ON programs(org_id);

-- ============================================================================
-- 5. CREATE PROGRAM_MEMBERS TABLE (role overrides at program level)
-- ============================================================================
CREATE TABLE IF NOT EXISTS program_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_override app_role NOT NULL,
  added_at timestamptz DEFAULT now() NOT NULL,
  added_by uuid REFERENCES auth.users(id),
  UNIQUE(program_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_program_members_program_id ON program_members(program_id);
CREATE INDEX IF NOT EXISTS idx_program_members_user_id ON program_members(user_id);

-- ============================================================================
-- 6. CREATE WORKSTREAM_MEMBERS TABLE (role overrides at workstream level)
-- ============================================================================
CREATE TABLE IF NOT EXISTS workstream_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workstream_id uuid NOT NULL REFERENCES workstreams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_override app_role NOT NULL,
  added_at timestamptz DEFAULT now() NOT NULL,
  added_by uuid REFERENCES auth.users(id),
  UNIQUE(workstream_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_workstream_members_workstream_id ON workstream_members(workstream_id);
CREATE INDEX IF NOT EXISTS idx_workstream_members_user_id ON workstream_members(user_id);

-- ============================================================================
-- 7. PERMISSION HELPER FUNCTIONS
-- ============================================================================

-- Check if current user is platform admin
CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE user_id = auth.uid()
    AND role = 'PLATFORM_ADMIN'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get effective role for a program (checks program_members override, then org role)
CREATE OR REPLACE FUNCTION effective_role_for_program(program_id_param uuid)
RETURNS app_role AS $$
DECLARE
  override_role app_role;
  org_role app_role;
  user_org_id text;
  program_org_id text;
BEGIN
  -- Check for program-level override
  SELECT pm.role_override INTO override_role
  FROM program_members pm
  WHERE pm.program_id = program_id_param
  AND pm.user_id = auth.uid();

  IF override_role IS NOT NULL THEN
    RETURN override_role;
  END IF;

  -- Get user's org and role
  SELECT p.org_id, p.role INTO user_org_id, org_role
  FROM profiles p
  WHERE p.user_id = auth.uid();

  -- Get program's org
  SELECT prog.org_id INTO program_org_id
  FROM programs prog
  WHERE prog.id = program_id_param;

  -- If user's org matches program's org, return org role
  IF user_org_id = program_org_id THEN
    RETURN org_role;
  END IF;

  -- No access
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get effective role for a workstream
CREATE OR REPLACE FUNCTION effective_role_for_workstream(workstream_id_param uuid)
RETURNS app_role AS $$
DECLARE
  override_role app_role;
  program_role app_role;
  program_id_val uuid;
BEGIN
  -- Check for workstream-level override
  SELECT wm.role_override INTO override_role
  FROM workstream_members wm
  WHERE wm.workstream_id = workstream_id_param
  AND wm.user_id = auth.uid();

  IF override_role IS NOT NULL THEN
    RETURN override_role;
  END IF;

  -- Get program_id for this workstream
  SELECT w.program_id INTO program_id_val
  FROM workstreams w
  WHERE w.id = workstream_id_param;

  -- Fall back to program-level role
  RETURN effective_role_for_program(program_id_val);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user can read a program
CREATE OR REPLACE FUNCTION can_read_program(program_id_param uuid)
RETURNS boolean AS $$
BEGIN
  -- Platform admins can read everything
  IF is_platform_admin() THEN
    RETURN true;
  END IF;

  -- Anyone with an effective role can read
  RETURN effective_role_for_program(program_id_param) IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user can manage a program (create/edit/delete)
CREATE OR REPLACE FUNCTION can_manage_program(program_id_param uuid)
RETURNS boolean AS $$
DECLARE
  user_role app_role;
BEGIN
  -- Platform admins can manage everything
  IF is_platform_admin() THEN
    RETURN true;
  END IF;

  user_role := effective_role_for_program(program_id_param);

  -- Only PROGRAM_OWNER can manage programs
  RETURN user_role = 'PROGRAM_OWNER';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user can manage a workstream
CREATE OR REPLACE FUNCTION can_manage_workstream(workstream_id_param uuid)
RETURNS boolean AS $$
DECLARE
  user_role app_role;
BEGIN
  -- Platform admins can manage everything
  IF is_platform_admin() THEN
    RETURN true;
  END IF;

  user_role := effective_role_for_workstream(workstream_id_param);

  -- PROGRAM_OWNER or WORKSTREAM_LEAD can manage workstreams
  RETURN user_role IN ('PROGRAM_OWNER', 'WORKSTREAM_LEAD');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user can manage a unit
CREATE OR REPLACE FUNCTION can_manage_unit(unit_id_param uuid)
RETURNS boolean AS $$
DECLARE
  user_role app_role;
  workstream_id_val uuid;
BEGIN
  -- Platform admins can manage everything
  IF is_platform_admin() THEN
    RETURN true;
  END IF;

  -- Get workstream_id for this unit
  SELECT u.workstream_id INTO workstream_id_val
  FROM units u
  WHERE u.id = unit_id_param;

  user_role := effective_role_for_workstream(workstream_id_val);

  -- PROGRAM_OWNER, WORKSTREAM_LEAD, or FIELD_CONTRIBUTOR can manage units
  RETURN user_role IN ('PROGRAM_OWNER', 'WORKSTREAM_LEAD', 'FIELD_CONTRIBUTOR');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user can upload proof
CREATE OR REPLACE FUNCTION can_upload_proof(unit_id_param uuid)
RETURNS boolean AS $$
DECLARE
  user_role app_role;
  workstream_id_val uuid;
BEGIN
  -- Platform admins can upload
  IF is_platform_admin() THEN
    RETURN true;
  END IF;

  -- Get workstream_id for this unit
  SELECT u.workstream_id INTO workstream_id_val
  FROM units u
  WHERE u.id = unit_id_param;

  user_role := effective_role_for_workstream(workstream_id_val);

  -- PROGRAM_OWNER, WORKSTREAM_LEAD, or FIELD_CONTRIBUTOR can upload proofs
  -- CLIENT_VIEWER cannot
  RETURN user_role IN ('PROGRAM_OWNER', 'WORKSTREAM_LEAD', 'FIELD_CONTRIBUTOR');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user can approve/invalidate proof
CREATE OR REPLACE FUNCTION can_approve_proof(unit_id_param uuid)
RETURNS boolean AS $$
DECLARE
  user_role app_role;
  workstream_id_val uuid;
BEGIN
  -- Platform admins can approve
  IF is_platform_admin() THEN
    RETURN true;
  END IF;

  -- Get workstream_id for this unit
  SELECT u.workstream_id INTO workstream_id_val
  FROM units u
  WHERE u.id = unit_id_param;

  user_role := effective_role_for_workstream(workstream_id_val);

  -- Only PROGRAM_OWNER or WORKSTREAM_LEAD can approve proofs
  RETURN user_role IN ('PROGRAM_OWNER', 'WORKSTREAM_LEAD');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 8. ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE workstreams ENABLE ROW LEVEL SECURITY;
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE unit_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE unit_escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE workstream_members ENABLE ROW LEVEL SECURITY;

-- ORGS: Platform admins can manage, users can view their own org
DROP POLICY IF EXISTS orgs_select_policy ON orgs;
CREATE POLICY orgs_select_policy ON orgs
  FOR SELECT
  USING (
    is_platform_admin() OR
    id IN (SELECT org_id FROM profiles WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS orgs_manage_policy ON orgs;
CREATE POLICY orgs_manage_policy ON orgs
  FOR ALL
  USING (is_platform_admin());

-- PROFILES: Users can view profiles in their org, platform admins can manage all
DROP POLICY IF EXISTS profiles_select_policy ON profiles;
CREATE POLICY profiles_select_policy ON profiles
  FOR SELECT
  USING (
    is_platform_admin() OR
    org_id IN (SELECT org_id FROM profiles WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS profiles_manage_policy ON profiles;
CREATE POLICY profiles_manage_policy ON profiles
  FOR ALL
  USING (is_platform_admin());

-- PROGRAMS: Users can view programs they have access to
DROP POLICY IF EXISTS programs_select_policy ON programs;
CREATE POLICY programs_select_policy ON programs
  FOR SELECT
  USING (can_read_program(id));

DROP POLICY IF EXISTS programs_insert_policy ON programs;
CREATE POLICY programs_insert_policy ON programs
  FOR INSERT
  WITH CHECK (is_platform_admin() OR (
    SELECT role FROM profiles WHERE user_id = auth.uid()
  ) = 'PROGRAM_OWNER');

DROP POLICY IF EXISTS programs_update_policy ON programs;
CREATE POLICY programs_update_policy ON programs
  FOR UPDATE
  USING (can_manage_program(id));

DROP POLICY IF EXISTS programs_delete_policy ON programs;
CREATE POLICY programs_delete_policy ON programs
  FOR DELETE
  USING (can_manage_program(id));

-- WORKSTREAMS: Users can view workstreams in programs they have access to
DROP POLICY IF EXISTS workstreams_select_policy ON workstreams;
CREATE POLICY workstreams_select_policy ON workstreams
  FOR SELECT
  USING (can_read_program(program_id));

DROP POLICY IF EXISTS workstreams_insert_policy ON workstreams;
CREATE POLICY workstreams_insert_policy ON workstreams
  FOR INSERT
  WITH CHECK (can_manage_program(program_id));

DROP POLICY IF EXISTS workstreams_update_policy ON workstreams;
CREATE POLICY workstreams_update_policy ON workstreams
  FOR UPDATE
  USING (can_manage_workstream(id));

DROP POLICY IF EXISTS workstreams_delete_policy ON workstreams;
CREATE POLICY workstreams_delete_policy ON workstreams
  FOR DELETE
  USING (can_manage_workstream(id));

-- UNITS: Users can view units in workstreams they have access to
DROP POLICY IF EXISTS units_select_policy ON units;
CREATE POLICY units_select_policy ON units
  FOR SELECT
  USING (
    can_read_program((SELECT program_id FROM workstreams WHERE id = workstream_id))
  );

DROP POLICY IF EXISTS units_insert_policy ON units;
CREATE POLICY units_insert_policy ON units
  FOR INSERT
  WITH CHECK (can_manage_workstream(workstream_id));

DROP POLICY IF EXISTS units_update_policy ON units;
CREATE POLICY units_update_policy ON units
  FOR UPDATE
  USING (can_manage_unit(id));

DROP POLICY IF EXISTS units_delete_policy ON units;
CREATE POLICY units_delete_policy ON units
  FOR DELETE
  USING (can_manage_unit(id));

-- UNIT_PROOFS: Users can view proofs, upload if authorized
DROP POLICY IF EXISTS unit_proofs_select_policy ON unit_proofs;
CREATE POLICY unit_proofs_select_policy ON unit_proofs
  FOR SELECT
  USING (
    can_read_program((
      SELECT program_id FROM workstreams w
      JOIN units u ON u.workstream_id = w.id
      WHERE u.id = unit_id
    ))
  );

DROP POLICY IF EXISTS unit_proofs_insert_policy ON unit_proofs;
CREATE POLICY unit_proofs_insert_policy ON unit_proofs
  FOR INSERT
  WITH CHECK (can_upload_proof(unit_id));

DROP POLICY IF EXISTS unit_proofs_update_policy ON unit_proofs;
CREATE POLICY unit_proofs_update_policy ON unit_proofs
  FOR UPDATE
  USING (can_approve_proof(unit_id));

DROP POLICY IF EXISTS unit_proofs_delete_policy ON unit_proofs;
CREATE POLICY unit_proofs_delete_policy ON unit_proofs
  FOR DELETE
  USING (can_approve_proof(unit_id));

-- STATUS_EVENTS: Append-only audit log - anyone can insert, platform admins can read all
DROP POLICY IF EXISTS status_events_select_policy ON status_events;
CREATE POLICY status_events_select_policy ON status_events
  FOR SELECT
  USING (
    can_read_program((
      SELECT program_id FROM workstreams w
      JOIN units u ON u.workstream_id = w.id
      WHERE u.id = unit_id
    ))
  );

DROP POLICY IF EXISTS status_events_insert_policy ON status_events;
CREATE POLICY status_events_insert_policy ON status_events
  FOR INSERT
  WITH CHECK (true); -- System can always insert

-- Deny UPDATE and DELETE on status_events (append-only)
DROP POLICY IF EXISTS status_events_no_update ON status_events;
CREATE POLICY status_events_no_update ON status_events
  FOR UPDATE
  USING (false);

DROP POLICY IF EXISTS status_events_no_delete ON status_events;
CREATE POLICY status_events_no_delete ON status_events
  FOR DELETE
  USING (false);

-- UNIT_ESCALATIONS: Read-only for users, system can manage
DROP POLICY IF EXISTS unit_escalations_select_policy ON unit_escalations;
CREATE POLICY unit_escalations_select_policy ON unit_escalations
  FOR SELECT
  USING (
    can_read_program((
      SELECT program_id FROM workstreams w
      JOIN units u ON u.workstream_id = w.id
      WHERE u.id = unit_id
    ))
  );

DROP POLICY IF EXISTS unit_escalations_manage_policy ON unit_escalations;
CREATE POLICY unit_escalations_manage_policy ON unit_escalations
  FOR ALL
  USING (is_platform_admin());

-- PROGRAM_MEMBERS: Program owners and platform admins can manage
DROP POLICY IF EXISTS program_members_select_policy ON program_members;
CREATE POLICY program_members_select_policy ON program_members
  FOR SELECT
  USING (can_read_program(program_id));

DROP POLICY IF EXISTS program_members_manage_policy ON program_members;
CREATE POLICY program_members_manage_policy ON program_members
  FOR ALL
  USING (can_manage_program(program_id) OR is_platform_admin());

-- WORKSTREAM_MEMBERS: Workstream leads and above can manage
DROP POLICY IF EXISTS workstream_members_select_policy ON workstream_members;
CREATE POLICY workstream_members_select_policy ON workstream_members
  FOR SELECT
  USING (
    can_read_program((SELECT program_id FROM workstreams WHERE id = workstream_id))
  );

DROP POLICY IF EXISTS workstream_members_manage_policy ON workstream_members;
CREATE POLICY workstream_members_manage_policy ON workstream_members
  FOR ALL
  USING (can_manage_workstream(workstream_id) OR is_platform_admin());

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

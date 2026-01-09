-- ============================================================================
-- CRITICAL FIX: Schema Consolidation - MUST RUN BEFORE PRODUCTION
-- Migration: 20260109_CRITICAL_schema_consolidation.sql
-- Date: 2026-01-09
--
-- CRITICAL ISSUE: Dual organization table schema causing data integrity issues
--
-- PROBLEM:
-- 1. TWO organization tables exist: "orgs" (text ID) and "organizations" (UUID)
-- 2. profiles table has BOTH org_id (text) and organization_id (uuid)
-- 3. programs table has BOTH org_id (text) and client_organization_id (uuid)
-- 4. Frontend uses org_id, Admin API uses organization_id
-- 5. RLS policies reference organization_id but data may be in org_id
--
-- SOLUTION: Consolidate to single "organizations" table (UUID)
-- ============================================================================

-- Step 1: Ensure organizations table has all necessary columns
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS client_code text UNIQUE;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS industry text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS contact_email text;

-- Step 2: Migrate data from orgs to organizations (if orgs has data)
-- This ensures no data loss
DO $$
DECLARE
  v_org RECORD;
  v_new_uuid uuid;
BEGIN
  FOR v_org IN SELECT * FROM orgs WHERE id NOT IN (SELECT name FROM organizations)
  LOOP
    -- Create new UUID-based organization
    INSERT INTO organizations (name, client_code)
    VALUES (v_org.id, v_org.id)
    RETURNING id INTO v_new_uuid;

    -- Update profiles to use new organization_id
    UPDATE profiles
    SET organization_id = v_new_uuid
    WHERE org_id = v_org.id AND organization_id IS NULL;

    -- Update programs to use new client_organization_id
    UPDATE programs
    SET client_organization_id = v_new_uuid
    WHERE org_id = v_org.id AND client_organization_id IS NULL;

    RAISE NOTICE 'Migrated org % to organization %', v_org.id, v_new_uuid;
  END LOOP;
END $$;

-- Step 3: Make organization_id NOT NULL in profiles (after migration)
-- First, set organization_id from org_id where NULL
UPDATE profiles
SET organization_id = (
  SELECT id FROM organizations WHERE name = profiles.org_id
)
WHERE organization_id IS NULL AND org_id IS NOT NULL;

-- Step 4: For profiles still without organization_id, use Platform Admin org
DO $$
DECLARE
  v_platform_admin_org_id uuid;
BEGIN
  -- Get or create Platform Admin Organization
  SELECT id INTO v_platform_admin_org_id
  FROM organizations
  WHERE name = 'Platform Admin Organization'
  LIMIT 1;

  IF v_platform_admin_org_id IS NULL THEN
    INSERT INTO organizations (name, client_code)
    VALUES ('Platform Admin Organization', 'PLATFORM')
    RETURNING id INTO v_platform_admin_org_id;
  END IF;

  -- Assign to profiles without organization
  UPDATE profiles
  SET organization_id = v_platform_admin_org_id
  WHERE organization_id IS NULL;

  RAISE NOTICE 'Assigned remaining profiles to Platform Admin org: %', v_platform_admin_org_id;
END $$;

-- Step 5: Make organization_id mandatory
ALTER TABLE profiles ALTER COLUMN organization_id SET NOT NULL;

-- Step 6: Drop old org_id column from profiles (after verification)
-- COMMENTED OUT FOR SAFETY - Uncomment after verifying migration in production
-- ALTER TABLE profiles DROP COLUMN IF EXISTS org_id;

-- Step 7: Update programs client_organization_id from org_id
UPDATE programs
SET client_organization_id = (
  SELECT id FROM organizations WHERE name = programs.org_id
)
WHERE client_organization_id IS NULL AND org_id IS NOT NULL;

-- Step 8: Drop old org_id column from programs (after verification)
-- COMMENTED OUT FOR SAFETY - Uncomment after verifying migration in production
-- ALTER TABLE programs DROP COLUMN IF EXISTS org_id;

-- Step 9: Update RLS policies to use correct column
-- Drop old policies that might reference org_id
DROP POLICY IF EXISTS "programs_select_by_org" ON programs;
DROP POLICY IF EXISTS "programs_access" ON programs;

-- Create consolidated RLS policy for programs
CREATE POLICY "programs_org_isolation" ON programs
  FOR SELECT
  USING (
    -- Platform admins see all programs
    (SELECT role FROM profiles WHERE user_id = auth.uid()) = 'PLATFORM_ADMIN'
    OR
    -- Users see only their organization's programs
    client_organization_id = (SELECT organization_id FROM profiles WHERE user_id = auth.uid())
    OR
    -- Programs with no client assignment (legacy)
    client_organization_id IS NULL
  );

-- Step 10: Verify migration success
DO $$
DECLARE
  v_profiles_without_org integer;
  v_orgs_count integer;
  v_organizations_count integer;
BEGIN
  SELECT COUNT(*) INTO v_profiles_without_org
  FROM profiles WHERE organization_id IS NULL;

  SELECT COUNT(*) INTO v_orgs_count FROM orgs;
  SELECT COUNT(*) INTO v_organizations_count FROM organizations;

  RAISE NOTICE '=== MIGRATION VERIFICATION ===';
  RAISE NOTICE 'Profiles without organization_id: %', v_profiles_without_org;
  RAISE NOTICE 'Legacy orgs table count: %', v_orgs_count;
  RAISE NOTICE 'New organizations table count: %', v_organizations_count;

  IF v_profiles_without_org > 0 THEN
    RAISE WARNING 'CRITICAL: % profiles still without organization_id!', v_profiles_without_org;
  ELSE
    RAISE NOTICE 'SUCCESS: All profiles have organization_id';
  END IF;
END $$;

-- Step 11: Create index for performance
CREATE INDEX IF NOT EXISTS idx_profiles_organization_id ON profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_programs_client_organization_id ON programs(client_organization_id);

COMMENT ON MIGRATION IS 'CRITICAL: Consolidates dual organization schema (orgs vs organizations) into single organizations table. Run before production launch.';

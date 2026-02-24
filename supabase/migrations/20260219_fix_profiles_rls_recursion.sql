-- Migration: Fix infinite recursion in profiles RLS policies
-- Date: 2026-02-19
--
-- PROBLEM: profiles_select_admin and profiles_select_same_org both query the
-- profiles table from WITHIN a policy ON profiles. This causes infinite
-- recursion → Postgres errors → profile lookup returns null → login stuck.
--
-- FIX: Use SECURITY DEFINER helper functions which bypass RLS, so the inner
-- SELECT on profiles does not re-trigger the same policy checks.

-- ============================================================================
-- Step 1: Create SECURITY DEFINER helper functions (bypass RLS safely)
-- ============================================================================

-- Drop existing versions first (CREATE OR REPLACE cannot change return type)
DROP FUNCTION IF EXISTS get_my_role();
DROP FUNCTION IF EXISTS get_my_org_id();

-- Returns the current authenticated user's role (without hitting RLS)
CREATE FUNCTION get_my_role()
RETURNS text AS $$
  SELECT role FROM profiles WHERE user_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Returns the current authenticated user's org_id (without hitting RLS)
-- Returns text to match however org_id is stored in profiles
CREATE FUNCTION get_my_org_id()
RETURNS text AS $$
  SELECT org_id::text FROM profiles WHERE user_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;


-- ============================================================================
-- Step 2: Replace recursive SELECT policies with non-recursive equivalents
-- ============================================================================

-- Drop the recursive versions
DROP POLICY IF EXISTS profiles_select_admin ON profiles;
DROP POLICY IF EXISTS profiles_select_same_org ON profiles;

-- Replace with SECURITY DEFINER function versions (no recursion)
CREATE POLICY profiles_select_admin ON profiles
  FOR SELECT
  USING (get_my_role() = 'PLATFORM_ADMIN');

CREATE POLICY profiles_select_same_org ON profiles
  FOR SELECT
  USING (org_id::text = get_my_org_id());


-- ============================================================================
-- Step 3: Fix the INSERT policy recursion (same pattern)
-- ============================================================================

DROP POLICY IF EXISTS profiles_insert_admin ON profiles;
CREATE POLICY profiles_insert_admin ON profiles
  FOR INSERT
  WITH CHECK (
    get_my_role() = 'PLATFORM_ADMIN'
    OR auth.uid() = user_id  -- Allow self-registration
  );


-- ============================================================================
-- Step 4: Fix the DELETE policy recursion
-- ============================================================================

DROP POLICY IF EXISTS profiles_delete_admin ON profiles;
CREATE POLICY profiles_delete_admin ON profiles
  FOR DELETE
  USING (get_my_role() = 'PLATFORM_ADMIN');


-- ============================================================================
-- Step 5: Fix other tables that have the same recursive pattern
-- ============================================================================

-- alert_thresholds
DROP POLICY IF EXISTS "Admins manage thresholds" ON alert_thresholds;
CREATE POLICY "Admins manage thresholds" ON alert_thresholds
  FOR ALL
  USING (get_my_role() = 'PLATFORM_ADMIN')
  WITH CHECK (get_my_role() = 'PLATFORM_ADMIN');

-- escalation_notifications
DROP POLICY IF EXISTS "escalation_notifications_insert" ON escalation_notifications;
CREATE POLICY "escalation_notifications_insert" ON escalation_notifications
  FOR INSERT
  WITH CHECK (get_my_role() = 'PLATFORM_ADMIN');

DROP POLICY IF EXISTS "escalation_notifications_delete_admin" ON escalation_notifications;
CREATE POLICY "escalation_notifications_delete_admin" ON escalation_notifications
  FOR DELETE
  USING (get_my_role() = 'PLATFORM_ADMIN');

-- escalation_attention_log
DROP POLICY IF EXISTS "escalation_attention_delete_admin" ON escalation_attention_log;
CREATE POLICY "escalation_attention_delete_admin" ON escalation_attention_log
  FOR DELETE
  USING (get_my_role() = 'PLATFORM_ADMIN');

-- organizations
DROP POLICY IF EXISTS "organizations_insert_admin" ON organizations;
CREATE POLICY "organizations_insert_admin" ON organizations
  FOR INSERT
  WITH CHECK (get_my_role() = 'PLATFORM_ADMIN');

DROP POLICY IF EXISTS "organizations_update_admin" ON organizations;
CREATE POLICY "organizations_update_admin" ON organizations
  FOR UPDATE
  USING (get_my_role() = 'PLATFORM_ADMIN')
  WITH CHECK (get_my_role() = 'PLATFORM_ADMIN');

DROP POLICY IF EXISTS "organizations_delete_admin" ON organizations;
CREATE POLICY "organizations_delete_admin" ON organizations
  FOR DELETE
  USING (get_my_role() = 'PLATFORM_ADMIN');

-- unit_status_events
DROP POLICY IF EXISTS "unit_status_events_select" ON unit_status_events;
CREATE POLICY "unit_status_events_select" ON unit_status_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM units u
      JOIN workstreams w ON u.workstream_id = w.id
      JOIN programs p ON w.program_id = p.id
      WHERE u.id = unit_status_events.unit_id
      AND (
        p.org_id::text = get_my_org_id()
        OR get_my_role() = 'PLATFORM_ADMIN'
      )
    )
  );


-- ============================================================================
-- Verification
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== Profiles RLS Recursion Fix Applied ===';
  RAISE NOTICE '';
  RAISE NOTICE 'Created SECURITY DEFINER functions: get_my_role(), get_my_org_id()';
  RAISE NOTICE 'Replaced all recursive profile policies with non-recursive equivalents';
  RAISE NOTICE 'Login flow should now work correctly.';
END $$;

-- Fix Profiles RLS Policy - Remove Circular Dependency
-- Migration: 20260106_fix_profiles_rls_v2.sql
-- Issue: Infinite recursion in policy - is_platform_admin() queries profiles table

-- Drop existing policy
DROP POLICY IF EXISTS profiles_select_policy ON profiles;

-- Create simple policy WITHOUT function calls to avoid recursion
-- Users can ONLY read their own profile OR profiles in same org (after they've read their own)
CREATE POLICY profiles_select_policy ON profiles
  FOR SELECT
  USING (
    user_id = auth.uid()  -- Can always read own profile (no recursion)
  );

-- Separate policy for reading other profiles in org (requires already having read own profile)
DROP POLICY IF EXISTS profiles_select_org_policy ON profiles;
CREATE POLICY profiles_select_org_policy ON profiles
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM profiles WHERE user_id = auth.uid()
    )
  );

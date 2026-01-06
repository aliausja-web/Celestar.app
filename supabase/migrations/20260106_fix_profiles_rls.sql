-- Fix Profiles RLS Policy - Allow Users to Read Their Own Profile
-- Migration: 20260106_fix_profiles_rls.sql
-- Issue: Circular dependency prevented users from reading their own profile

-- Drop existing policy
DROP POLICY IF EXISTS profiles_select_policy ON profiles;

-- Create new policy that allows:
-- 1. Users can ALWAYS read their own profile (user_id = auth.uid())
-- 2. Platform admins can read all profiles
-- 3. Users can read other profiles in their org
CREATE POLICY profiles_select_policy ON profiles
  FOR SELECT
  USING (
    user_id = auth.uid() OR  -- Can always read own profile
    is_platform_admin() OR   -- Platform admins see all
    org_id IN (SELECT org_id FROM profiles WHERE user_id = auth.uid())  -- Same org
  );

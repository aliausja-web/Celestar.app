-- Test Profile Access
-- This query tests if the profiles RLS policy is working correctly

-- First, let's see the current policy
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'profiles';

-- Try to select from profiles (this should work if RLS is correct)
-- Run this while logged in as one of your test users
SELECT * FROM profiles WHERE user_id = auth.uid();

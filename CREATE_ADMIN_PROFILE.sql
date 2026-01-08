-- ============================================================================
-- FIX: Create Admin Profile for Existing Auth User
-- ============================================================================
-- This script fixes the "Account setup incomplete" error by creating
-- a profile record for an authenticated user who doesn't have one yet.
--
-- INSTRUCTIONS:
-- 1. Go to Supabase Dashboard > SQL Editor
-- 2. Find your admin email and user_id (see Step 1 below)
-- 3. Update Step 2 with your actual user_id and email
-- 4. Run this entire script
-- ============================================================================

-- STEP 1: Find your authenticated user info
-- This will show all auth users and whether they have profiles
SELECT
  au.id as user_id,
  au.email,
  au.created_at as auth_created,
  CASE
    WHEN p.user_id IS NOT NULL THEN '✅ Has Profile'
    ELSE '❌ MISSING PROFILE'
  END as profile_status,
  p.role
FROM auth.users au
LEFT JOIN profiles p ON au.id = p.user_id
ORDER BY au.created_at DESC;

-- Look for your email in the results above
-- Copy the user_id (UUID) for the next step

-- ============================================================================

-- STEP 2: Create the admin profile
-- ⚠️ IMPORTANT: Replace 'YOUR_USER_ID_HERE' and 'your-email@example.com' with actual values

-- Uncomment and run this INSERT after replacing the values:

/*
INSERT INTO profiles (user_id, email, full_name, role, organization_id)
SELECT
  'YOUR_USER_ID_HERE'::uuid,  -- ⚠️ REPLACE WITH YOUR USER_ID FROM STEP 1
  'your-email@example.com',    -- ⚠️ REPLACE WITH YOUR EMAIL
  'Platform Admin',             -- You can change this to your name
  'PLATFORM_ADMIN',             -- This gives you full access
  (SELECT id FROM organizations WHERE name = 'Platform Admin Organization' LIMIT 1)
ON CONFLICT (user_id) DO UPDATE
SET
  email = EXCLUDED.email,
  role = EXCLUDED.role,
  organization_id = EXCLUDED.organization_id;
*/

-- ============================================================================

-- STEP 3: Verify the profile was created successfully
-- Run this after Step 2 to confirm

/*
SELECT
  user_id,
  email,
  full_name,
  role,
  organization_id,
  created_at
FROM profiles
WHERE email = 'your-email@example.com';  -- ⚠️ REPLACE WITH YOUR EMAIL
*/

-- ============================================================================
-- If successful, you should see your profile with role = 'PLATFORM_ADMIN'
-- Now try logging in again - the error should be gone!
-- ============================================================================

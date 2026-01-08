-- This SQL script will help fix the "account setup incomplete" error
-- Run this in Supabase SQL Editor

-- Step 1: Check which users exist in auth but don't have profiles
SELECT
  au.id as auth_user_id,
  au.email,
  p.user_id as profile_user_id,
  p.role
FROM auth.users au
LEFT JOIN profiles p ON au.id = p.user_id
WHERE p.user_id IS NULL;

-- Step 2: If your admin email is missing a profile, create it
-- REPLACE 'your-admin-email@example.com' with your actual admin email

-- First, get your user_id from auth
-- SELECT id FROM auth.users WHERE email = 'your-admin-email@example.com';

-- Then create the profile (replace USER_ID_HERE with the actual UUID from above)
/*
INSERT INTO profiles (user_id, email, full_name, role, organization_id)
VALUES (
  'USER_ID_HERE',  -- Replace with your actual user_id from auth.users
  'your-admin-email@example.com',  -- Your email
  'Admin User',  -- Your name
  'PLATFORM_ADMIN',  -- Role
  (SELECT id FROM organizations WHERE name = 'Platform Admin Organization' LIMIT 1)  -- Platform admin org
);
*/

-- Step 3: Verify the profile was created
-- SELECT * FROM profiles WHERE email = 'your-admin-email@example.com';

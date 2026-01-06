/*
  # Sync auth.users to profiles table

  1. Purpose
    - Ensure all users in auth.users have corresponding profiles
    - Assign PLATFORM_ADMIN role to admin@celestar.com
    - Assign appropriate roles to other existing users

  2. Changes
    - Insert missing profiles for any auth users
    - Update admin user to PLATFORM_ADMIN role
*/

-- First, let's see what we have (this won't modify anything)
DO $$
BEGIN
  RAISE NOTICE 'Checking for users without profiles...';
END $$;

-- Insert profiles for any auth users that don't have profiles yet
INSERT INTO profiles (user_id, email, role, org_id, full_name, created_at, updated_at)
SELECT
  au.id as user_id,
  au.email,
  CASE
    WHEN au.email = 'admin@celestar.com' THEN 'PLATFORM_ADMIN'::text
    WHEN au.email = 'program.owner@celestar.com' THEN 'PROGRAM_OWNER'::text
    WHEN au.email = 'workstream.lead@celestar.com' THEN 'WORKSTREAM_LEAD'::text
    WHEN au.email = 'field@celestar.com' THEN 'FIELD_CONTRIBUTOR'::text
    WHEN au.email = 'client@celestar.com' THEN 'CLIENT_VIEWER'::text
    ELSE 'CLIENT_VIEWER'::text  -- Default role for any other users
  END as role,
  'org_celestar' as org_id,
  CASE
    WHEN au.email = 'admin@celestar.com' THEN 'Platform Administrator'
    WHEN au.email = 'program.owner@celestar.com' THEN 'Program Owner'
    WHEN au.email = 'workstream.lead@celestar.com' THEN 'Workstream Lead'
    WHEN au.email = 'field@celestar.com' THEN 'Field Contributor'
    WHEN au.email = 'client@celestar.com' THEN 'Client Viewer'
    ELSE COALESCE(au.raw_user_meta_data->>'full_name', split_part(au.email, '@', 1))
  END as full_name,
  au.created_at,
  NOW() as updated_at
FROM auth.users au
LEFT JOIN profiles p ON p.user_id = au.id
WHERE p.user_id IS NULL;  -- Only insert if profile doesn't exist

-- Update any existing profiles to ensure correct roles
UPDATE profiles
SET
  role = CASE
    WHEN email = 'admin@celestar.com' THEN 'PLATFORM_ADMIN'
    WHEN email = 'program.owner@celestar.com' THEN 'PROGRAM_OWNER'
    WHEN email = 'workstream.lead@celestar.com' THEN 'WORKSTREAM_LEAD'
    WHEN email = 'field@celestar.com' THEN 'FIELD_CONTRIBUTOR'
    WHEN email = 'client@celestar.com' THEN 'CLIENT_VIEWER'
    ELSE role  -- Keep existing role for other users
  END,
  org_id = COALESCE(org_id, 'org_celestar'),  -- Ensure org_id is set
  updated_at = NOW()
WHERE email IN (
  'admin@celestar.com',
  'program.owner@celestar.com',
  'workstream.lead@celestar.com',
  'field@celestar.com',
  'client@celestar.com'
);

-- Verify the results
DO $$
DECLARE
  profile_count INTEGER;
  auth_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO profile_count FROM profiles;
  SELECT COUNT(*) INTO auth_count FROM auth.users;

  RAISE NOTICE 'Migration complete!';
  RAISE NOTICE 'Auth users: %, Profiles: %', auth_count, profile_count;

  IF profile_count < auth_count THEN
    RAISE WARNING 'Some users still missing profiles! Please investigate.';
  END IF;
END $$;

-- Display all profiles for verification
SELECT
  user_id,
  email,
  role,
  org_id,
  full_name,
  created_at
FROM profiles
ORDER BY
  CASE role
    WHEN 'PLATFORM_ADMIN' THEN 1
    WHEN 'PROGRAM_OWNER' THEN 2
    WHEN 'WORKSTREAM_LEAD' THEN 3
    WHEN 'FIELD_CONTRIBUTOR' THEN 4
    WHEN 'CLIENT_VIEWER' THEN 5
  END;

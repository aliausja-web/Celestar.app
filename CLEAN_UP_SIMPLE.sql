-- ============================================================================
-- PRODUCTION CLEANUP: Safe Version with Foreign Key Handling
-- ============================================================================
-- Run this entire script in Supabase SQL Editor
-- ============================================================================

-- Step 1: Delete all test escalation notifications (no dependencies)
DELETE FROM escalation_notifications;

-- Step 2: Delete all test escalations (no dependencies)
DELETE FROM unit_escalations;

-- Step 3: Delete unit proofs entirely (they have NOT NULL constraints on user references)
DELETE FROM unit_proofs;

-- Step 4: Find the admin user_id that we want to keep
DO $$
DECLARE
  v_admin_user_id uuid;
BEGIN
  -- Find the user_id for aliausja@gmail.com
  SELECT user_id INTO v_admin_user_id
  FROM profiles
  WHERE email = 'aliausja@gmail.com'
  LIMIT 1;

  IF v_admin_user_id IS NULL THEN
    RAISE EXCEPTION 'Could not find aliausja@gmail.com in profiles table';
  END IF;

  -- Delete all profiles EXCEPT aliausja@gmail.com
  DELETE FROM profiles
  WHERE user_id != v_admin_user_id;

  -- Now we can safely delete auth.users EXCEPT aliausja@gmail.com
  -- (profiles that referenced them are already deleted)
  DELETE FROM auth.users
  WHERE id != v_admin_user_id;

  -- Ensure aliausja@gmail.com is PLATFORM_ADMIN
  UPDATE profiles
  SET role = 'PLATFORM_ADMIN',
      full_name = 'Platform Administrator',
      organization_id = NULL  -- Admin doesn't belong to any specific org
  WHERE user_id = v_admin_user_id;
END $$;

-- Step 5: Verify final state
SELECT
  'CLEANUP COMPLETE' as status,
  'Check results below' as message;

SELECT
  'profiles' as table_name,
  COUNT(*) as count
FROM profiles
UNION ALL
SELECT
  'auth.users',
  COUNT(*)
FROM auth.users
UNION ALL
SELECT
  'organizations',
  COUNT(*)
FROM organizations
UNION ALL
SELECT
  'programs',
  COUNT(*)
FROM programs
UNION ALL
SELECT
  'workstreams',
  COUNT(*)
FROM workstreams
UNION ALL
SELECT
  'units',
  COUNT(*)
FROM units
UNION ALL
SELECT
  'unit_proofs',
  COUNT(*)
FROM unit_proofs
UNION ALL
SELECT
  'escalation_notifications',
  COUNT(*)
FROM escalation_notifications
UNION ALL
SELECT
  'unit_escalations',
  COUNT(*)
FROM unit_escalations;

-- Show remaining admin user
SELECT
  'ADMIN USER' as info,
  email,
  role::text,
  full_name,
  organization_id
FROM profiles
WHERE email = 'aliausja@gmail.com';

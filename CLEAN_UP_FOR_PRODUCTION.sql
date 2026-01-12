-- ============================================================================
-- PRODUCTION CLEANUP: Remove Test Data and Consolidate Admin
-- ============================================================================
-- This script will:
-- 1. Delete all test escalations and notifications
-- 2. Keep only aliausja@gmail.com as PLATFORM_ADMIN
-- 3. Remove all other test users
-- 4. Keep client organizations (you can manually delete unwanted ones from portal)
-- 5. Keep programs and program data intact
-- ============================================================================

BEGIN;

-- Step 1: Delete all test escalation notifications
DELETE FROM escalation_notifications;
RAISE NOTICE '✅ Deleted all test escalation notifications';

-- Step 2: Delete all test escalations
DELETE FROM unit_escalations;
RAISE NOTICE '✅ Deleted all test escalations';

-- Step 3: Get the user_id for aliausja@gmail.com
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

  RAISE NOTICE 'Found admin user_id: %', v_admin_user_id;

  -- Delete all profiles EXCEPT aliausja@gmail.com
  DELETE FROM profiles
  WHERE user_id != v_admin_user_id;

  RAISE NOTICE '✅ Deleted all profiles except aliausja@gmail.com';

  -- Delete all auth.users EXCEPT aliausja@gmail.com
  -- Note: This requires the Supabase auth schema extension
  DELETE FROM auth.users
  WHERE id != v_admin_user_id;

  RAISE NOTICE '✅ Deleted all auth users except aliausja@gmail.com';

  -- Ensure aliausja@gmail.com is PLATFORM_ADMIN
  UPDATE profiles
  SET role = 'PLATFORM_ADMIN',
      full_name = 'Platform Administrator'
  WHERE user_id = v_admin_user_id;

  RAISE NOTICE '✅ Confirmed aliausja@gmail.com as PLATFORM_ADMIN';
END $$;

-- Step 4: Summary of remaining data
DO $$
DECLARE
  v_organizations_count integer;
  v_programs_count integer;
  v_workstreams_count integer;
  v_units_count integer;
  v_users_count integer;
BEGIN
  SELECT COUNT(*) INTO v_organizations_count FROM organizations;
  SELECT COUNT(*) INTO v_programs_count FROM programs;
  SELECT COUNT(*) INTO v_workstreams_count FROM workstreams;
  SELECT COUNT(*) INTO v_units_count FROM units;
  SELECT COUNT(*) INTO v_users_count FROM profiles;

  RAISE NOTICE '=== CLEANUP SUMMARY ===';
  RAISE NOTICE 'Organizations remaining: %', v_organizations_count;
  RAISE NOTICE 'Programs remaining: %', v_programs_count;
  RAISE NOTICE 'Workstreams remaining: %', v_workstreams_count;
  RAISE NOTICE 'Units remaining: %', v_units_count;
  RAISE NOTICE 'Users remaining: %', v_users_count;
  RAISE NOTICE '';
  RAISE NOTICE '✅ Database cleaned and ready for production';
  RAISE NOTICE '✅ Admin login: aliausja@gmail.com';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Login to admin portal at /admin';
  RAISE NOTICE '2. Review and delete any test organizations from the portal';
  RAISE NOTICE '3. Create real client organizations';
  RAISE NOTICE '4. Create users and assign to clients';
  RAISE NOTICE '5. Test the complete workflow end-to-end';
END $$;

COMMIT;

-- Verify final state
SELECT
  'profiles' as table_name,
  COUNT(*) as count,
  string_agg(email, ', ') as remaining_users
FROM profiles
UNION ALL
SELECT
  'organizations',
  COUNT(*),
  string_agg(name, ', ')
FROM organizations
UNION ALL
SELECT
  'programs',
  COUNT(*),
  string_agg(name, ', ')
FROM programs
UNION ALL
SELECT
  'escalation_notifications',
  COUNT(*),
  'all deleted'
FROM escalation_notifications;

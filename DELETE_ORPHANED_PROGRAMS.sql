-- ============================================================================
-- DELETE ORPHANED PROGRAMS - Clean Slate for Production
-- ============================================================================
-- Purpose: Remove the 2 orphaned programs that have no organization
-- This ensures a clean database state before creating proper test data
-- ============================================================================

-- Step 1: Delete all units (must delete first due to foreign keys)
DELETE FROM units;

-- Step 2: Delete all workstreams (must delete before programs)
DELETE FROM workstreams;

-- Step 3: Delete all programs
DELETE FROM programs;

-- Step 4: Verify clean state
SELECT 'FINAL STATE' as status;

SELECT
  'organizations' as table_name,
  COUNT(*) as count
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
  'profiles',
  COUNT(*)
FROM profiles;

-- Show remaining admin user
SELECT
  'ADMIN USER' as info,
  email,
  role::text,
  full_name,
  organization_id
FROM profiles
WHERE email = 'aliausja@gmail.com';

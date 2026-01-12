-- ============================================================================
-- DIAGNOSTIC: Check Programs Count Issue
-- ============================================================================

-- Check all programs in database
SELECT
  'ALL PROGRAMS' as check_type,
  COUNT(*) as count
FROM programs;

-- Show all programs with details
SELECT
  'PROGRAM DETAILS' as info,
  id,
  name,
  organization_id,
  created_at
FROM programs
ORDER BY created_at DESC;

-- Check if programs have organization_id
SELECT
  'PROGRAMS WITHOUT ORG' as check_type,
  COUNT(*) as count
FROM programs
WHERE organization_id IS NULL;

-- Check organizations
SELECT
  'ORGANIZATIONS' as check_type,
  COUNT(*) as count
FROM organizations;

-- Show all organizations
SELECT
  'ORG DETAILS' as info,
  id,
  name,
  created_at
FROM organizations
ORDER BY created_at DESC;

-- Check if there's an RLS issue - what does service role see?
SELECT
  'SERVICE ROLE VIEW' as check_type,
  p.id,
  p.name,
  p.organization_id,
  o.name as org_name
FROM programs p
LEFT JOIN organizations o ON p.organization_id = o.id
ORDER BY p.created_at DESC;

-- Check profiles/users count
SELECT
  'PROFILES COUNT' as check_type,
  COUNT(*) as count
FROM profiles;

-- Show all profiles
SELECT
  'PROFILE DETAILS' as info,
  user_id,
  email,
  role::text,
  organization_id,
  full_name
FROM profiles
ORDER BY created_at DESC;

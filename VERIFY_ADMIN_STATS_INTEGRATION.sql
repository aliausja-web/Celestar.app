-- ============================================================================
-- VERIFY ADMIN DASHBOARD STATS INTEGRATION
-- ============================================================================
-- Purpose: Verify that the admin stats API can accurately query all tables
-- This ensures the admin dashboard shows real-time accurate data
-- ============================================================================

-- 1. ORGANIZATIONS COUNT
SELECT 'ORGANIZATIONS' as metric, COUNT(*) as actual_count
FROM organizations;

-- 2. PROFILES/USERS COUNT
SELECT 'USERS' as metric, COUNT(*) as actual_count
FROM profiles;

-- 3. PROGRAMS COUNT
SELECT 'PROGRAMS' as metric, COUNT(*) as actual_count
FROM programs;

-- 4. PENDING NOTIFICATIONS COUNT
SELECT 'PENDING_NOTIFICATIONS' as metric, COUNT(*) as actual_count
FROM escalation_notifications
WHERE status = 'pending';

-- 5. DETAILED BREAKDOWN
SELECT
  '=== CURRENT DATABASE STATE ===' as section;

-- Show all organizations
SELECT
  'ORGANIZATIONS:' as type,
  id,
  name,
  created_at
FROM organizations
ORDER BY created_at DESC;

-- Show all programs
SELECT
  'PROGRAMS:' as type,
  p.id,
  p.name,
  p.organization_id,
  o.name as organization_name,
  p.created_at
FROM programs p
LEFT JOIN organizations o ON p.organization_id = o.id
ORDER BY p.created_at DESC;

-- Show all users/profiles
SELECT
  'USERS:' as type,
  user_id,
  email,
  role::text,
  full_name,
  organization_id,
  created_at
FROM profiles
ORDER BY created_at DESC;

-- Show all escalation notifications
SELECT
  'NOTIFICATIONS:' as type,
  id,
  status,
  recipient_email,
  created_at,
  sent_at
FROM escalation_notifications
ORDER BY created_at DESC;

-- 6. CHECK RLS POLICIES (ensure service role can access everything)
SELECT
  '=== RLS POLICIES CHECK ===' as section;

SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('organizations', 'profiles', 'programs', 'escalation_notifications')
ORDER BY tablename, policyname;

-- 7. VERIFY SERVICE ROLE ACCESS
-- This simulates what the API should see
SELECT '=== WHAT API SHOULD SEE ===' as section;

SELECT
  (SELECT COUNT(*) FROM organizations) as organizations_count,
  (SELECT COUNT(*) FROM profiles) as users_count,
  (SELECT COUNT(*) FROM programs) as programs_count,
  (SELECT COUNT(*) FROM escalation_notifications WHERE status = 'pending') as pending_notifications_count;

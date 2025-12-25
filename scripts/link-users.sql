-- =====================================================
-- Step 2: Link Auth Users to Roles
-- =====================================================
-- IMPORTANT: First create the 3 users in Supabase Dashboard:
-- 1. Go to Authentication → Users → Add User
-- 2. Create: admin@celestar.com, supervisor@celestar.com, client@celestar.com
-- 3. Set password: password123 for each
-- 4. Check "Auto Confirm User" for each
--
-- Then run this script to link them to roles:
-- =====================================================

-- First, view the created users to get their UIDs
SELECT id, email, created_at
FROM auth.users
WHERE email IN ('admin@celestar.com', 'supervisor@celestar.com', 'client@celestar.com')
ORDER BY email;

-- =====================================================
-- After you see the UIDs above, run this part:
-- =====================================================

-- Link admin user
INSERT INTO public.users (uid, email, role, org_id)
SELECT
  id,
  'admin@celestar.com',
  'admin',
  'celestar'
FROM auth.users
WHERE email = 'admin@celestar.com'
ON CONFLICT (uid) DO UPDATE
SET role = 'admin', org_id = 'celestar';

-- Link supervisor user
INSERT INTO public.users (uid, email, role, org_id)
SELECT
  id,
  'supervisor@celestar.com',
  'supervisor',
  'celestar'
FROM auth.users
WHERE email = 'supervisor@celestar.com'
ON CONFLICT (uid) DO UPDATE
SET role = 'supervisor', org_id = 'celestar';

-- Link client user
INSERT INTO public.users (uid, email, role, org_id)
SELECT
  id,
  'client@celestar.com',
  'client',
  'celestar'
FROM auth.users
WHERE email = 'client@celestar.com'
ON CONFLICT (uid) DO UPDATE
SET role = 'client', org_id = 'celestar';

-- Verify the users are linked correctly
SELECT
  u.email,
  pu.role,
  pu.org_id,
  u.email_confirmed_at IS NOT NULL as confirmed
FROM auth.users u
JOIN public.users pu ON u.id = pu.uid
WHERE u.email IN ('admin@celestar.com', 'supervisor@celestar.com', 'client@celestar.com')
ORDER BY pu.role;

-- Fix admin profile issue
-- Run this in your Supabase SQL Editor

-- First, check if profile exists
SELECT user_id, email, role, org_id, full_name
FROM profiles
WHERE email = 'admin@celestar.com';

-- If the above returns nothing, get the auth user ID:
SELECT id as user_id, email, created_at
FROM auth.users
WHERE email = 'admin@celestar.com';

-- Then insert the profile (replace USER_ID_FROM_ABOVE with actual ID):
-- INSERT INTO profiles (user_id, email, role, org_id, full_name)
-- VALUES (
--   'USER_ID_FROM_ABOVE',
--   'admin@celestar.com',
--   'PLATFORM_ADMIN',
--   'org_celestar',
--   'Platform Administrator'
-- );

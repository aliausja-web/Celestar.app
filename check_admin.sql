-- Check admin user in profiles
SELECT user_id, email, role, org_id, full_name 
FROM profiles 
WHERE email = 'admin@celestar.com';

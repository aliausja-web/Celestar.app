-- Verify All User Roles
-- Check that all 5 test users have correct roles assigned

SELECT
  email,
  role,
  org_id,
  full_name,
  user_id
FROM profiles
ORDER BY
  CASE role
    WHEN 'PLATFORM_ADMIN' THEN 1
    WHEN 'PROGRAM_OWNER' THEN 2
    WHEN 'WORKSTREAM_LEAD' THEN 3
    WHEN 'FIELD_CONTRIBUTOR' THEN 4
    WHEN 'CLIENT_VIEWER' THEN 5
  END;

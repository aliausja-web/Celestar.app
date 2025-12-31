/*
  # Link Demo Auth Users

  1. Updates
    - Clear old placeholder user records
    - Insert proper user records linked to auth accounts
  
  2. Changes
    - Remove old placeholder users
    - Add admin@celestar.com linked to auth
    - Add supervisor@celestar.com linked to auth  
    - Add client@celestar.com linked to auth
*/

-- Delete old placeholder users
DELETE FROM users WHERE email IN ('your-admin-email@gmail.com', 'your-supervisor-email@gmail.com', 'your-client-email@gmail.com');

-- Insert/update demo users with correct auth UIDs
INSERT INTO users (uid, email, role, org_id)
VALUES 
  ('ac3f2433-a038-48f5-94f8-c0ef4edb13c8', 'admin@celestar.com', 'admin', 'org_001'),
  ('328e9593-4fa5-4ad8-a703-f7bced29d1d4', 'supervisor@celestar.com', 'supervisor', 'org_001'),
  ('c91bb73e-6742-4a4e-beec-97a0b7998a32', 'client@celestar.com', 'client', 'org_001')
ON CONFLICT (uid) 
DO UPDATE SET 
  email = EXCLUDED.email,
  role = EXCLUDED.role,
  org_id = EXCLUDED.org_id;

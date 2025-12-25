/*
  # Insert admin user record

  1. Changes
    - Add user record for aliausja@gmail.com as admin
  
  2. Security
    - Using migration to bypass RLS for initial setup
*/

INSERT INTO users (uid, email, role, org_id)
VALUES ('1340b45a-0e33-4ed7-81ff-f7ebb40d969c', 'aliausja@gmail.com', 'admin', 'celestar')
ON CONFLICT (uid) DO UPDATE 
SET role = EXCLUDED.role, org_id = EXCLUDED.org_id;

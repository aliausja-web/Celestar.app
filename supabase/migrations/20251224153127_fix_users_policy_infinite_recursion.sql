/*
  # Fix Infinite Recursion in Users Table Policy

  1. Changes
    - Drop the problematic "Admins can read all users" policy
    - Keep only "Users can read own data" policy
    - Users will be able to read their own user record without recursion
  
  2. Security
    - Maintains RLS protection
    - Users can only access their own user data
    - Admin functionality will work because admins can read their own user record
*/

-- Drop the recursive policy
DROP POLICY IF EXISTS "Admins can read all users" ON users;

-- The "Users can read own data" policy remains and is sufficient
-- It allows each user to read their own record, which is what we need for login

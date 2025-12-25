/*
  # Add INSERT policy for users table

  1. Changes
    - Add policy to allow authenticated users to insert their own user record
    - This is needed for the signup flow
  
  2. Security
    - Users can only insert a record with their own uid
*/

CREATE POLICY "Users can insert own data"
  ON users
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = uid::text);

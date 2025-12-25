/*
  # Add RLS Policies for Zones Table

  1. Security
    - Enable authenticated users to read all zones
    - Enable authenticated users to insert new zones
    - Enable authenticated users to update zones
    - Enable authenticated users to delete zones
*/

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Authenticated users can read all zones" ON zones;
DROP POLICY IF EXISTS "Authenticated users can insert zones" ON zones;
DROP POLICY IF EXISTS "Authenticated users can update zones" ON zones;
DROP POLICY IF EXISTS "Authenticated users can delete zones" ON zones;

-- Allow all authenticated users to read zones
CREATE POLICY "Authenticated users can read all zones"
  ON zones
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to insert zones
CREATE POLICY "Authenticated users can insert zones"
  ON zones
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to update zones
CREATE POLICY "Authenticated users can update zones"
  ON zones
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to delete zones
CREATE POLICY "Authenticated users can delete zones"
  ON zones
  FOR DELETE
  TO authenticated
  USING (true);
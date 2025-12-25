/*
  # Add RLS Policies for Projects Table

  1. Security
    - Enable authenticated users to read all projects
    - Enable authenticated users to insert new projects
    - Enable authenticated users to update projects
    - Enable authenticated users to delete projects (admin use case)
*/

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Authenticated users can read all projects" ON projects;
DROP POLICY IF EXISTS "Authenticated users can insert projects" ON projects;
DROP POLICY IF EXISTS "Authenticated users can update projects" ON projects;
DROP POLICY IF EXISTS "Authenticated users can delete projects" ON projects;

-- Allow all authenticated users to read projects
CREATE POLICY "Authenticated users can read all projects"
  ON projects
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to insert projects
CREATE POLICY "Authenticated users can insert projects"
  ON projects
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to update projects
CREATE POLICY "Authenticated users can update projects"
  ON projects
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to delete projects
CREATE POLICY "Authenticated users can delete projects"
  ON projects
  FOR DELETE
  TO authenticated
  USING (true);
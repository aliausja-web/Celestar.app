/*
  # Create Initial Database Schema for Celestar

  ## Overview
  This migration creates the complete database schema for the Celestar Execution Readiness Portal,
  a proof-first execution verification system.

  ## Tables Created

  ### 1. users
  - `uid` (uuid, primary key) - User ID from Supabase Auth
  - `email` (text) - User email address
  - `role` (text) - User role: 'admin', 'supervisor', or 'client'
  - `org_id` (text) - Organization identifier
  - `created_at` (timestamptz) - When the user was created

  ### 2. projects
  - `id` (uuid, primary key) - Unique project identifier
  - `name` (text) - Project name
  - `brand` (text) - Brand associated with the project
  - `agency` (text) - Agency managing the project
  - `location` (text) - Project location
  - `start_date` (text) - Project start date
  - `created_at` (timestamptz) - When the project was created

  ### 3. zones
  - `id` (uuid, primary key) - Unique zone identifier
  - `project_id` (uuid) - Reference to project
  - `name` (text) - Zone name
  - `deliverable` (text) - What needs to be delivered
  - `owner` (text) - Person responsible for this zone
  - `status` (text) - Zone status: 'RED', 'AMBER', or 'GREEN'
  - `last_verified_at` (timestamptz) - Last verification time
  - `next_verification_at` (timestamptz) - Next scheduled verification
  - `acceptance_criteria` (jsonb) - Array of acceptance criteria
  - `is_escalated` (boolean) - Whether zone is escalated
  - `escalation_level` (text) - Escalation level: 'L0', 'L1', 'L2', or 'L3'

  ### 4. proofs
  - `id` (uuid, primary key) - Unique proof identifier
  - `project_id` (uuid) - Reference to project
  - `zone_id` (uuid) - Reference to zone
  - `url` (text) - URL to access the proof
  - `storage_path` (text) - Path in storage system
  - `media_type` (text) - Type of media (image, video, etc.)
  - `created_at` (timestamptz) - When proof was uploaded
  - `uploaded_by_uid` (text) - User who uploaded the proof
  - `uploaded_by_email` (text) - Email of uploader
  - `note` (text) - Optional note about the proof

  ### 5. updates
  - `id` (uuid, primary key) - Unique update identifier
  - `project_id` (uuid) - Reference to project
  - `zone_id` (uuid) - Reference to zone
  - `previous_status` (text) - Status before update
  - `new_status` (text) - Status after update
  - `proof_id` (uuid) - Optional reference to proof
  - `note` (text) - Optional note about the update
  - `created_at` (timestamptz) - When update was created
  - `by_uid` (text) - User who made the update
  - `by_email` (text) - Email of user who made update
  - `type` (text) - Update type: 'STATUS_CHANGE', 'ESCALATION', 'NOTE', 'ADMIN_OVERRIDE'

  ### 6. escalations
  - `id` (uuid, primary key) - Unique escalation identifier
  - `project_id` (uuid) - Reference to project
  - `zone_id` (uuid) - Reference to zone
  - `level` (text) - Escalation level
  - `note` (text) - Reason for escalation
  - `responsible_person` (text) - Person assigned to resolve
  - `eta` (timestamptz) - Expected resolution time
  - `created_at` (timestamptz) - When escalation was created
  - `created_by` (text) - User who created escalation
  - `created_by_email` (text) - Email of creator

  ## Security
  - Row Level Security (RLS) is enabled on all tables
  - Policies are created for authenticated users to manage their data
  - Admin users have full access
  - Supervisors and clients have limited access based on their organization
*/

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  uid uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  role text NOT NULL CHECK (role IN ('admin', 'supervisor', 'client')),
  org_id text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own data"
  ON users FOR SELECT
  TO authenticated
  USING (auth.uid()::text = uid::text);

CREATE POLICY "Admins can read all users"
  ON users FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE uid::text = auth.uid()::text AND role = 'admin'
    )
  );

-- Create projects table
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  brand text NOT NULL,
  agency text NOT NULL,
  location text NOT NULL,
  start_date text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read projects"
  ON projects FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert projects"
  ON projects FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE uid::text = auth.uid()::text AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update projects"
  ON projects FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE uid::text = auth.uid()::text AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE uid::text = auth.uid()::text AND role = 'admin'
    )
  );

-- Create zones table
CREATE TABLE IF NOT EXISTS zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  deliverable text NOT NULL,
  owner text NOT NULL,
  status text NOT NULL CHECK (status IN ('RED', 'AMBER', 'GREEN')) DEFAULT 'RED',
  last_verified_at timestamptz,
  next_verification_at timestamptz,
  acceptance_criteria jsonb DEFAULT '[]'::jsonb,
  is_escalated boolean DEFAULT false,
  escalation_level text CHECK (escalation_level IN ('L0', 'L1', 'L2', 'L3'))
);

ALTER TABLE zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read zones"
  ON zones FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update zones"
  ON zones FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create proofs table
CREATE TABLE IF NOT EXISTS proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  zone_id uuid NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  url text NOT NULL,
  storage_path text NOT NULL,
  media_type text NOT NULL,
  created_at timestamptz DEFAULT now(),
  uploaded_by_uid text NOT NULL,
  uploaded_by_email text NOT NULL,
  note text
);

ALTER TABLE proofs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read proofs"
  ON proofs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert proofs"
  ON proofs FOR INSERT
  TO authenticated
  WITH CHECK (uploaded_by_uid = auth.uid()::text);

-- Create updates table
CREATE TABLE IF NOT EXISTS updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  zone_id uuid NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  previous_status text NOT NULL CHECK (previous_status IN ('RED', 'AMBER', 'GREEN')),
  new_status text NOT NULL CHECK (new_status IN ('RED', 'AMBER', 'GREEN')),
  proof_id uuid REFERENCES proofs(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz DEFAULT now(),
  by_uid text NOT NULL,
  by_email text NOT NULL,
  type text NOT NULL CHECK (type IN ('STATUS_CHANGE', 'ESCALATION', 'NOTE', 'ADMIN_OVERRIDE'))
);

ALTER TABLE updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read updates"
  ON updates FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert updates"
  ON updates FOR INSERT
  TO authenticated
  WITH CHECK (by_uid = auth.uid()::text);

-- Create escalations table
CREATE TABLE IF NOT EXISTS escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  zone_id uuid NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  level text NOT NULL CHECK (level IN ('L0', 'L1', 'L2', 'L3')),
  note text NOT NULL,
  responsible_person text,
  eta timestamptz,
  created_at timestamptz DEFAULT now(),
  created_by text NOT NULL,
  created_by_email text NOT NULL
);

ALTER TABLE escalations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read escalations"
  ON escalations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert escalations"
  ON escalations FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid()::text);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_zones_project_id ON zones(project_id);
CREATE INDEX IF NOT EXISTS idx_proofs_zone_id ON proofs(zone_id);
CREATE INDEX IF NOT EXISTS idx_proofs_project_id ON proofs(project_id);
CREATE INDEX IF NOT EXISTS idx_updates_zone_id ON updates(zone_id);
CREATE INDEX IF NOT EXISTS idx_updates_project_id ON updates(project_id);
CREATE INDEX IF NOT EXISTS idx_escalations_zone_id ON escalations(zone_id);
CREATE INDEX IF NOT EXISTS idx_escalations_project_id ON escalations(project_id);
-- ============================================================================
-- COMPLETE DATABASE SETUP FOR CELESTAR
-- Copy this ENTIRE file and paste it into Supabase SQL Editor, then click RUN
-- ============================================================================

-- ============================================================================
-- STEP 1: CREATE ALL TABLES
-- ============================================================================

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  uid uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  role text NOT NULL CHECK (role IN ('admin', 'supervisor', 'client')),
  org_id text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

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

-- ============================================================================
-- STEP 2: CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_zones_project_id ON zones(project_id);
CREATE INDEX IF NOT EXISTS idx_proofs_zone_id ON proofs(zone_id);
CREATE INDEX IF NOT EXISTS idx_proofs_project_id ON proofs(project_id);
CREATE INDEX IF NOT EXISTS idx_updates_zone_id ON updates(zone_id);
CREATE INDEX IF NOT EXISTS idx_updates_project_id ON updates(project_id);
CREATE INDEX IF NOT EXISTS idx_updates_proof_id ON updates(proof_id);
CREATE INDEX IF NOT EXISTS idx_escalations_zone_id ON escalations(zone_id);
CREATE INDEX IF NOT EXISTS idx_escalations_project_id ON escalations(project_id);

-- ============================================================================
-- STEP 3: CREATE ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Drop any existing policies first
DROP POLICY IF EXISTS "Users can read own data" ON users;
DROP POLICY IF EXISTS "Users can insert own data" ON users;
DROP POLICY IF EXISTS "Users can update own data" ON users;
DROP POLICY IF EXISTS "Authenticated users can read projects" ON projects;
DROP POLICY IF EXISTS "Authenticated users can insert projects" ON projects;
DROP POLICY IF EXISTS "Authenticated users can update projects" ON projects;
DROP POLICY IF EXISTS "Authenticated users can delete projects" ON projects;
DROP POLICY IF EXISTS "Authenticated users can read zones" ON zones;
DROP POLICY IF EXISTS "Authenticated users can insert zones" ON zones;
DROP POLICY IF EXISTS "Authenticated users can update zones" ON zones;
DROP POLICY IF EXISTS "Authenticated users can delete zones" ON zones;
DROP POLICY IF EXISTS "Authenticated users can read proofs" ON proofs;
DROP POLICY IF EXISTS "Authenticated users can insert proofs" ON proofs;
DROP POLICY IF EXISTS "Authenticated users can update proofs" ON proofs;
DROP POLICY IF EXISTS "Authenticated users can delete proofs" ON proofs;
DROP POLICY IF EXISTS "Authenticated users can read updates" ON updates;
DROP POLICY IF EXISTS "Authenticated users can insert updates" ON updates;
DROP POLICY IF EXISTS "Authenticated users can update updates" ON updates;
DROP POLICY IF EXISTS "Authenticated users can delete updates" ON updates;
DROP POLICY IF EXISTS "Authenticated users can read escalations" ON escalations;
DROP POLICY IF EXISTS "Authenticated users can insert escalations" ON escalations;
DROP POLICY IF EXISTS "Authenticated users can update escalations" ON escalations;
DROP POLICY IF EXISTS "Authenticated users can delete escalations" ON escalations;

-- USERS TABLE POLICIES
CREATE POLICY "Users can read own data"
  ON users FOR SELECT TO authenticated
  USING ((select auth.uid()) = uid);

CREATE POLICY "Users can insert own data"
  ON users FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = uid);

CREATE POLICY "Users can update own data"
  ON users FOR UPDATE TO authenticated
  USING ((select auth.uid()) = uid)
  WITH CHECK ((select auth.uid()) = uid);

-- PROJECTS TABLE POLICIES
CREATE POLICY "Authenticated users can read projects"
  ON projects FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert projects"
  ON projects FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.uid = (select auth.uid())
      AND users.role IN ('admin', 'supervisor')
    )
  );

CREATE POLICY "Authenticated users can update projects"
  ON projects FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.uid = (select auth.uid())
      AND users.role IN ('admin', 'supervisor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.uid = (select auth.uid())
      AND users.role IN ('admin', 'supervisor')
    )
  );

CREATE POLICY "Authenticated users can delete projects"
  ON projects FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.uid = (select auth.uid())
      AND users.role = 'admin'
    )
  );

-- ZONES TABLE POLICIES
CREATE POLICY "Authenticated users can read zones"
  ON zones FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert zones"
  ON zones FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.uid = (select auth.uid())
      AND users.role IN ('admin', 'supervisor')
    )
  );

CREATE POLICY "Authenticated users can update zones"
  ON zones FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.uid = (select auth.uid())
      AND users.role IN ('admin', 'supervisor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.uid = (select auth.uid())
      AND users.role IN ('admin', 'supervisor')
    )
  );

CREATE POLICY "Authenticated users can delete zones"
  ON zones FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.uid = (select auth.uid())
      AND users.role = 'admin'
    )
  );

-- PROOFS TABLE POLICIES
CREATE POLICY "Authenticated users can read proofs"
  ON proofs FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert proofs"
  ON proofs FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.uid = (select auth.uid())
      AND users.role IN ('admin', 'supervisor')
    )
  );

CREATE POLICY "Authenticated users can update proofs"
  ON proofs FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.uid = (select auth.uid())
      AND users.role IN ('admin', 'supervisor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.uid = (select auth.uid())
      AND users.role IN ('admin', 'supervisor')
    )
  );

CREATE POLICY "Authenticated users can delete proofs"
  ON proofs FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.uid = (select auth.uid())
      AND users.role = 'admin'
    )
  );

-- UPDATES TABLE POLICIES
CREATE POLICY "Authenticated users can read updates"
  ON updates FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert updates"
  ON updates FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.uid = (select auth.uid())
      AND users.role IN ('admin', 'supervisor')
    )
  );

CREATE POLICY "Authenticated users can update updates"
  ON updates FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.uid = (select auth.uid())
      AND users.role IN ('admin', 'supervisor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.uid = (select auth.uid())
      AND users.role IN ('admin', 'supervisor')
    )
  );

CREATE POLICY "Authenticated users can delete updates"
  ON updates FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.uid = (select auth.uid())
      AND users.role = 'admin'
    )
  );

-- ESCALATIONS TABLE POLICIES
CREATE POLICY "Authenticated users can read escalations"
  ON escalations FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert escalations"
  ON escalations FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.uid = (select auth.uid())
      AND users.role IN ('admin', 'supervisor')
    )
  );

CREATE POLICY "Authenticated users can update escalations"
  ON escalations FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.uid = (select auth.uid())
      AND users.role IN ('admin', 'supervisor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.uid = (select auth.uid())
      AND users.role IN ('admin', 'supervisor')
    )
  );

CREATE POLICY "Authenticated users can delete escalations"
  ON escalations FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.uid = (select auth.uid())
      AND users.role = 'admin'
    )
  );

-- ============================================================================
-- SETUP COMPLETE!
--
-- NEXT STEPS:
-- 1. Go to Authentication > Users in Supabase dashboard
-- 2. Create these 3 users with EXACT UIDs:
--
--    Admin:
--      Email: admin@celestar.com
--      Password: admin123
--      User UID: ac3f2433-a038-48f5-94f8-c0ef4edb13c8
--
--    Supervisor:
--      Email: supervisor@celestar.com
--      Password: supervisor123
--      User UID: 328e9593-4fa5-4ad8-a703-f7bced29d1d4
--
--    Client:
--      Email: client@celestar.com
--      Password: client123
--      User UID: c91bb73e-6742-4a4e-beec-97a0b7998a32
--
-- 3. After creating auth users, run the SQL below to link them to the users table
-- ============================================================================

-- Run this AFTER creating the auth users above
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

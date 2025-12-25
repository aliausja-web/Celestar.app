/*
  # Fix Security and Performance Issues
  
  ## Changes Made:
  
  ### 1. Performance Improvements
  - Add missing index on `updates.proof_id` foreign key
  - Optimize all RLS policies to use `(select auth.uid())` instead of `auth.uid()`
    This prevents re-evaluation for each row, significantly improving query performance
  
  ### 2. Policy Consolidation
  - Remove all duplicate/overlapping policies
  - Consolidate into single, clear policies per action
  - Projects: Remove duplicate SELECT/INSERT/UPDATE policies
  - Zones: Remove duplicate SELECT policies
  
  ### 3. Security Notes
  - All RLS policies remain restrictive and secure
  - Auth checks are now more performant without compromising security
  - Admin/Supervisor restrictions remain in place for write operations
*/

-- ============================================================================
-- 1. Add missing index on updates.proof_id foreign key
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_updates_proof_id ON public.updates(proof_id);

-- ============================================================================
-- 2. Drop ALL existing policies to rebuild them properly
-- ============================================================================

-- Users table
DROP POLICY IF EXISTS "Users can read own data" ON public.users;
DROP POLICY IF EXISTS "Users can insert own data" ON public.users;
DROP POLICY IF EXISTS "Users can update own data" ON public.users;

-- Projects table
DROP POLICY IF EXISTS "Admins can insert projects" ON public.projects;
DROP POLICY IF EXISTS "Admins can update projects" ON public.projects;
DROP POLICY IF EXISTS "Authenticated users can insert projects" ON public.projects;
DROP POLICY IF EXISTS "Authenticated users can update projects" ON public.projects;
DROP POLICY IF EXISTS "Authenticated users can read projects" ON public.projects;
DROP POLICY IF EXISTS "Authenticated users can read all projects" ON public.projects;
DROP POLICY IF EXISTS "Authenticated users can delete projects" ON public.projects;

-- Zones table
DROP POLICY IF EXISTS "Authenticated users can read zones" ON public.zones;
DROP POLICY IF EXISTS "Authenticated users can read all zones" ON public.zones;
DROP POLICY IF EXISTS "Authenticated users can insert zones" ON public.zones;
DROP POLICY IF EXISTS "Authenticated users can update zones" ON public.zones;
DROP POLICY IF EXISTS "Authenticated users can delete zones" ON public.zones;

-- Proofs table
DROP POLICY IF EXISTS "Authenticated users can read proofs" ON public.proofs;
DROP POLICY IF EXISTS "Authenticated users can insert proofs" ON public.proofs;
DROP POLICY IF EXISTS "Authenticated users can update proofs" ON public.proofs;
DROP POLICY IF EXISTS "Authenticated users can delete proofs" ON public.proofs;

-- Updates table
DROP POLICY IF EXISTS "Authenticated users can read updates" ON public.updates;
DROP POLICY IF EXISTS "Authenticated users can insert updates" ON public.updates;
DROP POLICY IF EXISTS "Authenticated users can update updates" ON public.updates;
DROP POLICY IF EXISTS "Authenticated users can delete updates" ON public.updates;

-- Escalations table
DROP POLICY IF EXISTS "Authenticated users can read escalations" ON public.escalations;
DROP POLICY IF EXISTS "Authenticated users can insert escalations" ON public.escalations;
DROP POLICY IF EXISTS "Authenticated users can update escalations" ON public.escalations;
DROP POLICY IF EXISTS "Authenticated users can delete escalations" ON public.escalations;

-- ============================================================================
-- 3. Create optimized, consolidated policies
-- ============================================================================

-- USERS TABLE --
CREATE POLICY "Users can read own data"
  ON public.users
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = uid);

CREATE POLICY "Users can insert own data"
  ON public.users
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = uid);

CREATE POLICY "Users can update own data"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = uid)
  WITH CHECK ((select auth.uid()) = uid);

-- PROJECTS TABLE --
-- Single SELECT policy
CREATE POLICY "Authenticated users can read projects"
  ON public.projects
  FOR SELECT
  TO authenticated
  USING (true);

-- Single INSERT policy (admin/supervisor only)
CREATE POLICY "Authenticated users can insert projects"
  ON public.projects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.uid = (select auth.uid())
      AND users.role IN ('admin', 'supervisor')
    )
  );

-- Single UPDATE policy (admin/supervisor only)
CREATE POLICY "Authenticated users can update projects"
  ON public.projects
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.uid = (select auth.uid())
      AND users.role IN ('admin', 'supervisor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.uid = (select auth.uid())
      AND users.role IN ('admin', 'supervisor')
    )
  );

CREATE POLICY "Authenticated users can delete projects"
  ON public.projects
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.uid = (select auth.uid())
      AND users.role = 'admin'
    )
  );

-- ZONES TABLE --
-- Single SELECT policy
CREATE POLICY "Authenticated users can read zones"
  ON public.zones
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert zones"
  ON public.zones
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.uid = (select auth.uid())
      AND users.role IN ('admin', 'supervisor')
    )
  );

CREATE POLICY "Authenticated users can update zones"
  ON public.zones
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.uid = (select auth.uid())
      AND users.role IN ('admin', 'supervisor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.uid = (select auth.uid())
      AND users.role IN ('admin', 'supervisor')
    )
  );

CREATE POLICY "Authenticated users can delete zones"
  ON public.zones
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.uid = (select auth.uid())
      AND users.role = 'admin'
    )
  );

-- PROOFS TABLE --
CREATE POLICY "Authenticated users can read proofs"
  ON public.proofs
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert proofs"
  ON public.proofs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.uid = (select auth.uid())
      AND users.role IN ('admin', 'supervisor')
    )
  );

CREATE POLICY "Authenticated users can update proofs"
  ON public.proofs
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.uid = (select auth.uid())
      AND users.role IN ('admin', 'supervisor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.uid = (select auth.uid())
      AND users.role IN ('admin', 'supervisor')
    )
  );

CREATE POLICY "Authenticated users can delete proofs"
  ON public.proofs
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.uid = (select auth.uid())
      AND users.role = 'admin'
    )
  );

-- UPDATES TABLE --
CREATE POLICY "Authenticated users can read updates"
  ON public.updates
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert updates"
  ON public.updates
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.uid = (select auth.uid())
      AND users.role IN ('admin', 'supervisor')
    )
  );

CREATE POLICY "Authenticated users can update updates"
  ON public.updates
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.uid = (select auth.uid())
      AND users.role IN ('admin', 'supervisor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.uid = (select auth.uid())
      AND users.role IN ('admin', 'supervisor')
    )
  );

CREATE POLICY "Authenticated users can delete updates"
  ON public.updates
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.uid = (select auth.uid())
      AND users.role = 'admin'
    )
  );

-- ESCALATIONS TABLE --
CREATE POLICY "Authenticated users can read escalations"
  ON public.escalations
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert escalations"
  ON public.escalations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.uid = (select auth.uid())
      AND users.role IN ('admin', 'supervisor')
    )
  );

CREATE POLICY "Authenticated users can update escalations"
  ON public.escalations
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.uid = (select auth.uid())
      AND users.role IN ('admin', 'supervisor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.uid = (select auth.uid())
      AND users.role IN ('admin', 'supervisor')
    )
  );

CREATE POLICY "Authenticated users can delete escalations"
  ON public.escalations
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.uid = (select auth.uid())
      AND users.role = 'admin'
    )
  );
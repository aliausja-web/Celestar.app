/*
  # Add RLS Policies for Remaining Tables

  1. Security
    - Enable authenticated users to manage escalations, proofs, and updates
    - All authenticated users can read, insert, update, and delete records
*/

-- Escalations policies
DROP POLICY IF EXISTS "Authenticated users can read escalations" ON escalations;
DROP POLICY IF EXISTS "Authenticated users can insert escalations" ON escalations;
DROP POLICY IF EXISTS "Authenticated users can update escalations" ON escalations;
DROP POLICY IF EXISTS "Authenticated users can delete escalations" ON escalations;

CREATE POLICY "Authenticated users can read escalations"
  ON escalations FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert escalations"
  ON escalations FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update escalations"
  ON escalations FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete escalations"
  ON escalations FOR DELETE TO authenticated USING (true);

-- Proofs policies
DROP POLICY IF EXISTS "Authenticated users can read proofs" ON proofs;
DROP POLICY IF EXISTS "Authenticated users can insert proofs" ON proofs;
DROP POLICY IF EXISTS "Authenticated users can update proofs" ON proofs;
DROP POLICY IF EXISTS "Authenticated users can delete proofs" ON proofs;

CREATE POLICY "Authenticated users can read proofs"
  ON proofs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert proofs"
  ON proofs FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update proofs"
  ON proofs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete proofs"
  ON proofs FOR DELETE TO authenticated USING (true);

-- Updates policies
DROP POLICY IF EXISTS "Authenticated users can read updates" ON updates;
DROP POLICY IF EXISTS "Authenticated users can insert updates" ON updates;
DROP POLICY IF EXISTS "Authenticated users can update updates" ON updates;
DROP POLICY IF EXISTS "Authenticated users can delete updates" ON updates;

CREATE POLICY "Authenticated users can read updates"
  ON updates FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert updates"
  ON updates FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update updates"
  ON updates FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete updates"
  ON updates FOR DELETE TO authenticated USING (true);
-- unit_assignments: maps FIELD_CONTRIBUTOR users to the specific units they can see and interact with.
-- A field contributor without any assignment record can see no units at all.

CREATE TABLE unit_assignments (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id      uuid        NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by  uuid        REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unit_id, user_id)
);

CREATE INDEX idx_unit_assignments_user_id ON unit_assignments(user_id);
CREATE INDEX idx_unit_assignments_unit_id ON unit_assignments(unit_id);

ALTER TABLE unit_assignments ENABLE ROW LEVEL SECURITY;

-- Field contributors can read their own assignments
CREATE POLICY "unit_assignments_self_select" ON unit_assignments
  FOR SELECT USING (auth.uid() = user_id);

-- Managers can read assignments for units within their org
CREATE POLICY "unit_assignments_manager_select" ON unit_assignments
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM profiles p
      JOIN units      u  ON u.id  = unit_assignments.unit_id
      JOIN workstreams ws ON ws.id = u.workstream_id
      JOIN programs   pr ON pr.id = ws.program_id
      WHERE p.user_id = auth.uid()
        AND p.org_id  = pr.org_id
        AND p.role IN ('PLATFORM_ADMIN', 'PROGRAM_OWNER', 'WORKSTREAM_LEAD')
    )
  );

-- Managers can create assignments for units in their org
CREATE POLICY "unit_assignments_insert" ON unit_assignments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM profiles p
      JOIN units      u  ON u.id  = unit_assignments.unit_id
      JOIN workstreams ws ON ws.id = u.workstream_id
      JOIN programs   pr ON pr.id = ws.program_id
      WHERE p.user_id = auth.uid()
        AND p.org_id  = pr.org_id
        AND p.role IN ('PLATFORM_ADMIN', 'PROGRAM_OWNER', 'WORKSTREAM_LEAD')
    )
  );

-- Managers can remove assignments for units in their org
CREATE POLICY "unit_assignments_delete" ON unit_assignments
  FOR DELETE USING (
    EXISTS (
      SELECT 1
      FROM profiles p
      JOIN units      u  ON u.id  = unit_assignments.unit_id
      JOIN workstreams ws ON ws.id = u.workstream_id
      JOIN programs   pr ON pr.id = ws.program_id
      WHERE p.user_id = auth.uid()
        AND p.org_id  = pr.org_id
        AND p.role IN ('PLATFORM_ADMIN', 'PROGRAM_OWNER', 'WORKSTREAM_LEAD')
    )
  );

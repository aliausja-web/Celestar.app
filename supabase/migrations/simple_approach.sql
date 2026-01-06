-- Simple approach: Just create the new tables without touching proofs
-- We'll handle proofs separately later

-- Programs table
CREATE TABLE IF NOT EXISTS programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  owner_org text NOT NULL,
  start_time timestamptz,
  end_time timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  created_by text,
  created_by_email text
);

-- Workstreams table
CREATE TABLE IF NOT EXISTS workstreams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text,
  ordering integer DEFAULT 0,
  overall_status text DEFAULT 'RED',
  last_update_time timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Units table
CREATE TABLE IF NOT EXISTS units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workstream_id uuid NOT NULL REFERENCES workstreams(id) ON DELETE CASCADE,
  title text NOT NULL,
  owner_party_name text NOT NULL,
  required_green_by timestamptz,
  proof_requirements jsonb DEFAULT '{"required_count": 1, "required_types": ["photo"]}'::jsonb,
  computed_status text DEFAULT 'RED',
  status_computed_at timestamptz DEFAULT now(),
  last_status_change_time timestamptz DEFAULT now(),
  current_escalation_level integer DEFAULT 0,
  last_escalated_at timestamptz,
  escalation_policy jsonb DEFAULT '[{"level": 1, "threshold_minutes_past_deadline": 0, "recipients_role": ["site_coordinator"], "new_deadline_minutes_from_now": 1440}]'::jsonb,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Status events table (doesn't reference proofs)
CREATE TABLE IF NOT EXISTS status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  old_status text,
  new_status text NOT NULL,
  changed_at timestamptz DEFAULT now() NOT NULL,
  changed_by text,
  changed_by_email text,
  reason text NOT NULL,
  proof_id uuid,
  notes text
);

-- Unit escalations table
CREATE TABLE IF NOT EXISTS unit_escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  workstream_id uuid NOT NULL REFERENCES workstreams(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  level integer NOT NULL,
  triggered_at timestamptz DEFAULT now() NOT NULL,
  recipients jsonb DEFAULT '[]'::jsonb,
  threshold_minutes_past_deadline integer NOT NULL,
  new_deadline_set_to timestamptz,
  acknowledged boolean DEFAULT false,
  acknowledged_by text,
  acknowledged_by_email text,
  acknowledged_at timestamptz,
  acknowledgment_note text,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Create a NEW proofs table specifically for units (separate from legacy)
CREATE TABLE IF NOT EXISTS unit_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  type text NOT NULL,
  url text NOT NULL,
  captured_at timestamptz,
  uploaded_at timestamptz DEFAULT now() NOT NULL,
  uploaded_by text NOT NULL,
  uploaded_by_email text,
  is_valid boolean DEFAULT true,
  validation_notes text,
  metadata_exif jsonb DEFAULT '{}'::jsonb,
  gps_latitude numeric,
  gps_longitude numeric
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_programs_owner_org ON programs(owner_org);
CREATE INDEX IF NOT EXISTS idx_workstreams_program_id ON workstreams(program_id);
CREATE INDEX IF NOT EXISTS idx_units_workstream_id ON units(workstream_id);
CREATE INDEX IF NOT EXISTS idx_unit_proofs_unit_id ON unit_proofs(unit_id);
CREATE INDEX IF NOT EXISTS idx_status_events_unit_id ON status_events(unit_id);
CREATE INDEX IF NOT EXISTS idx_unit_escalations_unit_id ON unit_escalations(unit_id);

SELECT 'SUCCESS: All hierarchical model tables created!' as message;

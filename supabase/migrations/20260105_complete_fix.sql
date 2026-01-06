-- ============================================================================
-- COMPLETE FIX: Prepare existing database for hierarchical model
-- ============================================================================
-- This handles the conflict between legacy proofs table and new schema
-- ============================================================================

-- Step 1: Add unit_id to existing proofs table (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'proofs' AND column_name = 'unit_id'
    ) THEN
        -- Add unit_id column
        ALTER TABLE proofs ADD COLUMN unit_id uuid;

        -- Make zone_id nullable for backward compatibility
        ALTER TABLE proofs ALTER COLUMN zone_id DROP NOT NULL;

        RAISE NOTICE '✅ Added unit_id column to proofs table';
    ELSE
        RAISE NOTICE 'ℹ️  unit_id column already exists';
    END IF;
END $$;

-- Step 2: Create units table (if not exists) BEFORE adding foreign key
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

CREATE TABLE IF NOT EXISTS workstreams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text,
  ordering integer DEFAULT 0,
  overall_status text DEFAULT 'RED' CHECK (overall_status IN ('RED', 'GREEN')),
  last_update_time timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workstream_id uuid NOT NULL REFERENCES workstreams(id) ON DELETE CASCADE,
  title text NOT NULL,
  owner_party_name text NOT NULL,
  required_green_by timestamptz,
  proof_requirements jsonb DEFAULT '{"required_count": 1, "required_types": ["photo"]}'::jsonb,
  computed_status text DEFAULT 'RED' CHECK (computed_status IN ('RED', 'GREEN')),
  status_computed_at timestamptz DEFAULT now(),
  last_status_change_time timestamptz DEFAULT now(),
  current_escalation_level integer DEFAULT 0 CHECK (current_escalation_level BETWEEN 0 AND 3),
  last_escalated_at timestamptz,
  escalation_policy jsonb DEFAULT '[
    {"level": 1, "threshold_minutes_past_deadline": 0, "recipients_role": ["site_coordinator"], "new_deadline_minutes_from_now": 1440},
    {"level": 2, "threshold_minutes_past_deadline": 480, "recipients_role": ["project_manager"], "new_deadline_minutes_from_now": 960},
    {"level": 3, "threshold_minutes_past_deadline": 960, "recipients_role": ["org_admin"], "new_deadline_minutes_from_now": 480}
  ]'::jsonb,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  old_status text CHECK (old_status IN ('RED', 'GREEN')),
  new_status text NOT NULL CHECK (new_status IN ('RED', 'GREEN')),
  changed_at timestamptz DEFAULT now() NOT NULL,
  changed_by text,
  changed_by_email text,
  reason text NOT NULL CHECK (reason IN ('valid_proof_received', 'proof_deleted', 'proof_invalidated', 'deadline_missed', 'manual_override', 'system_init')),
  proof_id uuid REFERENCES proofs(id) ON DELETE SET NULL,
  notes text
);

CREATE TABLE IF NOT EXISTS unit_escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  workstream_id uuid NOT NULL REFERENCES workstreams(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  level integer NOT NULL CHECK (level IN (1, 2, 3)),
  triggered_at timestamptz DEFAULT now() NOT NULL,
  recipients jsonb DEFAULT '[]'::jsonb,
  threshold_minutes_past_deadline integer NOT NULL,
  new_deadline_set_to timestamptz,
  acknowledged boolean DEFAULT false,
  acknowledged_by text,
  acknowledged_by_email text,
  acknowledged_at timestamptz,
  acknowledgment_note text,
  status text DEFAULT 'active' CHECK (status IN ('active', 'resolved')),
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Step 3: Now add foreign key constraint to proofs.unit_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'proofs_unit_id_fkey' AND table_name = 'proofs'
    ) THEN
        ALTER TABLE proofs ADD CONSTRAINT proofs_unit_id_fkey
            FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE;
        RAISE NOTICE '✅ Added foreign key constraint proofs.unit_id → units.id';
    END IF;
END $$;

-- Step 4: Create indexes
CREATE INDEX IF NOT EXISTS idx_programs_owner_org ON programs(owner_org);
CREATE INDEX IF NOT EXISTS idx_programs_created_at ON programs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workstreams_program_id ON workstreams(program_id);
CREATE INDEX IF NOT EXISTS idx_workstreams_overall_status ON workstreams(overall_status);
CREATE INDEX IF NOT EXISTS idx_workstreams_ordering ON workstreams(program_id, ordering);
CREATE INDEX IF NOT EXISTS idx_units_workstream_id ON units(workstream_id);
CREATE INDEX IF NOT EXISTS idx_units_computed_status ON units(computed_status);
CREATE INDEX IF NOT EXISTS idx_units_required_green_by ON units(required_green_by);
CREATE INDEX IF NOT EXISTS idx_units_escalation_level ON units(current_escalation_level);
CREATE INDEX IF NOT EXISTS idx_proofs_unit_id ON proofs(unit_id);
CREATE INDEX IF NOT EXISTS idx_status_events_unit_id ON status_events(unit_id);
CREATE INDEX IF NOT EXISTS idx_status_events_changed_at ON status_events(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_unit_escalations_unit_id ON unit_escalations(unit_id);
CREATE INDEX IF NOT EXISTS idx_unit_escalations_program_id ON unit_escalations(program_id);

RAISE NOTICE '✅ HIERARCHICAL MODEL TABLES READY';
RAISE NOTICE '✅ Indexes created';
RAISE NOTICE 'ℹ️  Next: Run the seed data migration';

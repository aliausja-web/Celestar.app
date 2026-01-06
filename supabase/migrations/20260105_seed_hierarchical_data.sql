-- ============================================================================
-- SEED DATA: Hierarchical Model Examples
-- ============================================================================
-- Demonstrates:
-- 1. Single-workstream program (simple project)
-- 2. Multi-workstream program (Almarai 4 malls - parallel sites)
-- ============================================================================

-- Clean existing seed data (if any)
DELETE FROM unit_escalations WHERE program_id IN (
  SELECT id FROM programs WHERE name LIKE 'SEED:%'
);
DELETE FROM status_events WHERE unit_id IN (
  SELECT id FROM units WHERE workstream_id IN (
    SELECT id FROM workstreams WHERE program_id IN (
      SELECT id FROM programs WHERE name LIKE 'SEED:%'
    )
  )
);
DELETE FROM proofs WHERE unit_id IN (
  SELECT id FROM units WHERE workstream_id IN (
    SELECT id FROM workstreams WHERE program_id IN (
      SELECT id FROM programs WHERE name LIKE 'SEED:%'
    )
  )
);
DELETE FROM units WHERE workstream_id IN (
  SELECT id FROM workstreams WHERE program_id IN (
    SELECT id FROM programs WHERE name LIKE 'SEED:%'
  )
);
DELETE FROM workstreams WHERE program_id IN (
  SELECT id FROM programs WHERE name LIKE 'SEED:%'
);
DELETE FROM programs WHERE name LIKE 'SEED:%';

-- ============================================================================
-- EXAMPLE 1: Single-Workstream Program (Simple Event)
-- ============================================================================

INSERT INTO programs (id, name, description, owner_org, start_time, end_time, created_by, created_by_email)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'SEED: Riyadh Season Launch Event',
  'Single-day activation event for Riyadh Season 2026',
  'Riyadh Season Authority',
  '2026-02-01 00:00:00+00',
  '2026-02-01 23:59:59+00',
  'system',
  'system@celestar.app'
);

INSERT INTO workstreams (id, program_id, name, type, ordering, overall_status)
VALUES (
  '11111111-2222-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111',
  'Riyadh Season Launch',
  'event',
  0,
  'RED'
);

-- Units for single workstream
INSERT INTO units (id, workstream_id, title, owner_party_name, required_green_by, proof_requirements)
VALUES
  (
    '11111111-3333-1111-1111-111111111111',
    '11111111-2222-1111-1111-111111111111',
    'Main Stage Setup Complete',
    'Stage Tech Productions',
    '2026-01-31 12:00:00+00',
    '{"required_count": 2, "required_types": ["photo", "video"]}'::jsonb
  ),
  (
    '11111111-3333-2222-1111-111111111111',
    '11111111-2222-1111-1111-111111111111',
    'VIP Area Ready',
    'Venue Services Co',
    '2026-01-31 16:00:00+00',
    '{"required_count": 1, "required_types": ["photo"]}'::jsonb
  ),
  (
    '11111111-3333-3333-1111-111111111111',
    '11111111-2222-1111-1111-111111111111',
    'Security Perimeter Established',
    'SecureTech KSA',
    '2026-01-31 18:00:00+00',
    '{"required_count": 3, "required_types": ["photo"]}'::jsonb
  ),
  (
    '11111111-3333-4444-1111-111111111111',
    '11111111-2222-1111-1111-111111111111',
    'AV Systems Tested',
    'Stage Tech Productions',
    '2026-01-31 20:00:00+00',
    '{"required_count": 1, "required_types": ["video"]}'::jsonb
  ),
  (
    '11111111-3333-5555-1111-111111111111',
    '11111111-2222-1111-1111-111111111111',
    'F&B Stations Operational',
    'Catering Plus',
    '2026-02-01 06:00:00+00',
    '{"required_count": 2, "required_types": ["photo"]}'::jsonb
  );

-- ============================================================================
-- EXAMPLE 2: Multi-Workstream Program (Almarai 4 Malls - Parallel Sites)
-- ============================================================================

INSERT INTO programs (id, name, description, owner_org, start_time, end_time, created_by, created_by_email)
VALUES (
  '22222222-1111-1111-1111-111111111111',
  'SEED: Almarai Fitout Activation - 4 Malls',
  'Simultaneous fitout activations across 4 major shopping malls in KSA',
  'Almarai Company',
  '2026-02-10 00:00:00+00',
  '2026-02-28 23:59:59+00',
  'system',
  'system@celestar.app'
);

-- Workstream 1: Riyadh Park Mall
INSERT INTO workstreams (id, program_id, name, type, ordering, overall_status)
VALUES (
  '22222222-2222-1111-1111-111111111111',
  '22222222-1111-1111-1111-111111111111',
  'Riyadh Park Mall',
  'site',
  1,
  'RED'
);

INSERT INTO units (id, workstream_id, title, owner_party_name, required_green_by, proof_requirements)
VALUES
  (
    '22222222-3333-1111-1111-111111111111',
    '22222222-2222-1111-1111-111111111111',
    'Store Space Handover',
    'Mall Management',
    '2026-02-11 09:00:00+00',
    '{"required_count": 1, "required_types": ["document"]}'::jsonb
  ),
  (
    '22222222-3333-1112-1111-111111111111',
    '22222222-2222-1111-1111-111111111111',
    'Electrical Installation Complete',
    'ElectroCo KSA',
    '2026-02-15 17:00:00+00',
    '{"required_count": 2, "required_types": ["photo"]}'::jsonb
  ),
  (
    '22222222-3333-1113-1111-111111111111',
    '22222222-2222-1111-1111-111111111111',
    'Refrigeration Units Operational',
    'CoolTech Solutions',
    '2026-02-18 12:00:00+00',
    '{"required_count": 1, "required_types": ["photo"]}'::jsonb
  ),
  (
    '22222222-3333-1114-1111-111111111111',
    '22222222-2222-1111-1111-111111111111',
    'Branding & Signage Installed',
    'SignMasters',
    '2026-02-20 16:00:00+00',
    '{"required_count": 3, "required_types": ["photo"]}'::jsonb
  ),
  (
    '22222222-3333-1115-1111-111111111111',
    '22222222-2222-1111-1111-111111111111',
    'Health & Safety Inspection Passed',
    'SFDA Inspector',
    '2026-02-24 14:00:00+00',
    '{"required_count": 1, "required_types": ["document"]}'::jsonb
  ),
  (
    '22222222-3333-1116-1111-111111111111',
    '22222222-2222-1111-1111-111111111111',
    'Stock Loaded & Ready',
    'Almarai Logistics',
    '2026-02-27 10:00:00+00',
    '{"required_count": 2, "required_types": ["photo"]}'::jsonb
  );

-- Workstream 2: Al Nakheel Mall
INSERT INTO workstreams (id, program_id, name, type, ordering, overall_status)
VALUES (
  '22222222-2222-2222-1111-111111111111',
  '22222222-1111-1111-1111-111111111111',
  'Al Nakheel Mall',
  'site',
  2,
  'RED'
);

INSERT INTO units (id, workstream_id, title, owner_party_name, required_green_by, proof_requirements)
VALUES
  (
    '22222222-3333-2221-1111-111111111111',
    '22222222-2222-2222-1111-111111111111',
    'Store Space Handover',
    'Mall Management',
    '2026-02-11 09:00:00+00',
    '{"required_count": 1, "required_types": ["document"]}'::jsonb
  ),
  (
    '22222222-3333-2222-1111-111111111111',
    '22222222-2222-2222-1111-111111111111',
    'Electrical Installation Complete',
    'ElectroCo KSA',
    '2026-02-15 17:00:00+00',
    '{"required_count": 2, "required_types": ["photo"]}'::jsonb
  ),
  (
    '22222222-3333-2223-1111-111111111111',
    '22222222-2222-2222-1111-111111111111',
    'Refrigeration Units Operational',
    'CoolTech Solutions',
    '2026-02-18 12:00:00+00',
    '{"required_count": 1, "required_types": ["photo"]}'::jsonb
  ),
  (
    '22222222-3333-2224-1111-111111111111',
    '22222222-2222-2222-1111-111111111111',
    'Branding & Signage Installed',
    'SignMasters',
    '2026-02-20 16:00:00+00',
    '{"required_count": 3, "required_types": ["photo"]}'::jsonb
  ),
  (
    '22222222-3333-2225-1111-111111111111',
    '22222222-2222-2222-1111-111111111111',
    'Health & Safety Inspection Passed',
    'SFDA Inspector',
    '2026-02-24 14:00:00+00',
    '{"required_count": 1, "required_types": ["document"]}'::jsonb
  ),
  (
    '22222222-3333-2226-1111-111111111111',
    '22222222-2222-2222-1111-111111111111',
    'Stock Loaded & Ready',
    'Almarai Logistics',
    '2026-02-27 10:00:00+00',
    '{"required_count": 2, "required_types": ["photo"]}'::jsonb
  );

-- Workstream 3: Red Sea Mall
INSERT INTO workstreams (id, program_id, name, type, ordering, overall_status)
VALUES (
  '22222222-2222-3333-1111-111111111111',
  '22222222-1111-1111-1111-111111111111',
  'Red Sea Mall',
  'site',
  3,
  'RED'
);

INSERT INTO units (id, workstream_id, title, owner_party_name, required_green_by, proof_requirements)
VALUES
  (
    '22222222-3333-3331-1111-111111111111',
    '22222222-2222-3333-1111-111111111111',
    'Store Space Handover',
    'Mall Management',
    '2026-02-11 09:00:00+00',
    '{"required_count": 1, "required_types": ["document"]}'::jsonb
  ),
  (
    '22222222-3333-3332-1111-111111111111',
    '22222222-2222-3333-1111-111111111111',
    'Electrical Installation Complete',
    'ElectroCo KSA',
    '2026-02-15 17:00:00+00',
    '{"required_count": 2, "required_types": ["photo"]}'::jsonb
  ),
  (
    '22222222-3333-3333-1111-111111111111',
    '22222222-2222-3333-1111-111111111111',
    'Refrigeration Units Operational',
    'CoolTech Solutions',
    '2026-02-18 12:00:00+00',
    '{"required_count": 1, "required_types": ["photo"]}'::jsonb
  ),
  (
    '22222222-3333-3334-1111-111111111111',
    '22222222-2222-3333-1111-111111111111',
    'Branding & Signage Installed',
    'SignMasters',
    '2026-02-20 16:00:00+00',
    '{"required_count": 3, "required_types": ["photo"]}'::jsonb
  ),
  (
    '22222222-3333-3335-1111-111111111111',
    '22222222-2222-3333-1111-111111111111',
    'Health & Safety Inspection Passed',
    'SFDA Inspector',
    '2026-02-24 14:00:00+00',
    '{"required_count": 1, "required_types": ["document"]}'::jsonb
  ),
  (
    '22222222-3333-3336-1111-111111111111',
    '22222222-2222-3333-1111-111111111111',
    'Stock Loaded & Ready',
    'Almarai Logistics',
    '2026-02-27 10:00:00+00',
    '{"required_count": 2, "required_types": ["photo"]}'::jsonb
  );

-- Workstream 4: Al Rashid Mall
INSERT INTO workstreams (id, program_id, name, type, ordering, overall_status)
VALUES (
  '22222222-2222-4444-1111-111111111111',
  '22222222-1111-1111-1111-111111111111',
  'Al Rashid Mall',
  'site',
  4,
  'RED'
);

INSERT INTO units (id, workstream_id, title, owner_party_name, required_green_by, proof_requirements)
VALUES
  (
    '22222222-3333-4441-1111-111111111111',
    '22222222-2222-4444-1111-111111111111',
    'Store Space Handover',
    'Mall Management',
    '2026-02-11 09:00:00+00',
    '{"required_count": 1, "required_types": ["document"]}'::jsonb
  ),
  (
    '22222222-3333-4442-1111-111111111111',
    '22222222-2222-4444-1111-111111111111',
    'Electrical Installation Complete',
    'ElectroCo KSA',
    '2026-02-15 17:00:00+00',
    '{"required_count": 2, "required_types": ["photo"]}'::jsonb
  ),
  (
    '22222222-3333-4443-1111-111111111111',
    '22222222-2222-4444-1111-111111111111',
    'Refrigeration Units Operational',
    'CoolTech Solutions',
    '2026-02-18 12:00:00+00',
    '{"required_count": 1, "required_types": ["photo"]}'::jsonb
  ),
  (
    '22222222-3333-4444-1111-111111111111',
    '22222222-2222-4444-1111-111111111111',
    'Branding & Signage Installed',
    'SignMasters',
    '2026-02-20 16:00:00+00',
    '{"required_count": 3, "required_types": ["photo"]}'::jsonb
  ),
  (
    '22222222-3333-4445-1111-111111111111',
    '22222222-2222-4444-1111-111111111111',
    'Health & Safety Inspection Passed',
    'SFDA Inspector',
    '2026-02-24 14:00:00+00',
    '{"required_count": 1, "required_types": ["document"]}'::jsonb
  ),
  (
    '22222222-3333-4446-1111-111111111111',
    '22222222-2222-4444-1111-111111111111',
    'Stock Loaded & Ready',
    'Almarai Logistics',
    '2026-02-27 10:00:00+00',
    '{"required_count": 2, "required_types": ["photo"]}'::jsonb
  );

-- ============================================================================
-- Initialize status events for all units
-- ============================================================================

INSERT INTO status_events (unit_id, old_status, new_status, changed_by, changed_by_email, reason, notes)
SELECT
  id,
  NULL,
  'RED',
  'system',
  'system@celestar.app',
  'system_init',
  'Initial unit creation'
FROM units
WHERE workstream_id IN (
  SELECT id FROM workstreams WHERE program_id IN (
    SELECT id FROM programs WHERE name LIKE 'SEED:%'
  )
);

-- ============================================================================
-- SUMMARY
-- ============================================================================

DO $$
DECLARE
  v_programs_count integer;
  v_workstreams_count integer;
  v_units_count integer;
BEGIN
  SELECT COUNT(*) INTO v_programs_count FROM programs WHERE name LIKE 'SEED:%';
  SELECT COUNT(*) INTO v_workstreams_count FROM workstreams WHERE program_id IN (SELECT id FROM programs WHERE name LIKE 'SEED:%');
  SELECT COUNT(*) INTO v_units_count FROM units WHERE workstream_id IN (SELECT id FROM workstreams WHERE program_id IN (SELECT id FROM programs WHERE name LIKE 'SEED:%'));

  RAISE NOTICE '✅ SEED DATA CREATED SUCCESSFULLY';
  RAISE NOTICE '==========================================';
  RAISE NOTICE '📊 Programs: %', v_programs_count;
  RAISE NOTICE '📊 Workstreams: %', v_workstreams_count;
  RAISE NOTICE '📊 Units (Deliverables): %', v_units_count;
  RAISE NOTICE '';
  RAISE NOTICE '💡 Example 1: Single-workstream program (Riyadh Season Launch)';
  RAISE NOTICE '   - 1 program, 1 workstream, 5 units';
  RAISE NOTICE '';
  RAISE NOTICE '💡 Example 2: Multi-workstream program (Almarai 4 Malls)';
  RAISE NOTICE '   - 1 program, 4 workstreams (parallel sites), 24 units (6 per mall)';
  RAISE NOTICE '';
  RAISE NOTICE '🎯 All units initialized as RED (awaiting proof)';
  RAISE NOTICE '🎯 Upload proofs to units to automatically turn them GREEN';
END $$;

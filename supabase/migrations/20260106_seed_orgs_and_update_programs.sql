-- Seed Organizations and Update Programs
-- Migration: 20260106_seed_orgs_and_update_programs.sql

-- ============================================================================
-- 1. SEED ORGANIZATIONS
-- ============================================================================

-- Insert sample organizations
INSERT INTO orgs (id, name, metadata) VALUES
  ('org_celestar', 'Celestar', '{"industry": "Event Management", "country": "Saudi Arabia"}'::jsonb),
  ('org_almarai', 'Almarai', '{"industry": "Retail", "country": "Saudi Arabia"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 2. UPDATE EXISTING PROGRAMS WITH ORG_ID
-- ============================================================================

-- Assign Riyadh Season Launch Event to Celestar
UPDATE programs
SET org_id = 'org_celestar'
WHERE name = 'Riyadh Season Launch Event';

-- Assign Almarai 4 Malls to Almarai
UPDATE programs
SET org_id = 'org_almarai'
WHERE name = 'Almarai 4 Malls';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

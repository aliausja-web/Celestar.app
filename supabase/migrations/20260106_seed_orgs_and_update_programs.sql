-- Seed Organizations and Update Programs
-- Migration: 20260106_seed_orgs_and_update_programs.sql

-- ============================================================================
-- 1. SEED ORGANIZATIONS
-- ============================================================================

-- Insert Celestar as the platform organization
INSERT INTO orgs (id, name, metadata) VALUES
  ('org_celestar', 'Celestar', '{"type": "platform_owner", "country": "Saudi Arabia"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 2. UPDATE EXISTING PROGRAMS WITH ORG_ID
-- ============================================================================

-- Assign all existing programs to Celestar by default
-- In a multi-tenant system, programs would belong to different orgs
-- For now, all execution projects are managed by Celestar
UPDATE programs
SET org_id = 'org_celestar'
WHERE org_id IS NULL;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

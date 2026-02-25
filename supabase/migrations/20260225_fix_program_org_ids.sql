-- ============================================================================
-- FIX: Set correct org_id on existing programs
-- Migration: 20260225_fix_program_org_ids.sql
-- Date: 2026-02-25
--
-- ROOT CAUSE:
--   The program creation form never sent org_id in the POST body. PLATFORM_ADMIN
--   fell back to context.org_id = 'org_celestar', so every program ended up with
--   org_id = 'org_celestar'. Escalation emails were sent to org_celestar users
--   instead of the client's users (e.g. org_alimam_001).
--
-- FIX:
--   Reassign all current programs to org_alimam_001.
--   Extend this pattern when onboarding additional client orgs.
-- ============================================================================

-- Reassign all programs that currently have org_celestar to org_alimam_001
-- (Safe to run: only touches programs with the wrong default org)
UPDATE programs
SET org_id = 'org_alimam_001'
WHERE org_id = 'org_celestar'
   OR org_id IS NULL;

-- Verify
DO $$
DECLARE
  r RECORD;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== Program org_id fix — results ===';
  FOR r IN
    SELECT id, name, org_id FROM programs ORDER BY created_at DESC
  LOOP
    RAISE NOTICE 'program=% | org_id=%', r.name, r.org_id;
  END LOOP;
  RAISE NOTICE '=====================================';
END $$;

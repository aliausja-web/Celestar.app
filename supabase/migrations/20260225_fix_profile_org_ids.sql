-- ============================================================================
-- FIX: Profile org_id values for real client users
-- Migration: 20260225_fix_profile_org_ids.sql
-- Date: 2026-02-25
--
-- ROOT CAUSE:
--   create-rbac-user API used wrong column name (organization_id vs org_id),
--   causing Supabase to reject the insert. The sync_auth_to_profiles trigger
--   then created fallback profiles with org_id = 'org_celestar' instead of
--   the correct client org. This broke all org-scoped queries:
--   escalation emails, proof visibility, workstream access, etc.
--
-- FIX:
--   1. Update ali.syed@alimam.biz to correct org and role.
--   2. General safety: any profile with org_id = 'org_celestar' that has a
--      @alimam.biz email gets corrected to org_alimam_001.
--   3. Extend with other client orgs as you onboard them.
-- ============================================================================

-- ---- 1. Fix ali.syed@alimam.biz specifically --------------------------------
UPDATE profiles
SET
  org_id    = 'org_alimam_001',
  role      = 'PROGRAM_OWNER',
  updated_at = NOW()
WHERE email = 'ali.syed@alimam.biz';

-- ---- 2. Safety net: fix any @alimam.biz user that landed on org_celestar ----
UPDATE profiles
SET
  org_id     = 'org_alimam_001',
  updated_at = NOW()
WHERE email LIKE '%@alimam.biz'
  AND org_id = 'org_celestar';

-- ---- 3. Verify ---------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== Profile org_id fix — results ===';
  FOR r IN
    SELECT email, role, org_id FROM profiles
    WHERE email LIKE '%@alimam.biz'
    ORDER BY email
  LOOP
    RAISE NOTICE 'email=% | role=% | org_id=%', r.email, r.role, r.org_id;
  END LOOP;
  RAISE NOTICE '=====================================';
END $$;

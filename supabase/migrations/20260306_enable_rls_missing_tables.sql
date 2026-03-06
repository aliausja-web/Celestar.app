-- ============================================================================
-- CRITICAL: Enable RLS on 3 tables flagged by Supabase Security Advisor
-- Migration: 20260306_enable_rls_missing_tables.sql
-- Date: 2026-03-06
--
-- ISSUE: Migration 20260216_fix_supabase_security_advisor.sql created all the
-- correct policies for these tables but never called ALTER TABLE ... ENABLE
-- ROW LEVEL SECURITY. Policies without RLS enabled are silently ignored —
-- all rows were publicly readable/writable by any authenticated user.
--
-- Tables affected:
--   - public.escalation_attention_log  (Policy Exists, RLS Disabled)
--   - public.escalation_notifications  (Policy Exists, RLS Disabled)
--   - public.organizations             (Policy Exists, RLS Disabled)
-- ============================================================================

ALTER TABLE public.escalation_attention_log  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escalation_notifications  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations             ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Verify: confirm RLS is now active on all three tables
-- ============================================================================
DO $$
DECLARE
  tbl text;
  rls_on bool;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== RLS Status Check ===';
  FOR tbl, rls_on IN
    SELECT relname, relrowsecurity
    FROM pg_class
    WHERE relname IN (
      'escalation_attention_log',
      'escalation_notifications',
      'organizations'
    )
    ORDER BY relname
  LOOP
    IF rls_on THEN
      RAISE NOTICE '[OK] %.% — RLS ENABLED', 'public', tbl;
    ELSE
      RAISE WARNING '[FAIL] %.% — RLS STILL DISABLED', 'public', tbl;
    END IF;
  END LOOP;
  RAISE NOTICE '========================';
END $$;

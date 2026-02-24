-- ============================================================================
-- DOCUMENT CATEGORY — Governance Document Classification
-- Migration: 20260222_document_category.sql
-- Date: 2026-02-22
--
-- PURPOSE: Add document_category to unit_proofs so uploaded governance
-- documents are properly classified (permit, RFP, pre-qualification, etc.)
-- aligned with Celestar's verified-proof philosophy.
-- ============================================================================

ALTER TABLE unit_proofs
  ADD COLUMN IF NOT EXISTS document_category text
  CHECK (document_category IS NULL OR document_category IN (
    'permit',
    'rfp',
    'pre_qualification',
    'terms_of_reference',
    'contract',
    'certificate',
    'insurance',
    'financial',
    'other'
  ));

COMMENT ON COLUMN unit_proofs.document_category IS
  'Governance document classification. Only set when proof type = document. '
  'Values: permit, rfp, pre_qualification, terms_of_reference, contract, '
  'certificate, insurance, financial, other.';

CREATE INDEX IF NOT EXISTS idx_unit_proofs_document_category
  ON unit_proofs(document_category)
  WHERE document_category IS NOT NULL;

-- Verify
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'DOCUMENT CATEGORY — MIGRATION COMPLETE';
  RAISE NOTICE 'unit_proofs.document_category column added';
  RAISE NOTICE 'Values: permit | rfp | pre_qualification | terms_of_reference';
  RAISE NOTICE '        contract | certificate | insurance | financial | other';
  RAISE NOTICE '========================================';
END $$;

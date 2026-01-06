-- ============================================================================
-- FIX: Add unit_id column to existing proofs table
-- ============================================================================
-- The hierarchical model uses unit_id instead of zone_id
-- This migration adds unit_id while preserving existing zone_id for legacy data
-- ============================================================================

-- Add unit_id column to proofs table (if it doesn't exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'proofs' AND column_name = 'unit_id'
    ) THEN
        ALTER TABLE proofs ADD COLUMN unit_id uuid REFERENCES units(id) ON DELETE CASCADE;
        CREATE INDEX IF NOT EXISTS idx_proofs_unit_id ON proofs(unit_id);

        RAISE NOTICE '✅ Added unit_id column to proofs table';
    ELSE
        RAISE NOTICE 'ℹ️  unit_id column already exists in proofs table';
    END IF;
END $$;

-- Make zone_id nullable (since new proofs will use unit_id)
DO $$
BEGIN
    ALTER TABLE proofs ALTER COLUMN zone_id DROP NOT NULL;
    RAISE NOTICE '✅ Made zone_id nullable for backward compatibility';
EXCEPTION
    WHEN others THEN
        RAISE NOTICE 'ℹ️  zone_id column modification skipped (may not exist or already nullable)';
END $$;

RAISE NOTICE '✅ Proofs table updated for hierarchical model';
RAISE NOTICE 'ℹ️  Legacy proofs with zone_id will continue to work';
RAISE NOTICE 'ℹ️  New proofs will use unit_id';

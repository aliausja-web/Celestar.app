-- ============================================================================
-- CHECK ORPHANED PROGRAMS
-- ============================================================================

-- Show the 2 programs and their organization_id
SELECT
  'PROGRAM DETAILS' as info,
  id,
  name,
  organization_id,
  created_at
FROM programs
ORDER BY created_at DESC;

-- Check if they have NULL organization_id
SELECT
  'ORPHANED PROGRAMS' as info,
  COUNT(*) as count
FROM programs
WHERE organization_id IS NULL;

-- Show workstreams for these programs
SELECT
  'WORKSTREAMS' as info,
  w.id,
  w.name,
  w.program_id,
  p.name as program_name,
  w.created_at
FROM workstreams w
JOIN programs p ON w.program_id = p.id
ORDER BY w.created_at DESC;

-- Show units for these workstreams
SELECT
  'UNITS' as info,
  u.id,
  u.title,
  u.workstream_id,
  w.name as workstream_name,
  p.name as program_name,
  u.computed_status,
  u.created_at
FROM units u
JOIN workstreams w ON u.workstream_id = w.id
JOIN programs p ON w.program_id = p.id
ORDER BY u.created_at DESC;

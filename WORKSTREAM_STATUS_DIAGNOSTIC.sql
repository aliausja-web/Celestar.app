-- ============================================================================
-- DIAGNOSTIC: Workstream Status Investigation
-- Run this in Supabase SQL Editor to understand the issue
-- ============================================================================

-- Show all workstreams with their unit counts and statuses
SELECT
  w.id as workstream_id,
  w.name as workstream_name,
  w.overall_status as current_status,
  COUNT(u.id) as total_units,
  SUM(CASE WHEN u.computed_status = 'GREEN' THEN 1 ELSE 0 END) as green_units,
  SUM(CASE WHEN u.computed_status = 'RED' THEN 1 ELSE 0 END) as red_units,
  compute_workstream_status(w.id) as computed_status
FROM workstreams w
LEFT JOIN units u ON u.workstream_id = w.id
WHERE w.program_id = (SELECT id FROM programs WHERE name LIKE '%National Brand%' LIMIT 1)
GROUP BY w.id, w.name, w.overall_status
ORDER BY w.ordering;

-- Show all units for each workstream with their proof status
SELECT
  w.name as workstream_name,
  u.title as unit_title,
  u.computed_status,
  u.proof_count,
  u.proof_requirements->>'required_count' as required_count,
  (SELECT COUNT(*) FROM proofs WHERE unit_id = u.id AND is_valid = true) as valid_proofs
FROM workstreams w
JOIN units u ON u.workstream_id = w.id
WHERE w.program_id = (SELECT id FROM programs WHERE name LIKE '%National Brand%' LIMIT 1)
ORDER BY w.ordering, u.created_at;

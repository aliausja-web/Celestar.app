-- ============================================================================
-- TEST: End-to-End Email Automation Workflow
-- ============================================================================
-- This will test the complete automation chain:
-- 1. Create escalation → 2. Trigger creates notification → 3. Webhook sends email
-- ============================================================================

-- Step 1: Find a test unit to escalate
SELECT
  u.id as unit_id,
  u.title as unit_title,
  w.name as workstream_name,
  p.name as program_name
FROM units u
JOIN workstreams w ON u.workstream_id = w.id
JOIN programs p ON w.program_id = p.id
LIMIT 5;

-- Copy one unit_id from the results above, then run this:
-- (Replace 'YOUR_UNIT_ID_HERE' with actual unit ID)

-- Step 2: Create a test escalation
-- This will trigger the database trigger, which creates a notification,
-- which triggers the webhook, which sends the email!
INSERT INTO unit_escalations (
  unit_id,
  escalation_level,
  escalated_by,
  reason,
  status
)
VALUES (
  'YOUR_UNIT_ID_HERE',  -- ⚠️ REPLACE THIS with actual unit ID from Step 1
  1,                     -- Level 1 escalation (goes to Workstream Lead)
  auth.uid(),           -- Current user
  'Testing automated email workflow - end-to-end test',
  'pending'
);

-- Step 3: Verify notification was created automatically by trigger
SELECT
  id,
  recipient_email,
  recipient_role,
  status,
  metadata->>'subject' as email_subject,
  metadata->>'priority' as priority,
  created_at
FROM escalation_notifications
WHERE escalation_id = (
  SELECT id FROM unit_escalations
  WHERE reason LIKE '%end-to-end test%'
  ORDER BY created_at DESC
  LIMIT 1
);

-- Step 4: Wait 5-10 seconds, then check if email was sent
-- The webhook should have fired immediately and the status should change to 'sent'
SELECT
  id,
  recipient_email,
  status,
  sent_at,
  delivery_status,
  error_message,
  metadata->>'subject' as email_subject
FROM escalation_notifications
ORDER BY created_at DESC
LIMIT 5;

-- Step 5: Check email delivery statistics
SELECT
  status,
  COUNT(*) as count
FROM escalation_notifications
GROUP BY status;

-- ============================================================================
-- EXPECTED RESULTS:
-- ============================================================================
-- After Step 2 (Insert escalation):
--   ✓ New row appears in unit_escalations
--   ✓ Trigger automatically creates row in escalation_notifications (status='pending')
--   ✓ Webhook fires immediately and calls send-escalation-emails Edge Function
--
-- After Step 4 (Check status - wait 5-10 seconds):
--   ✓ Notification status changes from 'pending' to 'sent'
--   ✓ sent_at timestamp is populated
--   ✓ delivery_status = 'delivered'
--   ✓ external_id contains Resend email ID
--
-- Final verification:
--   ✓ Check recipient's inbox - email should be there!
-- ============================================================================

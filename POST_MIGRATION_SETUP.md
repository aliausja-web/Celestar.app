# Post-Migration Setup Guide

## Step 1: Verify Migration Success

After running `20260108_production_ready_final.sql`, verify tables were created:

```sql
-- Check if all tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
  'organizations',
  'in_app_notifications',
  'escalation_notifications',
  'escalation_attention_log'
);

-- Check if escalation_config column was added to units
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'units'
AND column_name = 'escalation_config';
```

Expected result: All 4 tables + escalation_config column should be present.

---

## Step 2: Create Initial Organizations

```sql
-- Create platform organization
INSERT INTO organizations (name, type, is_active, contact_email) VALUES
  ('Platform Admin Organization', 'platform', true, 'admin@yourplatform.com');

-- Create your first client organization
INSERT INTO organizations (name, type, is_active, contact_email) VALUES
  ('Your Client Company Name', 'client', true, 'client@example.com');

-- Verify organizations were created
SELECT id, name, type, is_active FROM organizations;
```

**Note the IDs** - you'll need them for the next steps.

---

## Step 3: Link Users to Organizations

Replace `[PLATFORM_ORG_ID]` and `[CLIENT_ORG_ID]` with the actual UUIDs from Step 2.

```sql
-- Link platform admins to platform organization
UPDATE profiles
SET organization_id = '[PLATFORM_ORG_ID]'
WHERE role = 'PLATFORM_ADMIN';

-- Link client users to their organization
UPDATE profiles
SET organization_id = '[CLIENT_ORG_ID]'
WHERE role IN ('CLIENT_VIEWER', 'PROGRAM_OWNER')
  AND email LIKE '%@yourclientdomain.com'; -- Adjust filter as needed

-- Verify user-organization links
SELECT
  full_name,
  email,
  role,
  (SELECT name FROM organizations WHERE id = profiles.organization_id) as org_name
FROM profiles
WHERE organization_id IS NOT NULL;
```

---

## Step 4: Link Programs to Client Organizations

```sql
-- Link existing programs to the client organization
UPDATE programs
SET client_organization_id = '[CLIENT_ORG_ID]'
WHERE id IN (
  -- Replace with your actual program IDs or use a filter
  SELECT id FROM programs WHERE name LIKE '%YourClientName%'
);

-- Verify program-organization links
SELECT
  p.name as program_name,
  o.name as client_organization
FROM programs p
LEFT JOIN organizations o ON p.client_organization_id = o.id;
```

---

## Step 5: Test Notification System

### 5.1 Test In-App Notifications

```sql
-- Create a test notification for yourself
INSERT INTO in_app_notifications (
  user_id,
  title,
  message,
  type,
  priority,
  action_url
) VALUES (
  (SELECT user_id FROM profiles WHERE email = 'your-email@example.com'),
  'Test Notification',
  'This is a test notification to verify the system is working.',
  'escalation',
  'high',
  '/programs'
);

-- Check if notification was created
SELECT * FROM in_app_notifications ORDER BY created_at DESC LIMIT 5;
```

**Expected Result**:
- Notification bell in the portal header should show unread count
- Clicking bell should show the test notification
- Clicking notification should navigate to /programs

### 5.2 Test Real-Time Updates

1. Open the portal in your browser
2. Keep the notification bell visible
3. Run the INSERT statement above again in Supabase SQL Editor
4. **Expected**: The bell should update in real-time without page refresh

---

## Step 6: Test Custom Escalation Settings

1. Navigate to any workstream
2. Click "Add Unit" button
3. Fill in unit details
4. Scroll to **"Urgency Alert Settings"** section
5. Adjust the percentage sliders:
   - Level 1 (Yellow): 50% (default)
   - Level 2 (Orange): 75% (default)
   - Level 3 (Red): 90% (default)
6. Create the unit
7. Verify in database:

```sql
-- Check if escalation_config was saved
SELECT
  title,
  deadline,
  escalation_config
FROM units
WHERE title = 'Your Test Unit Name'
ORDER BY created_at DESC
LIMIT 1;
```

**Expected Result**: escalation_config should contain your custom thresholds.

---

## Step 7: Test Manual Escalation

1. Navigate to a workstream with a RED unit
2. Find the unit card
3. Click the "Escalate" button (⚠️ icon)
4. **Manual Escalation Dialog** should appear
5. Enter a reason (e.g., "Critical blocker - vendor delayed delivery")
6. Click "Escalate Now"
7. Verify:
   - Success toast appears
   - Escalation level increases
   - Notification bell shows new notifications for target roles

```sql
-- Verify escalation was created
SELECT
  u.title as unit_title,
  ue.escalation_level,
  ue.escalation_type,
  ue.escalation_reason,
  ue.visible_to_roles,
  p.full_name as escalated_by
FROM unit_escalations ue
JOIN units u ON ue.unit_id = u.id
JOIN profiles p ON ue.escalated_by = p.user_id
ORDER BY ue.triggered_at DESC
LIMIT 5;

-- Check notifications were created
SELECT
  title,
  message,
  priority,
  type,
  (SELECT full_name FROM profiles WHERE user_id = in_app_notifications.user_id) as recipient
FROM in_app_notifications
WHERE type = 'manual_escalation'
ORDER BY created_at DESC
LIMIT 5;
```

---

## Step 8: Test Multi-Client Isolation

### 8.1 Create a Second Test Client

```sql
-- Create second client organization
INSERT INTO organizations (name, type, is_active) VALUES
  ('Test Client B', 'client', true);

-- Create test program for Client B
INSERT INTO programs (name, description, client_organization_id) VALUES
  ('Client B Test Program', 'Test program for isolation', (SELECT id FROM organizations WHERE name = 'Test Client B'));
```

### 8.2 Test Isolation

1. Log in as **Client A user**
2. Navigate to Programs page
3. **Expected**: Should ONLY see Client A's programs

4. Log in as **Client B user** (or create one)
5. Navigate to Programs page
6. **Expected**: Should ONLY see Client B's programs

7. Log in as **Platform Admin**
8. Navigate to Programs page
9. **Expected**: Should see ALL programs (both Client A and Client B)

```sql
-- Verify RLS is working
-- Run this as different users and check results
SELECT
  p.name as program_name,
  o.name as client_organization
FROM programs p
LEFT JOIN organizations o ON p.client_organization_id = o.id;
```

---

## Step 9: Test Automatic Escalation (Optional)

The automatic escalation checker function is ready but needs to be called. You can test it manually:

```sql
-- Manually trigger escalation check
SELECT * FROM check_and_trigger_unit_escalations_v2();
```

**Expected Result**:
- Returns `units_checked`, `escalations_created`, `notifications_queued` counts
- Any units that crossed their percentage thresholds should escalate
- Notifications should be created for appropriate roles

To automate this, you'll need to set up a cron job (covered in "Optional Enhancements" below).

---

## Step 10: Production Checklist

Before going live with real clients:

- [ ] All migrations run successfully
- [ ] Organizations created and users linked
- [ ] Programs linked to client organizations
- [ ] Notification bell shows real-time updates
- [ ] Custom escalation settings save correctly
- [ ] Manual escalation creates notifications
- [ ] Multi-client isolation verified (Client A can't see Client B)
- [ ] Proof approval workflow tested
- [ ] Video recording works on mobile devices
- [ ] All user roles tested (5 roles)

---

## Optional Enhancements

### 1. Email Notifications (Edge Function)

**Why**: Currently only in-app notifications work. Email queue is ready but needs Edge Function to process.

**Time**: ~5 hours

**Steps**:
1. Create Supabase Edge Function
2. Integrate with Resend or SendGrid
3. Process `escalation_notifications` table queue
4. Send emails with escalation details + call-to-action links

### 2. SMS/WhatsApp Integration

**Why**: Critical (Level 3) escalations should send SMS/WhatsApp for immediate attention.

**Time**: ~3 hours

**Steps**:
1. Set up Twilio account
2. Create Edge Function for SMS/WhatsApp delivery
3. Process queue from `escalation_notifications` table
4. Send critical alerts via SMS

### 3. Automated Escalation Checker (Cron Job)

**Why**: Currently escalations must be triggered manually. This automates percentage-based checks.

**Time**: ~1 hour

**Steps**:
1. Create Supabase Edge Function
2. Schedule to run every 15 minutes
3. Calls `check_and_trigger_unit_escalations_v2()`

---

## Troubleshooting

### Issue: Notification bell doesn't update in real-time

**Fix**: Check browser console for Supabase subscription errors. Ensure:
- Supabase Realtime is enabled for `in_app_notifications` table
- RLS policies allow users to read their own notifications

```sql
-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE in_app_notifications;
```

### Issue: Manual escalation button doesn't appear

**Fix**: Ensure you're logged in as `WORKSTREAM_LEAD`, `PROGRAM_OWNER`, or `PLATFORM_ADMIN`. Other roles cannot escalate.

### Issue: Client A can see Client B's programs

**Fix**: RLS policies may not be enabled. Check:

```sql
-- Verify RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND tablename = 'programs';

-- If rowsecurity is false, enable it
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;

-- Verify policies exist
SELECT * FROM pg_policies WHERE tablename = 'programs';
```

---

## Support

If you encounter issues:

1. Check Supabase logs (Database → Logs)
2. Check browser console for JavaScript errors
3. Verify migrations ran completely
4. Ensure RLS is enabled on all tables

---

Generated: 2026-01-08
Next: Test each step sequentially and report any errors

# Email Automation Setup Guide

## Current Status
✅ Database trigger creates notifications automatically when escalations occur
✅ Edge Function `send-escalation-emails` deployed and tested
⏳ Need to configure periodic/automatic email sending

## Option A: Event-Driven with Database Webhooks (Recommended)

Instead of polling, trigger email sending immediately when notifications are created.

### Setup in Supabase Dashboard:

1. **Navigate to Database > Webhooks**
2. **Create New Webhook:**
   - Name: `send-emails-on-notification-create`
   - Table: `escalation_notifications`
   - Events: `INSERT`
   - Type: `HTTP Request`
   - Method: `POST`
   - URL: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-escalation-emails`
   - HTTP Headers:
     ```json
     {
       "Content-Type": "application/json",
       "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"
     }
     ```

3. **Save and Test**

**Pros:**
- Immediate email delivery (no delay)
- More efficient (event-driven, not polling)
- No cron setup needed

**Cons:**
- One webhook call per notification (fine for normal volume)

---

## Option B: Periodic Batch Sending with External Cron

Use a free external cron service to invoke the Edge Function every 10 minutes.

### Setup with cron-job.org:

1. **Go to https://cron-job.org** and create account
2. **Create New Cronjob:**
   - Title: `Celestar Email Sender`
   - URL: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-escalation-emails`
   - Schedule: `*/10 * * * *` (every 10 minutes)
   - Request Method: `POST`
   - Request Headers:
     ```
     Content-Type: application/json
     Authorization: Bearer YOUR_SERVICE_ROLE_KEY
     ```
   - Request Body: `{}`

3. **Save and Enable**

**Pros:**
- Batches multiple emails per run (efficient for high volume)
- External service (doesn't use Supabase resources)
- Easy to configure

**Cons:**
- Up to 10-minute delay before email sent

---

## Option C: Supabase pg_cron Extension (Advanced)

If you have access to Supabase database extensions:

```sql
-- Enable pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule job (every 10 minutes)
SELECT cron.schedule(
  'send-escalation-emails-job',
  '*/10 * * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-escalation-emails',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
      ),
      body := '{}'::jsonb
    );
  $$
);

-- Verify job created
SELECT * FROM cron.job;
```

**Note:** `pg_cron` may not be available on all Supabase plans. Check your plan features.

---

## Recommendation

**For Production:** Use **Option A (Database Webhooks)** for immediate email delivery.

**For High Volume:** Use **Option B (External Cron)** to batch emails and reduce webhook calls.

---

## Testing the Complete Workflow

Once you've set up automation (any option above), test end-to-end:

### 1. Create a Test Escalation

```sql
-- Insert a test escalation (will trigger email notification automatically)
INSERT INTO unit_escalations (
  unit_id,
  escalation_level,
  escalated_by,
  reason,
  status
)
VALUES (
  'YOUR_UNIT_ID',  -- Replace with actual unit ID
  1,               -- Level 1 escalation
  auth.uid(),      -- Current user
  'Testing automated email workflow',
  'pending'
);
```

### 2. Verify Notification Created

```sql
-- Check that notification was auto-created by trigger
SELECT * FROM escalation_notifications
WHERE status = 'pending'
ORDER BY created_at DESC
LIMIT 1;
```

### 3. Check Email Sent

Within 10 minutes (or immediately if using webhooks), check:

```sql
-- Verify notification status changed to 'sent'
SELECT * FROM escalation_notifications
WHERE status = 'sent'
ORDER BY sent_at DESC
LIMIT 1;
```

### 4. Verify Email Received

Check the recipient's inbox for the escalation email.

---

## Monitoring and Logs

### Check Edge Function Logs:
In Supabase Dashboard → Edge Functions → send-escalation-emails → Logs

### Check Notification Status:
```sql
SELECT
  status,
  COUNT(*) as count
FROM escalation_notifications
GROUP BY status;
```

### Recent Failed Notifications:
```sql
SELECT
  recipient_email,
  error_message,
  created_at
FROM escalation_notifications
WHERE status = 'failed'
ORDER BY created_at DESC
LIMIT 10;
```

---

## Production Checklist

- [ ] Choose automation method (Webhook / Cron / pg_cron)
- [ ] Configure automation with correct Supabase URL and Service Role Key
- [ ] Test end-to-end workflow with real escalation
- [ ] Verify email received with correct formatting
- [ ] Monitor logs for any errors
- [ ] Set up alerting for failed notifications (optional)

---

## Security Notes

- **Service Role Key:** Keep this secret! It bypasses RLS policies.
- **Webhook/Cron URLs:** Anyone with the URL could trigger emails. Consider adding additional authentication if needed.
- **Rate Limiting:** Resend has sending limits on free tier. Monitor usage.

---

## Next Steps After Setup

1. Test the complete workflow
2. Run final production readiness verification
3. Deploy to production 🚀

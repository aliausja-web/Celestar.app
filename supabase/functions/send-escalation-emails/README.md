# Send Escalation Emails - Supabase Edge Function

This Edge Function processes pending escalation email notifications and sends them via Resend.

---

## Setup Instructions

### 1. Install Supabase CLI

```bash
# Windows (PowerShell)
scoop install supabase

# Or download from: https://github.com/supabase/cli/releases
```

### 2. Login to Supabase CLI

```bash
supabase login
```

Follow the prompts to authenticate.

### 3. Link to Your Supabase Project

```bash
supabase link --project-ref YOUR_PROJECT_REF
```

Find your project ref in Supabase Dashboard → Project Settings → General → Reference ID

### 4. Set Secrets

```bash
# Set Resend API Key
supabase secrets set RESEND_API_KEY=re_your_api_key_here

# Supabase URL and Service Role Key are automatically available
```

### 5. Deploy the Function

```bash
cd supabase/functions
supabase functions deploy send-escalation-emails
```

---

## Testing

### Manual Test (Call the function directly)

```bash
supabase functions invoke send-escalation-emails --method POST
```

### Create a Test Email Notification

In Supabase SQL Editor:

```sql
-- Insert a test email notification
INSERT INTO escalation_notifications (
  escalation_id,
  recipient_user_id,
  recipient_email,
  recipient_name,
  channel,
  subject,
  message,
  template_data,
  status
) VALUES (
  (SELECT id FROM unit_escalations ORDER BY created_at DESC LIMIT 1), -- Latest escalation
  (SELECT user_id FROM profiles WHERE email = 'your-email@example.com'), -- Your user ID
  'your-email@example.com', -- Your actual email
  'Test User',
  'email',
  'Test Escalation Email',
  'This is a test escalation notification to verify email delivery.',
  '{"unit_title": "Test Unit", "escalation_level": 2, "priority": "high"}'::jsonb,
  'pending'
);

-- Then invoke the function
-- It will pick up the pending email and send it
```

### Check Logs

```bash
supabase functions logs send-escalation-emails
```

---

## Automation Options

### Option 1: Call from API (Current Implementation)

When escalation happens, the API creates a `pending` email notification. Then you manually call:

```typescript
// In your Next.js API after creating escalation
await fetch('https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-escalation-emails', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  },
});
```

### Option 2: Database Trigger (Automatic)

Create a trigger that calls the Edge Function whenever a new `escalation_notification` is created:

```sql
-- Create a webhook to call Edge Function on insert
CREATE OR REPLACE FUNCTION notify_new_escalation_email()
RETURNS TRIGGER AS $$
DECLARE
  function_url text := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-escalation-emails';
BEGIN
  PERFORM net.http_post(
    url := function_url,
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
    body := '{}'::jsonb
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_escalation_notification_created
AFTER INSERT ON escalation_notifications
FOR EACH ROW
WHEN (NEW.status = 'pending' AND NEW.channel = 'email')
EXECUTE FUNCTION notify_new_escalation_email();
```

### Option 3: Cron Job (Every 5 minutes)

In Supabase Dashboard → Database → Cron Jobs:

```sql
-- Process pending emails every 5 minutes
SELECT cron.schedule(
  'process-escalation-emails',
  '*/5 * * * *', -- Every 5 minutes
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-escalation-emails',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

---

## Monitoring

### Check Email Status

```sql
-- See all email statuses
SELECT
  recipient_email,
  subject,
  status,
  sent_at,
  delivery_status,
  error_message,
  created_at
FROM escalation_notifications
WHERE channel = 'email'
ORDER BY created_at DESC
LIMIT 20;
```

### Resend Dashboard

Go to https://resend.com/emails to see:
- Delivery status
- Open rates
- Click rates
- Bounce reports

---

## Troubleshooting

### Emails not sending?

1. **Check pending emails exist:**
   ```sql
   SELECT COUNT(*) FROM escalation_notifications WHERE status = 'pending' AND channel = 'email';
   ```

2. **Check function logs:**
   ```bash
   supabase functions logs send-escalation-emails --tail
   ```

3. **Verify Resend API key:**
   ```bash
   supabase secrets list
   ```

4. **Test Resend directly:**
   ```bash
   curl -X POST https://api.resend.com/emails \
     -H "Authorization: Bearer YOUR_RESEND_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"from":"notifications@celestar.app","to":"test@example.com","subject":"Test","html":"Test"}'
   ```

### Domain not verified?

If `celestar.app` domain isn't verified yet in Resend:
- Temporarily use: `onboarding@resend.dev` as the "from" address
- Add your email to "to" field in Resend dashboard for testing

---

## Email Template Preview

The emails will look like this:

```
┌──────────────────────────────────┐
│  🚨 CRITICAL Escalation Alert    │  ← Red/Orange/Blue header
├──────────────────────────────────┤
│                                  │
│  Hi John Smith,                  │
│                                  │
│  ┌────────────────────────────┐ │
│  │ Critical issue reported:   │ │
│  │ "Venue has water damage"   │ │
│  └────────────────────────────┘ │
│                                  │
│  Unit: Install Stage Rigging     │
│  Escalation Level: Level 3       │
│  Reason: Water leak in venue     │
│                                  │
│     [ View in Portal ]           │
│                                  │
├──────────────────────────────────┤
│  This is an automated notif...   │
│  © 2026 Celestar                 │
└──────────────────────────────────┘
```

---

## Cost Estimation

**Resend Free Tier:**
- 3,000 emails/month free
- 100 emails/day free

**Typical usage:**
- 10 programs × 5 escalations/month = 50 escalations
- 3 recipients per escalation = 150 emails/month
- **Well within free tier**

**Supabase Edge Functions:**
- 500K requests/month free
- Email processing uses ~1 request per email
- **Well within free tier**

---

Generated: 2026-01-08
Function: send-escalation-emails
Version: 1.0

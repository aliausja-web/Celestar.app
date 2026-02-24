# Email Notifications Quick Start Guide

Get escalation emails working in 15 minutes.

---

## Step 1: Get Resend API Key (3 minutes)

1. Go to  
2. Sign up with your email
3. Verify your email
4. Click **"API Keys"** in left sidebar
5. Click **"Create API Key"**
6. Name it: `Celestar Production`
7. **Copy the key** (starts with `re_...`) - you'll need it in Step 3

---

## Step 2: Add Your Domain to Resend (5 minutes)

1. In Resend, click **"Domains"** → **"Add Domain"**
2. Enter: `celestar.app`
3. Resend shows DNS records to add
4. Go to **GoDaddy** → Your domain → **DNS Management**
5. Add these 3 records Resend shows you:
   - **MX record** (for bounces)
   - **TXT record** (for SPF authentication)
   - **CNAME record** (for DKIM signing)
6. Wait 5-10 minutes for DNS propagation
7. Back in Resend, click **"Verify Domain"**

**Note**: While waiting for verification, you can test with `onboarding@resend.dev` as sender.

---

## Step 3: Deploy Edge Function (7 minutes)

### Install Supabase CLI

**Windows:**
```powershell
scoop install supabase
```

**Mac:**
```bash
brew install supabase/tap/supabase
```

**Or download**: https://github.com/supabase/cli/releases

### Deploy

```bash
# 1. Login to Supabase
supabase login

# 2. Link to your project (get project ref from Supabase dashboard)
supabase link --project-ref YOUR_PROJECT_REF

# 3. Set your Resend API key
supabase secrets set RESEND_API_KEY=re_your_key_from_step_1

# 4. Deploy the function
cd supabase/functions
supabase functions deploy send-escalation-emails
```

---

## Step 4: Test It Works (2 minutes)

### Create a test email notification:

In Supabase SQL Editor:

```sql
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
  (SELECT id FROM unit_escalations ORDER BY created_at DESC LIMIT 1),
  (SELECT user_id FROM profiles WHERE email = 'admin@celestar.com'),
  'admin@celestar.com', -- Replace with your actual email
  'Your Name',
  'email',
  '🚨 Test Escalation Email',
  'This is a test to verify email delivery is working correctly.',
  '{"unit_title": "Test Unit", "escalation_level": 2, "priority": "high"}'::jsonb,
  'pending'
);
```

### Trigger the function:

```bash
supabase functions invoke send-escalation-emails --method POST
```

### Check your inbox!

You should receive a formatted email from `notifications@celestar.app`.

---

## Step 5: Automate It (Choose One)

### Option A: Call from API (Manual)

After creating escalations, call the Edge Function:

```typescript
// Add to your escalation API
await fetch(`${SUPABASE_URL}/functions/v1/send-escalation-emails`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  },
});
```

### Option B: Cron Job (Automatic - Recommended)

In Supabase Dashboard → Database → Cron Jobs, create a new job:

**Name**: `process-escalation-emails`
**Schedule**: `*/5 * * * *` (every 5 minutes)
**SQL**:
```sql
SELECT net.http_post(
  url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-escalation-emails',
  headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
  body := '{}'::jsonb
);
```

**Replace**:
- `YOUR_PROJECT_REF` with your Supabase project reference
- `YOUR_ANON_KEY` with your Supabase anon key (from Project Settings → API)

This will automatically process pending emails every 5 minutes.

---

## Troubleshooting

### "Domain not verified" error?

Temporarily use Resend's test domain while DNS propagates:

In `supabase/functions/send-escalation-emails/index.ts`, change line 64:

```typescript
from: 'Celestar Alerts <onboarding@resend.dev>', // Temporary test address
```

### No emails sending?

Check pending emails exist:
```sql
SELECT * FROM escalation_notifications WHERE status = 'pending' AND channel = 'email';
```

View function logs:
```bash
supabase functions logs send-escalation-emails --tail
```

### Emails going to spam?

This happens if domain isn't verified. Complete Step 2 (Add Domain to Resend) and wait for DNS verification.

---

## What Happens Now

✅ **Automatic Alerts** (50%, 75%, 90%) → Create email queue → Cron sends emails
✅ **Manual Escalations** (Escalate button) → Create email queue → Cron sends emails
✅ **In-app notifications** → Still work (bell icon)

**Both systems now send emails!**

---

## Cost

**Free for your scale:**
- Resend: 3,000 emails/month free
- Supabase Edge Functions: 500K requests/month free
- Typical usage: ~150 emails/month (well within free tier)

---

## Next Steps

1. ✅ Complete Steps 1-4 to get emails working
2. ✅ Set up automation (Step 5)
3. Test with a real escalation scenario
4. Monitor emails in Resend dashboard: https://resend.com/emails

---

**Questions?** Check [supabase/functions/send-escalation-emails/README.md](supabase/functions/send-escalation-emails/README.md) for detailed documentation.

Generated: 2026-01-08
Status: Ready to Deploy

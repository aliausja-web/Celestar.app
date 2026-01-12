# Email Alert Types - Production Ready

## Overview
The system sends two distinct types of email notifications, clearly differentiated to avoid client confusion:

---

## 1. 🚨 MANUAL ESCALATIONS (Site Issue Reports)

### Purpose
Urgent site issues reported by team members requiring immediate attention.

### Trigger
- User clicks "Escalate" button in the portal
- Provides a reason explaining the site issue

### Email Format
```
Subject: 🚨 [MANUAL ESCALATION] Level X: Unit Title
Body:
MANUAL SITE ISSUE ESCALATION

Unit: "..."
Workstream: "..."
Program: ...
Escalation Level: X

Reason: [User's reported issue]

This is a manual escalation reported by a team member regarding
a site issue. Please review and respond immediately.
```

### Recipients (by escalation level)
- Level 1 → WORKSTREAM_LEAD
- Level 2 → PROGRAM_OWNER
- Level 3 → PLATFORM_ADMIN

### Priority
- Always HIGH or CRITICAL
- Requires immediate human response

---

## 2. ⏰ AUTOMATIC ALERTS (Deadline Breaches)

### Purpose
Automated notifications when units exceed deadline thresholds.

### Trigger
- Cron job runs every 5-15 minutes
- Detects RED status units past deadline
- Automatically creates escalation

### Email Format
```
Subject: ⏰ [AUTOMATIC ALERT] Level X: Unit Title (X min overdue)
Body:
AUTOMATIC DEADLINE ALERT

Unit: "..."
Workstream: "..."
Program: ...
Alert Level: X
Time Past Deadline: X minutes

This unit has exceeded its deadline threshold and requires attention.
This is an automated alert based on deadline tracking.

Please review and take appropriate action.
```

### Recipients (by escalation level)
- Level 1 → WORKSTREAM_LEAD
- Level 2 → PROGRAM_OWNER
- Level 3 → PLATFORM_ADMIN

### Priority
- Level 1 → NORMAL
- Level 2 → HIGH
- Level 3 → CRITICAL

---

## Key Differences

| Aspect | Manual Escalation | Automatic Alert |
|--------|------------------|-----------------|
| **Subject prefix** | 🚨 [MANUAL ESCALATION] | ⏰ [AUTOMATIC ALERT] |
| **Body header** | MANUAL SITE ISSUE ESCALATION | AUTOMATIC DEADLINE ALERT |
| **Trigger** | User action + reason | Cron job + deadline logic |
| **Contains** | User's reason for site issue | Minutes past deadline |
| **Urgency** | Always HIGH/CRITICAL | Escalates over time (NORMAL→CRITICAL) |
| **Response expectation** | Immediate human intervention | Review and action as appropriate |
| **Database type** | `escalation_type = 'manual'` | `escalation_type = 'automatic'` |

---

## Email Delivery System

### Infrastructure
- **Edge Function:** `/supabase/functions/send-escalation-emails`
- **Email Service:** Resend API (Amazon SES)
- **From Address:** `Celestar Alerts <notifications@celestar.app>`
- **Processing:** Batch (50 notifications per run)
- **Cron Schedule:** Every 10 minutes
- **Tracking:** Full delivery status in `escalation_notifications` table

### Email Template Features
- Professional HTML formatting
- Dynamic priority color coding (red/orange/blue)
- Priority emoji indicators
- Unit information table
- Direct action button to portal
- Mobile-responsive design

---

## Testing Email Alerts

To test both email types:

### Test Manual Escalation
1. Login to portal as WORKSTREAM_LEAD or PROGRAM_OWNER
2. Navigate to a unit
3. Click "Escalate" button
4. Provide reason: "Test site issue - equipment malfunction"
5. Submit
6. Check recipient email for `🚨 [MANUAL ESCALATION]` email

### Test Automatic Alert
1. Create a unit with past deadline
2. Set status to RED (not verified)
3. Wait 5-15 minutes for cron job
4. Check recipient email for `⏰ [AUTOMATIC ALERT]` email

---

## Database Structure

### Tables Involved
- `unit_escalations` - Tracks both manual and automatic escalations
- `escalation_notifications` - Email queue with status tracking
- `in_app_notifications` - Portal bell notifications
- `profiles` - User roles and email addresses

### Escalation Type Field
```sql
escalation_type text CHECK (escalation_type IN ('automatic', 'manual'))
```

### Status Tracking
```sql
status text CHECK (status IN ('pending', 'sent', 'failed', 'read'))
```

---

## Production Readiness

✅ Both email types fully implemented
✅ Clear visual and content differentiation
✅ Proper recipient routing by role and level
✅ Automatic retry on failure
✅ Full delivery tracking and logging
✅ Cron jobs configured and running
✅ Resend API integrated with SES
✅ Email templates tested and styled
✅ Database triggers operational

**Status:** READY FOR PRODUCTION TESTING

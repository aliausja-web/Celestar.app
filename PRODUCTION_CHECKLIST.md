# Production Deployment Checklist

Before going live with real clients, verify all systems are working.

---

## ✅ Core Features Verification

### 1. Authentication & Authorization
- [ ] Platform Admin can log in
- [ ] Program Owner can log in
- [ ] Workstream Lead can log in
- [ ] Field Contributor can log in
- [ ] Client Viewer can log in (read-only access works)

### 2. Multi-Client Isolation
- [ ] Created 2 test client organizations
- [ ] Verified Client A cannot see Client B's programs
- [ ] Verified Platform Admin can see ALL programs
- [ ] Verified Client Viewer only sees their organization's data

### 3. Programs & Workstreams
- [ ] Can create new program
- [ ] Can create workstreams within program
- [ ] Program dashboard shows correct completion percentages
- [ ] Workstream cards display correctly (RED/GREEN status)

### 4. Units (Tasks)
- [ ] Can create new unit with all fields
- [ ] Acceptance criteria field saves correctly
- [ ] Proof requirements configuration works
- [ ] Custom escalation thresholds save (50%, 75%, 90%)
- [ ] Urgency Alert Settings collapse/expand works

### 5. Proof Upload & Approval
- [ ] Field Contributor can upload photo proof
- [ ] Field Contributor can record video proof
- [ ] Video recording works on mobile devices
- [ ] Proof timestamps are captured correctly
- [ ] Program Owner can approve proofs
- [ ] Workstream Lead can approve proofs
- [ ] Separation of duties enforced (owner cannot approve own proofs)
- [ ] Unit turns GREEN after required proofs approved

### 6. Notification System
- [ ] Notification bell appears in header
- [ ] Unread count badge shows correctly
- [ ] Clicking notification navigates to correct page
- [ ] Mark as read functionality works
- [ ] Real-time updates work (notifications appear without refresh)

### 7. Manual Escalation
- [ ] "Escalate" button appears on RED units
- [ ] Escalation dialog requires reason field
- [ ] Manual escalation creates notifications for target roles
- [ ] Escalation level increases correctly (0 → 1 → 2 → 3)
- [ ] Cannot escalate beyond Level 3

### 8. Automatic Escalation (Optional)
- [ ] Created test unit with past deadline
- [ ] Manually triggered escalation checker function
- [ ] Verified escalations were created based on % thresholds
- [ ] Verified notifications were sent to correct roles

---

## 🔒 Security Verification

### Row Level Security (RLS)
- [ ] Programs table has RLS enabled
- [ ] Workstreams table has RLS enabled
- [ ] Units table has RLS enabled
- [ ] Profiles table has RLS enabled
- [ ] Organizations table has RLS enabled

### Data Isolation
- [ ] Client A user query returns ONLY Client A data
- [ ] Client B user query returns ONLY Client B data
- [ ] Platform Admin query returns ALL data
- [ ] Proof approval enforces separation of duties

---

## 📊 Database Verification

### Tables Created
- [ ] `organizations` table exists
- [ ] `in_app_notifications` table exists
- [ ] `escalation_notifications` table exists
- [ ] `escalation_attention_log` table exists
- [ ] `units.escalation_config` column exists

### Initial Data Seeded
- [ ] Platform Admin Organization created
- [ ] At least one client organization created
- [ ] All users linked to organizations
- [ ] All programs linked to client organizations

---

## 🚀 Performance & UX

### Page Load Times
- [ ] Login page loads < 2 seconds
- [ ] Programs dashboard loads < 3 seconds
- [ ] Workstream details page loads < 2 seconds
- [ ] Unit creation form loads instantly

### Mobile Responsiveness
- [ ] Login page works on mobile
- [ ] Program cards display correctly on mobile
- [ ] Proof upload works on mobile camera
- [ ] Video recording works on mobile
- [ ] Notification bell accessible on mobile

---

## 📱 Optional Enhancements (Not Required for Launch)

These can be added later as needed:

### Email Notifications
- [ ] Supabase Edge Function for email delivery
- [ ] Resend or SendGrid integration
- [ ] Email templates designed
- [ ] Email queue processing works

### SMS/WhatsApp Notifications
- [ ] Twilio account set up
- [ ] SMS delivery for critical (Level 3) escalations
- [ ] WhatsApp integration for program updates

### Automated Escalation Checker
- [ ] Supabase Edge Function created
- [ ] Cron job scheduled (every 15 minutes)
- [ ] Function calls `check_and_trigger_unit_escalations_v2()`
- [ ] Verified escalations trigger automatically

---

## 🎯 Pre-Launch Final Steps

### 1. Clean Up Demo Data
```sql
-- Delete demo notifications
DELETE FROM in_app_notifications WHERE title LIKE '%Test%';

-- Verify demo accounts are properly labeled
SELECT email, role FROM profiles WHERE email LIKE '%@celestar.com';
```

### 2. Verify Environment Variables
- [ ] Supabase URL is production URL
- [ ] Supabase Anon Key is production key
- [ ] Netlify environment variables set correctly

### 3. DNS & Domain
- [ ] Custom domain configured (if applicable)
- [ ] SSL certificate active
- [ ] Domain points to Netlify deployment

### 4. Backup & Monitoring
- [ ] Supabase automatic backups enabled
- [ ] Point-in-time recovery configured
- [ ] Error tracking set up (Sentry/LogRocket optional)

---

## 🆘 Support Resources

### Documentation
- ✅ [PRODUCTION_READY_SUMMARY.md](PRODUCTION_READY_SUMMARY.md) - Full feature overview
- ✅ [POST_MIGRATION_SETUP.md](POST_MIGRATION_SETUP.md) - Step-by-step setup guide
- ✅ [ONBOARDING_NEW_CLIENTS.md](ONBOARDING_NEW_CLIENTS.md) - How to add new clients

### Troubleshooting
- **Notification bell not showing**: Check Netlify deployment logs
- **RLS blocking queries**: Verify user's organization_id is set
- **Escalations not triggering**: Check escalation_config column in units table
- **Client isolation not working**: Verify client_organization_id on programs

---

## ✨ You're Production Ready When...

✅ All core features work correctly
✅ Multi-client isolation verified with 2+ test clients
✅ Notifications display and update in real-time
✅ Proof approval workflow complete with separation of duties
✅ Custom escalation thresholds save and apply correctly
✅ Mobile experience is smooth (especially video recording)

---

**Ready to launch?** Start onboarding your first real client using [ONBOARDING_NEW_CLIENTS.md](ONBOARDING_NEW_CLIENTS.md)!

Generated: 2026-01-08
System: Celestar v2.0 - Production Ready

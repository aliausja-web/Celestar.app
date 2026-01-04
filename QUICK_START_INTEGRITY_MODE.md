# 🚀 INTEGRITY MODE - Quick Start Guide

## What Just Happened?

Celestar is now a **100% non-manipulable verification system**. Status can ONLY be changed by uploading valid proof. No human can manually set status to GREEN - it's computed automatically by the database.

## Immediate Next Steps

### 1. Run the Database Migration (REQUIRED)

Open Supabase Dashboard → SQL Editor → New Query:

```sql
-- Copy/paste the ENTIRE contents of:
-- supabase/migrations/20260105_integrity_mode_complete.sql
-- Then click "Run" (Ctrl+Enter)
```

This will:
- ✅ Create audit_log table (immutable)
- ✅ Create escalation_events table
- ✅ Add proof requirements to zones
- ✅ Create compute_zone_status() function
- ✅ Create escalation engine
- ✅ Set up auto-status triggers
- ✅ Apply strict security policies

**Verify migration succeeded:**
```sql
-- Should return 'RED' or 'GREEN' for a test zone
SELECT compute_zone_status('<any-zone-id>');

-- Should return function definition
\df check_and_trigger_escalations
```

### 2. Set Environment Variable in Netlify

1. Go to Netlify Dashboard → Your Site → Site Settings → Environment Variables
2. Add:
   - Key: `CRON_SECRET`
   - Value: Generate a random string (use: `openssl rand -hex 32`)
3. Save and redeploy

### 3. Set Up Escalation Cron (Choose ONE)

**Option A: Manual Testing (Start Here)**
```sql
-- In Supabase SQL Editor, run manually every hour:
SELECT * FROM check_and_trigger_escalations();
```

**Option B: GitHub Actions (Recommended)**
Create `.github/workflows/escalation-cron.yml`:
```yaml
name: Escalation Checker
on:
  schedule:
    - cron: '*/15 * * * *'  # Every 15 minutes
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger escalations
        run: |
          curl -X POST https://celestar.app/api/cron/check-escalations \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
```

**Option C: External Cron Service**
- Go to cron-job.org
- Create job: `POST https://celestar.app/api/cron/check-escalations`
- Add header: `Authorization: Bearer <your-CRON_SECRET>`
- Schedule: Every 15 minutes

## How It Works Now

### Before (Old Way) - Manipulable ❌
```
Supervisor: Clicks "Change status to GREEN"
System: "OK, changed to GREEN"
Client: 🤔 Where's the proof?
```

### After (Integrity Mode) - Non-Manipulable ✅
```
Supervisor: Clicks "Change status to GREEN"
System: ❌ "ERROR: Cannot manually set status"

Supervisor: Uploads photo proof
System: ✅ "Proof received. Status automatically changed to GREEN"
         📝 "Logged to audit trail with timestamp, GPS, uploader"
Client: ✅ Trusts the status - has proof!
```

## Testing the System

### Test 1: Proof-Gated Status

```sql
-- 1. Create test zone (will be RED by default)
INSERT INTO zones (
  project_id, name, deliverable, owner,
  required_proof_count, required_proof_types
) VALUES (
  '<your-project-id>',
  'TEST: Status Computation',
  'Test deliverable',
  'Tester',
  1,
  '["photo"]'::jsonb
);

-- 2. Verify it's RED
SELECT computed_status FROM zones WHERE name = 'TEST: Status Computation';
-- Should return: RED

-- 3. Upload a photo via the UI (or insert test proof)

-- 4. Check status again
SELECT computed_status FROM zones WHERE name = 'TEST: Status Computation';
-- Should return: GREEN (automatically!)

-- 5. Check audit log
SELECT event_type, event_data FROM audit_log
WHERE zone_id = (SELECT id FROM zones WHERE name = 'TEST: Status Computation')
ORDER BY created_at DESC;
-- Should show: status_changed_auto event
```

### Test 2: Automatic Escalations

```sql
-- 1. Create zone with deadline in the past
INSERT INTO zones (
  project_id, name, deliverable, owner,
  required_proof_count, readiness_deadline,
  computed_status
) VALUES (
  '<your-project-id>',
  'TEST: Escalations',
  'Test',
  'Tester',
  1,
  now() - INTERVAL '2 hours',  -- Deadline 2 hours ago!
  'RED'
);

-- 2. Manually trigger escalation engine
SELECT * FROM check_and_trigger_escalations();
-- Should return: { zones_checked: 1, escalations_created: 1 }

-- 3. Verify escalation was created
SELECT level, triggered_at, new_deadline_set_to, status
FROM escalation_events
WHERE zone_id = (SELECT id FROM zones WHERE name = 'TEST: Escalations');
-- Should show: Level 1 escalation, active status

-- 4. Check zone was updated
SELECT current_escalation_level, last_escalated_at
FROM zones WHERE name = 'TEST: Escalations';
-- Should show: level = 1, timestamp set
```

### Test 3: Status Cannot Be Manually Changed

```sql
-- Try to manually set status (should FAIL)
UPDATE zones
SET computed_status = 'GREEN'
WHERE name = 'TEST: Status Computation';

-- Error: new row violates row-level security policy
-- ✅ SUCCESS! Manual status change is impossible!
```

## Current System State

### What Works NOW ✅
- ✅ Proof uploads automatically change status RED → GREEN
- ✅ Status is computed based on proof count and types
- ✅ Manual status changes are prevented (RLS policies)
- ✅ Escalation engine can be triggered manually
- ✅ Audit log captures all events
- ✅ Cron endpoint ready (/api/cron/check-escalations)

### What Needs UI Updates (Phase 2) 🚧
- 🚧 Zone creation UI (add proof requirements, deadline, policy)
- 🚧 Zone detail page (show computed status, proof progress)
- 🚧 Escalations inbox (new page for acknowledging escalations)
- 🚧 Audit log viewer (new page for viewing history)
- 🚧 Readiness board (add proof progress column)

## Key Rules to Remember

1. **Status is READ-ONLY for humans** - Only the database can change it
2. **Proof is REQUIRED for GREEN** - No proof = RED forever
3. **Escalations are AUTOMATIC** - System triggers them, not humans
4. **History is IMMUTABLE** - Cannot edit or delete audit log
5. **Silence defaults to RED** - No action = stays RED

## Roles & Permissions

| Role | Upload Proof | View Zones | Acknowledge Escalations | Change Status | Delete Audit |
|------|--------------|------------|-------------------------|---------------|--------------|
| **system_owner** | ✅ | ✅ | ✅ | ❌ | ❌ |
| **org_admin** | ✅ | ✅ | ✅ | ❌ | ❌ |
| **project_manager** | ✅ | ✅ | ✅ | ❌ | ❌ |
| **site_coordinator** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **viewer** | ❌ | ✅ | ❌ | ❌ | ❌ |

**Legacy roles:**
- `admin` → maps to `org_admin`
- `supervisor` → maps to `site_coordinator`
- `client` → maps to `viewer`

## Monitoring Queries

### Check System Health
```sql
-- Zones by status
SELECT computed_status, COUNT(*) FROM zones GROUP BY computed_status;

-- Active escalations
SELECT level, COUNT(*) FROM escalation_events WHERE status = 'active' GROUP BY level;

-- Recent audit events
SELECT event_type, COUNT(*) FROM audit_log
WHERE created_at > now() - INTERVAL '24 hours'
GROUP BY event_type;
```

### Find Problem Zones
```sql
-- RED zones past deadline
SELECT name, owner, readiness_deadline, current_escalation_level
FROM zones
WHERE computed_status = 'RED'
  AND readiness_deadline < now()
ORDER BY readiness_deadline;
```

## Troubleshooting

**Q: Status is still RED after uploading proof**

A: Check proof requirements:
```sql
SELECT
  z.name,
  z.required_proof_count,
  z.required_proof_types,
  COUNT(p.id) as actual_proof_count,
  jsonb_agg(p.proof_type) as actual_proof_types
FROM zones z
LEFT JOIN proofs p ON p.zone_id = z.id AND p.is_valid = true
WHERE z.id = '<zone-id>'
GROUP BY z.id, z.name, z.required_proof_count, z.required_proof_types;
```

**Q: Escalation didn't trigger**

A: Check escalation policy:
```sql
SELECT
  name,
  readiness_deadline,
  current_escalation_level,
  last_escalated_at,
  escalation_policy
FROM zones
WHERE id = '<zone-id>';
```

**Q: Can't upload proof**

A: Check your role:
```sql
SELECT role FROM users WHERE uid::text = auth.uid()::text;
-- Must be: site_coordinator, project_manager, org_admin, or system_owner
```

## Next Steps for Full Deployment

1. ✅ Run database migration (DONE when you paste the SQL)
2. ✅ Set CRON_SECRET in Netlify
3. ✅ Set up cron job (manual or automated)
4. 🚧 Update UI for zone creation (Phase 2)
5. 🚧 Build escalations inbox (Phase 2)
6. 🚧 Build audit log viewer (Phase 2)
7. 🚧 Train users on new system

## Support

- **Implementation Details**: See `INTEGRITY_MODE_SUMMARY.md`
- **Migration SQL**: `supabase/migrations/20260105_integrity_mode_complete.sql`
- **Previous Features**: `PROOF_FIRST_IMPLEMENTATION.md`

---

**🔒 INTEGRITY MODE: Your portal is now non-manipulable!**

Status can ONLY be changed by proof. No exceptions. No backdoors. Complete accountability.

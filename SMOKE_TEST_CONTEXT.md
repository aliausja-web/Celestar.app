# CELESTAR SMOKE TEST CONTEXT

**Date:** 2026-01-19
**Build:** Production Release (9.5/10 Governance)
**Purpose:** Live simulation testing before commercial rollout

---

## EXECUTIVE SUMMARY

Celestar is a **multi-tenant execution readiness tracking platform** designed for enterprises managing complex programs with multiple deliverables requiring proof-based verification.

**Core Concept:** Track whether deliverables (units) are ready by requiring photographic/document proof that must be approved by authorized personnel before a unit turns "GREEN".

---

## ARCHITECTURE OVERVIEW

### Tech Stack
- **Frontend:** Next.js 14 (App Router), React, TailwindCSS, shadcn/ui
- **Backend:** Next.js API Routes (serverless)
- **Database:** Supabase (PostgreSQL with Row Level Security)
- **Auth:** Supabase Auth (email/password)
- **Storage:** Supabase Storage (proofs bucket)
- **Hosting:** Netlify (auto-deploys from GitHub)
- **Email:** Resend API (escalation notifications)

### Data Hierarchy
```
Organization (Tenant)
  └── Program (Initiative/Project)
        └── Workstream (Site/Phase/Discipline)
              └── Unit (Deliverable)
                    └── Proofs (Evidence)
                          └── Approval Workflow
```

### Multi-Tenancy
- Each organization is isolated via `org_id`
- Row Level Security (RLS) enforces at database level
- API layer adds defense-in-depth checks
- PLATFORM_ADMIN bypasses RLS (sees all)

---

## USER ROLES (5 Total)

| Role | Authority Level | Key Capabilities |
|------|-----------------|------------------|
| **PLATFORM_ADMIN** | God Mode | All access, manage users, view all orgs |
| **PROGRAM_OWNER** | Program-Level | Create programs, approve high-crit, unblock |
| **WORKSTREAM_LEAD** | Workstream-Level | Create workstreams/units, approve proofs, block |
| **FIELD_CONTRIBUTOR** | Data Entry | Create units (unconfirmed), upload proofs |
| **CLIENT_VIEWER** | Read-Only | View only, can propose escalations |

### Role Hierarchy
```
PLATFORM_ADMIN > PROGRAM_OWNER > WORKSTREAM_LEAD > FIELD_CONTRIBUTOR > CLIENT_VIEWER
```

---

## CORE FEATURES

### 1. Unit Status System

Units have **computed status** (never manually set):

| Status | Meaning | Color |
|--------|---------|-------|
| **RED** | Not ready (insufficient/unapproved proofs, past deadline) | Red |
| **GREEN** | Ready (all proof requirements met and approved) | Green |
| **BLOCKED** | Explicitly blocked by authorized user | Yellow |

**Status Computation Logic:**
```
1. IF is_blocked = true → BLOCKED
2. IF hard_dependencies not satisfied → RED
3. IF approved_proofs < required_count → RED
4. IF required_types not all present → RED
5. ELSE → GREEN
```

### 2. Proof Workflow

```
FIELD_CONTRIBUTOR uploads proof
        ↓
    Status: PENDING
        ↓
WORKSTREAM_LEAD reviews
        ↓
    ┌─────────────┐
    │   APPROVE   │ → Proof counts toward GREEN
    └─────────────┘
    ┌─────────────┐
    │   REJECT    │ → Proof invalid, uploader notified
    └─────────────┘
```

**Separation of Duties:**
- Uploader CANNOT approve their own proof
- WORKSTREAM_LEAD cannot approve high_criticality proofs (needs PROGRAM_OWNER)

**Proof Superseding:**
- When new proof approved, previous approved proofs marked `is_superseded = true`
- Allows safe corrections without "unapprove" action

### 3. Escalation System

**Automatic Escalations (Cron-triggered):**
- Based on deadline and time elapsed percentage
- Level 1: 50% time elapsed → notify WORKSTREAM_LEAD
- Level 2: 75% time elapsed → notify PROGRAM_OWNER
- Level 3: 90% time elapsed → notify PLATFORM_ADMIN

**Manual Escalations:**
- Any authorized user can escalate with reason
- WORKSTREAM_LEAD+ can mark as BLOCKED
- CLIENT_VIEWER can only propose (needs confirmation)

**BLOCKED Units Skip Alerts:**
- Once blocked, automatic escalations are suppressed
- Only PROGRAM_OWNER+ can unblock

### 4. Alert Profiles

| Profile | Thresholds |
|---------|------------|
| **STANDARD** | L1 @ 50%, L2 @ 75%, L3 @ 90% |
| **CRITICAL** | L1 @ 30%, L2 @ 60%, L3 @ 90% |
| **CUSTOM** | 1-5 thresholds, 0-100%, strictly increasing |

### 5. Attention Queue

Unified dashboard showing items requiring action:

| Item Type | Priority Base | Visible To |
|-----------|---------------|------------|
| Manual Escalation | 1000 | LEAD+ |
| Blocked Unit | 900 | LEAD+ |
| **Unconfirmed Unit** | 800 | LEAD+ (NEW) |
| Pending Proof | 700 | LEAD+ |
| Unit At Risk | 500 | LEAD+ |

**Priority Bonuses:**
- +100 per escalation level (max 300)
- +200 for high_criticality
- +50-200 for deadline urgency
- +up to 100 for age (hours)

### 6. Governance Locks (NEW)

#### Lock 1: Unconfirmed Unit Scope

**Problem:** FIELD_CONTRIBUTOR could create illegitimate units.

**Solution:**
- FIELD-created units marked `is_confirmed = false`
- Unconfirmed units excluded from workstream metrics
- WORKSTREAM_LEAD+ must confirm before counting
- Visible in Attention Queue as "Unconfirmed"

**FIELD Edit Restrictions:**
- Can only edit: `title`, `owner_party_name`
- Cannot modify: deadline, acceptance_criteria, proof requirements, escalation config, high_criticality

#### Lock 2: Archive Instead of Delete

**Problem:** Hard delete destroys audit trail.

**Solution:**
- DELETE operations now soft-delete (`is_archived = true`)
- Cascade archive for children
- Proofs and status_events preserved
- Archived items hidden from default lists
- Optional `include_archived=true` for ADMIN/OWNER

---

## API ENDPOINTS

### Programs
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/programs | All | List programs (excludes archived) |
| POST | /api/programs | OWNER+ | Create program |
| GET | /api/programs/[id] | All | Get program details |
| PATCH | /api/programs/[id] | OWNER+ | Update program |
| DELETE | /api/programs/[id] | OWNER+ | **Archive** program (cascade) |

### Workstreams
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/workstreams?program_id=X | All | List workstreams |
| POST | /api/workstreams | LEAD+ | Create workstream |
| GET | /api/workstreams/[id] | All | Get workstream with metrics |
| PATCH | /api/workstreams/[id] | LEAD+ | Update workstream |
| DELETE | /api/workstreams/[id] | OWNER+ | **Archive** workstream (cascade) |

### Units
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/units?workstream_id=X | All | List units (excludes archived) |
| POST | /api/units | FIELD+ | Create unit (auto-confirm if LEAD+) |
| GET | /api/units/[id] | All | Get unit with proofs |
| PATCH | /api/units/[id] | FIELD+ | Update unit (FIELD restricted) |
| DELETE | /api/units/[id] | OWNER+ | **Archive** unit |
| POST | /api/units/[id]/confirm | LEAD+ | Confirm unconfirmed unit |
| POST | /api/units/[id]/escalate | All | Manual escalation |
| POST | /api/units/[id]/unblock | OWNER+ | Remove BLOCKED status |

### Proofs
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /api/units/[id]/proofs | FIELD+ | Upload proof |
| GET | /api/units/[id]/proofs | All | List proofs |
| POST | /api/units/[id]/proofs/[pid]/approve | LEAD+ | Approve/reject proof |

### Admin
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/admin/stats | ADMIN | System statistics |
| GET | /api/admin/users | ADMIN | List all users |
| POST | /api/admin/create-rbac-user | ADMIN | Create user |
| PUT | /api/admin/users/[id] | ADMIN | Update user role |
| DELETE | /api/admin/users/[id] | ADMIN | Delete user |
| GET | /api/admin/organizations | ADMIN | List organizations |
| POST | /api/admin/organizations | ADMIN | Create organization |

### Other
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/attention-queue | LEAD+ | Get prioritized items |
| POST | /api/notifications/[id]/read | All | Mark notification read |
| GET | /api/cron/check-escalations | Cron | Trigger auto-escalations |

---

## DATABASE SCHEMA (Key Tables)

### organizations
```sql
id, name, created_at, metadata
```

### profiles
```sql
user_id, org_id, full_name, role (AppRole), email, created_at
```

### programs
```sql
id, name, description, owner_org, org_id, start_time, end_time,
is_archived, archived_at, archived_by,
created_at, created_by, created_by_email
```

### workstreams
```sql
id, program_id, name, type, ordering, overall_status,
is_archived, archived_at, archived_by,
last_update_time, created_at
```

### units
```sql
id, workstream_id, title, owner_party_name, required_green_by,
proof_requirements (jsonb), acceptance_criteria,
computed_status, current_escalation_level,
is_blocked, blocked_reason, blocked_at, blocked_by,
is_confirmed, confirmed_at, confirmed_by,
is_archived, archived_at, archived_by,
alert_profile, escalation_config (jsonb), high_criticality,
created_at, created_by
```

### unit_proofs
```sql
id, unit_id, type, url, captured_at, uploaded_at,
uploaded_by, uploaded_by_email,
approval_status (pending/approved/rejected),
approved_by, approved_by_email, approved_at, rejection_reason,
is_superseded, superseded_at, superseded_by, superseded_by_proof_id,
is_valid, validation_notes, metadata_exif, gps_latitude, gps_longitude
```

### unit_escalations
```sql
id, unit_id, workstream_id, program_id,
escalation_level, escalation_type (manual/automatic),
escalation_reason, triggered_at, status (active/resolved),
proposed_blocked, proposed_by_role,
acknowledged, acknowledged_by, acknowledged_at, acknowledgment_note
```

### unit_status_events (Append-Only Audit)
```sql
id, unit_id, event_type, old_status, new_status,
triggered_by, triggered_by_role, reason, metadata, created_at
```

**Event Types:**
- blocked, unblocked
- manual_escalation
- proof_approved, proof_rejected
- status_computed
- unit_confirmed, unit_archived, workstream_archived, program_archived

---

## BUSINESS RULES

### Rule 1: Separation of Duties
```
uploaded_by ≠ approved_by (enforced at API layer)
```

### Rule 2: High-Criticality Approval
```
high_criticality proofs require PROGRAM_OWNER or PLATFORM_ADMIN
```

### Rule 3: BLOCKED Authority
```
Only WORKSTREAM_LEAD+ can confirm BLOCKED status
CLIENT_VIEWER can propose but not confirm
```

### Rule 4: Unblock Authority
```
Only PROGRAM_OWNER or PLATFORM_ADMIN can unblock
```

### Rule 5: Unit Confirmation
```
FIELD_CONTRIBUTOR-created units require LEAD+ confirmation
Unconfirmed units excluded from metrics
```

### Rule 6: Archive Immutability
```
DELETE operations archive, never remove
Proofs and audit events preserved forever
```

### Rule 7: Tenant Isolation
```
Users can only see data from their organization
PLATFORM_ADMIN bypasses this restriction
Cross-tenant access returns 403 Forbidden
```

---

## UI PAGES

| Route | Purpose |
|-------|---------|
| `/login` | User authentication |
| `/programs` | Program list and selector |
| `/programs/new` | Create new program |
| `/programs/[id]` | Program detail |
| `/programs/[id]/workstreams/new` | Create workstream |
| `/workstreams/[id]` | Workstream board with units |
| `/workstreams/[id]/units/new` | Create unit |
| `/units/[id]` | Unit detail with proofs |
| `/units/[id]/upload` | Upload proof |
| `/attention-queue` | Prioritized action items |
| `/admin` | Admin dashboard |
| `/admin/users` | User management |
| `/admin/clients` | Organization management |
| `/admin/programs` | Program assignment |

---

## SMOKE TEST SCENARIOS

### Scenario 1: Full Lifecycle - Normal Path

**Setup:**
1. Create Organization "Acme Corp"
2. Create users: PROGRAM_OWNER, WORKSTREAM_LEAD, FIELD_CONTRIBUTOR

**Flow:**
1. PROGRAM_OWNER creates Program "Q1 Launch"
2. WORKSTREAM_LEAD creates Workstream "Site Prep"
3. WORKSTREAM_LEAD creates Unit "Foundation Inspection" (deadline: 7 days)
4. **Verify:** Unit status = RED, workstream has 1 red unit
5. FIELD_CONTRIBUTOR uploads photo proof
6. **Verify:** Proof status = pending, unit still RED
7. WORKSTREAM_LEAD approves proof
8. **Verify:** Proof status = approved, unit = GREEN, workstream = GREEN

### Scenario 2: FIELD Creates Unconfirmed Unit

**Flow:**
1. FIELD_CONTRIBUTOR creates Unit "Wall Framing"
2. **Verify:** Unit has "Unconfirmed" badge
3. **Verify:** Workstream metrics exclude this unit
4. **Verify:** Attention queue shows "Unconfirmed unit" item
5. WORKSTREAM_LEAD confirms unit
6. **Verify:** Unit now counts in metrics

### Scenario 3: FIELD Edit Restrictions

**Flow:**
1. FIELD_CONTRIBUTOR creates Unit
2. FIELD tries to PATCH deadline → **Verify:** 403 with "restricted fields"
3. FIELD tries to PATCH title → **Verify:** Success
4. LEAD PATCHes deadline → **Verify:** Success

### Scenario 4: Self-Approval Blocked

**Flow:**
1. WORKSTREAM_LEAD uploads proof
2. Same LEAD tries to approve own proof
3. **Verify:** 403 "Cannot approve own proof"

### Scenario 5: High-Criticality Approval

**Flow:**
1. Create unit with `high_criticality = true`
2. FIELD uploads proof
3. WORKSTREAM_LEAD tries to approve → **Verify:** 403
4. PROGRAM_OWNER approves → **Verify:** Success

### Scenario 6: BLOCKED Authority Chain

**Flow:**
1. CLIENT_VIEWER escalates with `mark_as_blocked = true`
2. **Verify:** Escalation has `proposed_blocked = true`
3. **Verify:** Unit is NOT actually blocked
4. WORKSTREAM_LEAD escalates with `mark_as_blocked = true`
5. **Verify:** Unit IS blocked, status = BLOCKED

### Scenario 7: Unblock Authority

**Flow:**
1. Unit is BLOCKED
2. WORKSTREAM_LEAD tries to unblock → **Verify:** 403
3. PROGRAM_OWNER unblocks → **Verify:** Success, status recomputed

### Scenario 8: Archive Instead of Delete

**Flow:**
1. Create Program → Workstream → Unit with proofs
2. PROGRAM_OWNER deletes program
3. **Verify:** Response says "archived"
4. **Verify:** Database has `is_archived = true` on program, workstream, unit
5. **Verify:** Proofs still exist
6. **Verify:** Program hidden from list (unless include_archived=true)

### Scenario 9: Proof Superseding

**Flow:**
1. Upload and approve Proof A
2. Upload and approve Proof B
3. **Verify:** Proof A has `is_superseded = true`
4. **Verify:** status_event logged with supersede count

### Scenario 10: Cross-Tenant Isolation

**Setup:**
- Org A with User A
- Org B with User B (different org_id)

**Flow:**
1. User A creates Program P1
2. User B tries to GET /api/programs/[P1 id]
3. **Verify:** 403 "cross-tenant access denied"

### Scenario 11: Automatic Escalation (If Cron Testable)

**Flow:**
1. Create unit with deadline in past (or mock time)
2. Trigger /api/cron/check-escalations
3. **Verify:** Escalation created, notification queued

### Scenario 12: BLOCKED Units Skip Alerts

**Flow:**
1. Create unit, mark as BLOCKED
2. Trigger escalation check
3. **Verify:** No escalation created for blocked unit

### Scenario 13: Attention Queue Role Visibility

**Flow:**
1. Create pending proof, unconfirmed unit, manual escalation
2. WORKSTREAM_LEAD views queue → **Verify:** All items visible
3. FIELD_CONTRIBUTOR views queue → **Verify:** Empty (no actionable items)
4. CLIENT_VIEWER views queue → **Verify:** Empty

### Scenario 14: Custom Alert Config Validation

**Flow:**
1. Create unit with `alert_profile = 'CUSTOM'`
2. Set `escalation_config.thresholds = [90, 75, 50]` (invalid - not increasing)
3. **Verify:** Database rejects with "strictly increasing" error

---

## KNOWN CONSTRAINTS

1. **Email requires valid Resend API key** - Escalation emails won't send without it
2. **Cron requires external trigger** - /api/cron/check-escalations must be called by scheduler
3. **File uploads require Supabase Storage** - Proof uploads need storage bucket configured
4. **RLS must be enabled** - Database security depends on RLS policies being active

---

## CRITICAL TECHNICAL NOTES (Updated Jan 2026)

### Database Column Names (IMPORTANT)

The `programs` table uses `org_id` NOT `organization_id`:
```sql
-- CORRECT
programs.org_id

-- WRONG (will cause errors)
programs.organization_id
```

The `profiles` table uses `organization_id`:
```sql
-- CORRECT
profiles.organization_id
```

### Table Names

Proofs are stored in `unit_proofs` table, NOT `proofs`:
```sql
-- CORRECT
FROM unit_proofs

-- WRONG (legacy table, may not have all columns)
FROM proofs
```

Storage bucket is named `proofs` (for file uploads).

### Columns That May Not Exist

These columns require migration `20260112_hardening_pass.sql`:
- `units.is_blocked`
- `units.blocked_reason`
- `units.blocked_at`
- `units.blocked_by`
- `units.high_criticality`

These columns require migration `20260119_governance_locks.sql`:
- `units.is_confirmed`
- `units.confirmed_at`
- `units.confirmed_by`
- `units.is_archived`
- `programs.is_archived`
- `workstreams.is_archived`

### API Routes Fixed (Jan 23, 2026)

| Route | Issue Fixed |
|-------|------------|
| `/api/workstreams/[id]` | Changed `organization_id` to `org_id` |
| `/api/units/[id]` | Changed `organization_id` to `org_id` |
| `/api/programs/[id]` | Changed `organization_id` to `org_id` |
| `/api/units/[id]/proofs` | Changed `proofs` to `unit_proofs` table |
| `/api/units/[id]/proofs/[proofId]/approve` | Changed `proofs` to `unit_proofs` table |
| `/api/units/route` | Changed `proofs` to `unit_proofs` table |
| `/api/units/[id]/escalate` | Added tenant isolation check |
| `/api/units/[id]/unblock` | Added tenant isolation check |
| `/api/attention-queue` | Changed `organization_id` to `org_id` |

---

## MIGRATION DEPENDENCY

Before testing, ensure these migrations have been run in order:

1. `20260112_distinguish_alert_types_in_emails.sql`
2. `20260112_hardening_pass.sql`
3. `20260113_close_governance_loopholes.sql`
4. `20260119_governance_locks.sql` ← **NEW (Unconfirmed + Archive)**

---

## TEST DATA RECOMMENDATIONS

### Minimum Required

1. **2 Organizations** (for cross-tenant testing)
2. **1 user per role** in each org (5 users per org = 10 total)
3. **1 Program** per org
4. **2 Workstreams** per program
5. **5 Units** per workstream (mix of RED, GREEN, BLOCKED, Unconfirmed)
6. **3 Proofs** per unit (pending, approved, rejected)

### Suggested Test Users

| Email | Role | Org |
|-------|------|-----|
| admin@celestar.app | PLATFORM_ADMIN | - (sees all) |
| owner@acme.com | PROGRAM_OWNER | Acme Corp |
| lead@acme.com | WORKSTREAM_LEAD | Acme Corp |
| field@acme.com | FIELD_CONTRIBUTOR | Acme Corp |
| client@acme.com | CLIENT_VIEWER | Acme Corp |
| owner@beta.com | PROGRAM_OWNER | Beta Inc |

---

## SUCCESS CRITERIA

The platform is commercially ready when:

- [ ] All 14 smoke test scenarios pass
- [ ] No cross-tenant data leakage
- [ ] FIELD_CONTRIBUTOR restrictions enforced
- [ ] Unconfirmed units excluded from metrics
- [ ] Archive preserves audit trail
- [ ] Separation of duties enforced
- [ ] High-criticality approval enforced
- [ ] BLOCKED authority chain works
- [ ] Attention queue shows correct items per role
- [ ] Email notifications sent (if API key configured)

---

**Platform Status:** READY FOR SMOKE TESTING

*Generated for Celestar Production Release - January 2026*

# CELESTAR LLM SMOKE TEST GUIDE

**Purpose:** Comprehensive testing guide for an LLM to validate all Celestar platform functionality
**Platform:** Execution Readiness Tracking System
**Version:** Production Release (9.5/10 Governance)

---

## PLATFORM OVERVIEW

Celestar is a multi-tenant execution readiness platform that tracks programs, workstreams, units (deliverables), and proofs. It features:
- Role-based access control (5 roles)
- Multi-level escalation system
- Proof approval workflow with separation of duties
- Attention queue for prioritized action items
- Email notifications for escalations

---

## USER ROLES & PERMISSIONS

### Role Hierarchy (Highest to Lowest Authority)

```
PLATFORM_ADMIN (God Mode)
    ↓
PROGRAM_OWNER (Program-Level Authority)
    ↓
WORKSTREAM_LEAD (Workstream-Level Authority)
    ↓
FIELD_CONTRIBUTOR (Data Entry Only)
    ↓
CLIENT_VIEWER (Read-Only Observer)
```

---

### ROLE 1: PLATFORM_ADMIN

**Description:** System-wide administrator with unrestricted access across all organizations.

**Login Context:**
```
Email: admin@celestar.app (example)
Organization: N/A (sees all organizations)
Typical User: Platform operator, system administrator
```

**Full Authority Matrix:**

| Area | Permission | Details |
|------|------------|---------|
| **Organizations** | CREATE | Create new client organizations |
| | READ | View all organizations |
| | UPDATE | Modify any organization |
| | DELETE | Remove organizations |
| **Users** | CREATE | Create users in any org with any role |
| | READ | View all users across platform |
| | UPDATE | Change any user's role or org |
| | DELETE | Remove any user |
| **Programs** | CREATE | Create programs in any org |
| | READ | View all programs (bypasses RLS) |
| | UPDATE | Modify any program |
| | DELETE | Delete any program (cascades) |
| **Workstreams** | CREATE | Create in any program |
| | READ | View all workstreams |
| | UPDATE | Modify any workstream |
| | DELETE | Delete any workstream |
| **Units** | CREATE | Create in any workstream |
| | READ | View all units |
| | UPDATE | Modify any unit |
| | DELETE | Delete any unit |
| | BLOCK | Mark any unit as BLOCKED |
| | UNBLOCK | Remove BLOCKED status |
| **Proofs** | UPLOAD | Upload to any unit |
| | APPROVE | Approve any proof (except own) |
| | REJECT | Reject any proof |
| **Escalations** | CREATE | Escalate any unit |
| | RESOLVE | Resolve any escalation |
| **Admin Dashboard** | ACCESS | Full access to /admin |
| | STATS | View system-wide statistics |
| **Attention Queue** | VIEW | See items from ALL organizations |

**Special Powers:**
- Bypasses Row Level Security (RLS) - sees all data
- Can approve HIGH CRITICALITY units
- Receives Level 3 escalation notifications
- Can impersonate other roles (if implemented)

**Test Scenarios for PLATFORM_ADMIN:**
```
Test A1: Cross-Org Access
  ACTION: View program from Organization B
  EXPECTED: Access granted (RLS bypass)

Test A2: Create User in Any Org
  ACTION: Create WORKSTREAM_LEAD in "Acme Corp"
  EXPECTED: User created, assigned to Acme Corp

Test A3: Unblock Unit
  ACTION: Unblock a BLOCKED unit
  EXPECTED: Unit unblocked, status recomputed

Test A4: High-Criticality Approval
  ACTION: Approve proof on high_criticality unit
  EXPECTED: Approval succeeds
```

---

### ROLE 2: PROGRAM_OWNER

**Description:** Senior manager responsible for one or more programs within their organization.

**Login Context:**
```
Email: owner@acmecorp.com (example)
Organization: Acme Corporation (org_id: uuid)
Typical User: Project director, program manager, department head
```

**Authority Matrix:**

| Area | Permission | Details |
|------|------------|---------|
| **Organizations** | - | No access |
| **Users** | - | No access (cannot manage users) |
| **Programs** | CREATE | Create programs in OWN org only |
| | READ | View programs in OWN org (RLS enforced) |
| | UPDATE | Modify programs in OWN org |
| | DELETE | Delete programs in OWN org |
| **Workstreams** | CREATE | Create in own org's programs |
| | READ | View workstreams in own org |
| | UPDATE | Modify workstreams in own org |
| | DELETE | Delete workstreams in own org |
| **Units** | CREATE | Create in own org's workstreams |
| | READ | View units in own org |
| | UPDATE | Modify units in own org |
| | DELETE | Delete units in own org |
| | BLOCK | Mark units as BLOCKED (confirmed) |
| | UNBLOCK | Remove BLOCKED status |
| **Proofs** | UPLOAD | Upload to own org's units |
| | APPROVE | Approve proofs (except own uploads) |
| | REJECT | Reject proofs with reason |
| **Escalations** | CREATE | Escalate units in own org |
| | RESOLVE | Resolve escalations in own org |
| **Admin Dashboard** | - | No access |
| **Attention Queue** | VIEW | See items from OWN org only |

**Special Powers:**
- Can approve HIGH CRITICALITY unit proofs
- Can confirm BLOCKED status (when proposed by CLIENT)
- Receives Level 2 and Level 3 escalation notifications
- Can unblock units that were blocked by WORKSTREAM_LEAD

**Restrictions:**
- Cannot see other organizations' data
- Cannot manage users or create accounts
- Cannot access /admin dashboard

**Test Scenarios for PROGRAM_OWNER:**
```
Test O1: Create Program
  ACTION: Navigate to /programs/new, fill form
  EXPECTED: Program created in own org

Test O2: Cross-Tenant Blocked
  ACTION: Try to access /api/programs/[other-org-id]
  EXPECTED: 403 Forbidden

Test O3: Approve High-Criticality
  ACTION: Approve proof on high_criticality=true unit
  EXPECTED: Approval succeeds

Test O4: Confirm CLIENT Block Proposal
  ACTION: View escalation with proposed_blocked=true
  EXPECTED: Can confirm and set is_blocked=true

Test O5: Unblock Unit
  ACTION: Unblock a BLOCKED unit
  EXPECTED: Unit unblocked, status = RED or GREEN
```

---

### ROLE 3: WORKSTREAM_LEAD

**Description:** Team leader responsible for managing workstreams and their deliverables (units).

**Login Context:**
```
Email: lead@acmecorp.com (example)
Organization: Acme Corporation (org_id: uuid)
Typical User: Team lead, workstream manager, supervisor
```

**Authority Matrix:**

| Area | Permission | Details |
|------|------------|---------|
| **Organizations** | - | No access |
| **Users** | - | No access |
| **Programs** | CREATE | ❌ Cannot create programs |
| | READ | View programs in OWN org |
| | UPDATE | ❌ Cannot modify programs |
| | DELETE | ❌ Cannot delete programs |
| **Workstreams** | CREATE | Create in own org's programs |
| | READ | View workstreams in own org |
| | UPDATE | Modify workstreams in own org |
| | DELETE | Delete workstreams (if authorized) |
| **Units** | CREATE | Create in own org's workstreams |
| | READ | View units in own org |
| | UPDATE | Modify units in own org |
| | DELETE | Delete units in own org |
| | BLOCK | Mark units as BLOCKED (confirmed) |
| | UNBLOCK | ❌ Cannot unblock (needs OWNER) |
| **Proofs** | UPLOAD | Upload to own org's units |
| | APPROVE | Approve proofs (NORMAL criticality only) |
| | REJECT | Reject proofs with reason |
| **Escalations** | CREATE | Escalate units with BLOCKED authority |
| | RESOLVE | ❌ Cannot resolve (auto-resolves on GREEN) |
| **Admin Dashboard** | - | No access |
| **Attention Queue** | VIEW | See items from OWN org only |

**Special Powers:**
- Can directly mark units as BLOCKED (no proposal needed)
- Can approve proofs (except high_criticality units)
- Receives Level 1, 2, and 3 escalation notifications for own workstreams

**Restrictions:**
- Cannot approve HIGH CRITICALITY proofs (needs PROGRAM_OWNER)
- Cannot unblock units (only PROGRAM_OWNER/ADMIN)
- Cannot approve own uploaded proofs (separation of duties)
- Cannot self-approve (uploader ≠ approver)

**Test Scenarios for WORKSTREAM_LEAD:**
```
Test L1: Create Workstream
  ACTION: Add workstream to existing program
  EXPECTED: Workstream created

Test L2: Approve Normal Proof
  ACTION: Approve proof on normal criticality unit
  EXPECTED: Approval succeeds, unit may turn GREEN

Test L3: Approve High-Criticality BLOCKED
  ACTION: Try to approve proof on high_criticality unit
  EXPECTED: 403 Forbidden - requires PROGRAM_OWNER

Test L4: Self-Approval BLOCKED
  ACTION: Upload proof, then try to approve same proof
  EXPECTED: 403 Forbidden - separation of duties

Test L5: Block Unit
  ACTION: Escalate with mark_as_blocked=true
  EXPECTED: Unit immediately BLOCKED (is_blocked=true)

Test L6: Unblock BLOCKED
  ACTION: Try to call /api/units/[id]/unblock
  EXPECTED: 403 Forbidden - requires PROGRAM_OWNER
```

---

### ROLE 4: FIELD_CONTRIBUTOR

**Description:** Field worker who collects and uploads proof evidence but cannot approve.

**Login Context:**
```
Email: field@acmecorp.com (example)
Organization: Acme Corporation (org_id: uuid)
Typical User: Site inspector, field technician, data collector
```

**Authority Matrix:**

| Area | Permission | Details |
|------|------------|---------|
| **Organizations** | - | No access |
| **Users** | - | No access |
| **Programs** | CREATE | ❌ Cannot create |
| | READ | View programs in OWN org |
| | UPDATE | ❌ Cannot modify |
| | DELETE | ❌ Cannot delete |
| **Workstreams** | CREATE | ❌ Cannot create |
| | READ | View workstreams in own org |
| | UPDATE | ❌ Cannot modify |
| | DELETE | ❌ Cannot delete |
| **Units** | CREATE | Create units in own org |
| | READ | View units in own org |
| | UPDATE | ❌ Cannot modify |
| | DELETE | ❌ Cannot delete |
| | BLOCK | ❌ Cannot block |
| | UNBLOCK | ❌ Cannot unblock |
| **Proofs** | UPLOAD | ✅ Upload to own org's units |
| | APPROVE | ❌ Cannot approve any proofs |
| | REJECT | ❌ Cannot reject |
| **Escalations** | CREATE | ❌ Cannot escalate |
| | RESOLVE | ❌ Cannot resolve |
| **Admin Dashboard** | - | No access |
| **Attention Queue** | VIEW | ❌ No actionable items shown |

**Special Powers:**
- Primary proof uploader role
- Can create units (deliverable definitions)
- Receives notifications when their proofs are approved/rejected

**Restrictions:**
- Cannot approve ANY proofs (even from other users)
- Cannot escalate units
- Cannot block/unblock units
- Attention queue shows no items (nothing actionable)

**Test Scenarios for FIELD_CONTRIBUTOR:**
```
Test F1: Upload Proof
  ACTION: Navigate to /units/[id]/upload, submit photo
  EXPECTED: Proof uploaded, status=pending

Test F2: Approve BLOCKED
  ACTION: Try to click approve button on any proof
  EXPECTED: Button hidden or 403 Forbidden

Test F3: Escalate BLOCKED
  ACTION: Try to click escalate on RED unit
  EXPECTED: Button hidden or 403 Forbidden

Test F4: View Attention Queue
  ACTION: Navigate to /attention-queue
  EXPECTED: Empty list, no actionable items

Test F5: Create Unit
  ACTION: Create new unit in workstream
  EXPECTED: Unit created with status RED
```

---

### ROLE 5: CLIENT_VIEWER

**Description:** External client stakeholder with read-only access to monitor progress.

**Login Context:**
```
Email: client@external.com (example)
Organization: Acme Corporation (org_id: uuid)
Typical User: Client representative, external stakeholder, auditor
```

**Authority Matrix:**

| Area | Permission | Details |
|------|------------|---------|
| **Organizations** | - | No access |
| **Users** | - | No access |
| **Programs** | CREATE | ❌ Cannot create |
| | READ | View programs in OWN org |
| | UPDATE | ❌ Cannot modify |
| | DELETE | ❌ Cannot delete |
| **Workstreams** | CREATE | ❌ Cannot create |
| | READ | View workstreams in own org |
| | UPDATE | ❌ Cannot modify |
| | DELETE | ❌ Cannot delete |
| **Units** | CREATE | ❌ Cannot create |
| | READ | View units in own org |
| | UPDATE | ❌ Cannot modify |
| | DELETE | ❌ Cannot delete |
| | BLOCK | ⚠️ Can PROPOSE only (needs confirmation) |
| | UNBLOCK | ❌ Cannot unblock |
| **Proofs** | UPLOAD | ❌ Cannot upload |
| | APPROVE | ❌ Cannot approve |
| | REJECT | ❌ Cannot reject |
| **Escalations** | CREATE | ⚠️ Can request escalation (with proposed_blocked) |
| | RESOLVE | ❌ Cannot resolve |
| **Admin Dashboard** | - | No access |
| **Attention Queue** | VIEW | ❌ Empty (read-only role) |

**Special Powers:**
- Can REQUEST escalations (creates escalation record)
- Can PROPOSE blockage (proposed_blocked=true) but cannot confirm

**Restrictions:**
- Truly read-only for most operations
- Cannot upload proofs
- Cannot approve/reject anything
- Blockage proposals require WORKSTREAM_LEAD or PROGRAM_OWNER confirmation
- Attention queue is empty (nothing to action)

**Test Scenarios for CLIENT_VIEWER:**
```
Test C1: View Program
  ACTION: Navigate to /programs
  EXPECTED: Can see programs, workstreams, units (read-only)

Test C2: Upload Proof BLOCKED
  ACTION: Try to navigate to /units/[id]/upload
  EXPECTED: Access denied or upload button hidden

Test C3: Approve Proof BLOCKED
  ACTION: Try to approve any proof
  EXPECTED: 403 Forbidden

Test C4: Request Escalation
  ACTION: Click escalate on RED unit, enter reason
  EXPECTED: Escalation created, notification sent

Test C5: Propose Block (Not Confirmed)
  ACTION: Escalate with mark_as_blocked=true
  EXPECTED:
    - Escalation created with proposed_blocked=true
    - Unit is_blocked remains FALSE
    - Response: "Proposed blockage, needs LEAD/OWNER confirmation"

Test C6: Attention Queue Empty
  ACTION: Navigate to /attention-queue
  EXPECTED: Empty list, summary shows all zeros
```

---

## COMPLETE PERMISSION MATRIX

| Action | ADMIN | OWNER | LEAD | CONTRIB | CLIENT |
|--------|:-----:|:-----:|:----:|:-------:|:------:|
| **View all orgs** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Manage users** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Access /admin** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Create program** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Delete program** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Create workstream** | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Create unit** | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Upload proof** | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Approve proof (normal)** | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Approve proof (high-crit)** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Reject proof** | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Escalate unit** | ✅ | ✅ | ✅ | ❌ | ⚠️ |
| **Confirm BLOCKED** | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Propose BLOCKED** | ✅ | ✅ | ✅ | ❌ | ⚠️ |
| **Unblock unit** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **View attention queue** | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Receive escalation emails** | L3 | L2,L3 | L1,L2,L3 | ❌ | ❌ |

Legend: ✅ = Yes | ❌ = No | ⚠️ = Limited/Proposed only | L1/L2/L3 = Escalation levels

---

## SEPARATION OF DUTIES RULES

### Rule 1: Self-Approval Prevention
```
INVARIANT: uploaded_by ≠ approved_by
ENFORCED AT: API layer (/api/units/[id]/proofs/[pid]/approve)
ERROR: "Cannot approve your own proof"
```

### Rule 2: High-Criticality Approval
```
INVARIANT: high_criticality proofs require PROGRAM_OWNER or PLATFORM_ADMIN
ENFORCED AT: API layer
ERROR: "High criticality units require PROGRAM_OWNER approval"
```

### Rule 3: BLOCKED Authority
```
INVARIANT: Only WORKSTREAM_LEAD+ can confirm BLOCKED status
ENFORCED AT: API layer (/api/units/[id]/escalate)
BEHAVIOR: CLIENT_VIEWER creates proposed_blocked, not actual blocked
```

### Rule 4: Unblock Authority
```
INVARIANT: Only PROGRAM_OWNER or PLATFORM_ADMIN can unblock
ENFORCED AT: API layer (/api/units/[id]/unblock)
ERROR: "Insufficient permissions to unblock"
```

---

## TEST SCENARIOS BY FEATURE

### 1. AUTHENTICATION

#### Test 1.1: Valid Login
```
ACTION: Navigate to /login
INPUT:
  - Email: [valid user email]
  - Password: [valid password]
EXPECTED:
  - Redirect to /programs
  - User session established
  - Role-appropriate navigation shown
```

#### Test 1.2: Invalid Login
```
ACTION: Navigate to /login
INPUT:
  - Email: [valid email]
  - Password: [wrong password]
EXPECTED:
  - Error message displayed
  - Remain on login page
  - No session created
```

#### Test 1.3: Logout
```
ACTION: Click logout button in header
EXPECTED:
  - Session terminated
  - Redirect to /login
  - Protected routes inaccessible
```

---

### 2. PROGRAM MANAGEMENT

#### Test 2.1: Create Program (as PROGRAM_OWNER)
```
ACTION: Navigate to /programs/new
INPUT:
  - Name: "Test Program Alpha"
  - Description: "Testing program creation"
  - Start Date: [today]
  - End Date: [30 days from now]
EXPECTED:
  - Program created successfully
  - Appears in program list
  - Created_by tracks current user
  - org_id matches user's organization
```

#### Test 2.2: View Program List
```
ACTION: Navigate to /programs
EXPECTED:
  - Only programs from user's organization shown (RLS)
  - Each program shows: name, description, workstream count
  - Status indicators visible
```

#### Test 2.3: Edit Program
```
ACTION: Click edit on existing program
INPUT: Change description to "Updated description"
EXPECTED:
  - Changes saved
  - Updated description displayed
  - Audit trail updated
```

#### Test 2.4: Delete Program (Cascade)
```
ACTION: Delete program with workstreams and units
EXPECTED:
  - Confirmation dialog shown
  - Program deleted
  - All child workstreams deleted
  - All child units deleted
  - All child proofs deleted
```

#### Test 2.5: Cross-Tenant Access Blocked
```
ACTION: Try to access /api/programs/[other-org-program-id]
EXPECTED:
  - 403 Forbidden response
  - "cross-tenant access denied" message
```

---

### 3. WORKSTREAM MANAGEMENT

#### Test 3.1: Create Workstream
```
ACTION: From program detail, click "Add Workstream"
INPUT:
  - Name: "Site Preparation"
  - Type: "site" (from dropdown)
EXPECTED:
  - Workstream created under program
  - Appears in workstream grid
  - Status initially shows no units
```

#### Test 3.2: View Workstream Board
```
ACTION: Navigate to /workstreams/[id]
EXPECTED:
  - Grid layout showing all units
  - Unit cards show: title, status, deadline, escalation level
  - Color coding: GREEN/RED/BLOCKED
  - Metrics bar: total units, green count, red count
```

#### Test 3.3: Workstream Types
```
VALID TYPES:
  - site
  - build_fitout
  - mep_utilities
  - install_logistics
  - it_systems
  - test_commission
  - operations_live
  - compliance_permits
  - branding_creative
  - other
```

---

### 4. UNIT (DELIVERABLE) MANAGEMENT

#### Test 4.1: Create Unit with Full Config
```
ACTION: Navigate to /workstreams/[id]/units/new
INPUT:
  - Title: "Foundation Inspection"
  - Description: "Complete foundation inspection and documentation"
  - Owner Party: "ABC Contractors"
  - Deadline (required_green_by): [7 days from now]
  - Acceptance Criteria: "Photo evidence of completed foundation"
  - Proof Requirements:
    - Required Count: 2
    - Required Types: ["photo", "document"]
  - Alert Profile: STANDARD (50%, 75%, 90%)
  - Escalation Enabled: true
EXPECTED:
  - Unit created with status RED (no proofs yet)
  - Appears in workstream board
  - Deadline tracking active
```

#### Test 4.2: Unit Status Computation
```
SCENARIO A - RED (Default):
  - No approved proofs → RED
  - Past deadline → RED
  - Insufficient proof count → RED

SCENARIO B - GREEN:
  - Required proof count met AND
  - Required proof types present AND
  - All proofs approved AND
  - Within deadline
  → GREEN

SCENARIO C - BLOCKED:
  - is_blocked = true → BLOCKED (overrides all)
```

#### Test 4.3: Alert Profiles
```
STANDARD Profile:
  - Level 1 at 50% time elapsed
  - Level 2 at 75% time elapsed
  - Level 3 at 90% time elapsed

CRITICAL Profile:
  - Level 1 at 30% time elapsed
  - Level 2 at 60% time elapsed
  - Level 3 at 90% time elapsed

CUSTOM Profile (validated):
  - 1-5 threshold levels
  - Percentages 0-100
  - Strictly increasing order
```

---

### 5. PROOF UPLOAD & APPROVAL

#### Test 5.1: Upload Proof
```
ACTION: Navigate to /units/[id]/upload
INPUT:
  - File: [photo/video/document]
  - Type: "photo"
  - Captured At: [timestamp]
EXPECTED:
  - File uploaded to Supabase storage
  - Proof record created with status "pending"
  - uploaded_by tracks current user
  - Unit status recomputed (may still be RED)
```

#### Test 5.2: Approve Proof (Valid)
```
PRECONDITION: Logged in as WORKSTREAM_LEAD (different from uploader)
ACTION: Click "Approve" on pending proof
EXPECTED:
  - approval_status → "approved"
  - approved_by, approved_at populated
  - Unit status recomputed
  - status_event logged
```

#### Test 5.3: Reject Proof
```
ACTION: Click "Reject" on pending proof
INPUT: Rejection reason: "Image quality insufficient"
EXPECTED:
  - approval_status → "rejected"
  - rejection_reason saved
  - Uploader notified
  - Unit remains RED
```

#### Test 5.4: Self-Approval Blocked (Separation of Duties)
```
PRECONDITION: User uploaded a proof
ACTION: Same user tries to approve own proof
EXPECTED:
  - 403 Forbidden
  - "Cannot approve own proof" error
  - Proof remains pending
```

#### Test 5.5: CLIENT Cannot Approve
```
PRECONDITION: Logged in as CLIENT_VIEWER
ACTION: Try to approve any proof
EXPECTED:
  - 403 Forbidden
  - "Insufficient permissions" error
```

#### Test 5.6: Proof Superseding
```
PRECONDITION: Unit has approved proof
ACTION: Upload and approve new proof for same unit
EXPECTED:
  - Previous proof marked is_superseded = true
  - superseded_at, superseded_by populated
  - New proof is the "active" approved proof
  - status_event logged with supersede count
```

---

### 6. ESCALATION SYSTEM

#### Test 6.1: Manual Escalation
```
ACTION: On RED unit, click "Escalate"
INPUT:
  - Reason: "Critical delay - contractor issue"
  - Level: 2
  - Mark as Blocked: false
EXPECTED:
  - unit_escalations record created
  - current_escalation_level updated to 2
  - Notifications sent to WORKSTREAM_LEAD + PROGRAM_OWNER
  - Email queued in escalation_notifications
```

#### Test 6.2: Escalate with BLOCKED (Authorized)
```
PRECONDITION: Logged in as WORKSTREAM_LEAD
ACTION: Escalate with mark_as_blocked = true
INPUT:
  - Reason: "Waiting for permit approval"
  - Mark as Blocked: true
EXPECTED:
  - is_blocked = true
  - blocked_reason saved
  - blocked_by = current user
  - computed_status = "BLOCKED"
  - status_event logged
```

#### Test 6.3: CLIENT Proposes Block (Needs Confirmation)
```
PRECONDITION: Logged in as CLIENT_VIEWER
ACTION: Escalate with mark_as_blocked = true
EXPECTED:
  - Escalation created with proposed_blocked = true
  - Unit NOT actually blocked (is_blocked = false)
  - Response: "proposed blockage, needs LEAD/OWNER confirmation"
  - WORKSTREAM_LEAD sees pending block proposal
```

#### Test 6.4: Unblock Unit
```
PRECONDITION: Unit is BLOCKED, logged in as PROGRAM_OWNER
ACTION: Call /api/units/[id]/unblock
EXPECTED:
  - is_blocked = false
  - blocked_reason, blocked_by, blocked_at cleared
  - computed_status recomputed (RED or GREEN)
  - status_event logged
```

#### Test 6.5: Automatic Escalation (Cron)
```
SETUP:
  - Unit with deadline 10 days away
  - Alert profile: STANDARD (50%, 75%, 90%)
  - Current time: 5 days elapsed (50%)
ACTION: Cron triggers /api/cron/check-escalations
EXPECTED:
  - Level 1 escalation created
  - WORKSTREAM_LEAD notified
  - Email queued
  - current_escalation_level = 1
```

#### Test 6.6: BLOCKED Units Skip Alerts
```
PRECONDITION: Unit is BLOCKED
ACTION: Cron runs escalation check
EXPECTED:
  - Unit skipped (no escalation created)
  - Log shows "skipping blocked unit"
```

---

### 7. ATTENTION QUEUE

#### Test 7.1: View Attention Queue
```
ACTION: Navigate to /attention-queue
EXPECTED (for WORKSTREAM_LEAD):
  - Items from own organization only
  - Sorted by priority (descending)
  - Summary counts: pending_proofs, units_at_risk, units_blocked, manual_escalations
```

#### Test 7.2: Priority Calculation
```
PRIORITY FORMULA:
  Base scores:
    - manual_escalation: 1000
    - unit_blocked: 900
    - proof_pending: 700
    - unit_at_risk: 500

  Bonuses:
    - +100 per escalation level (max 300)
    - +200 for high_criticality
    - +50-200 based on deadline urgency
    - +up to 100 for escalation age (hours)

EXPECTED: Items sorted highest priority first
```

#### Test 7.3: CLIENT_VIEWER Sees Empty Queue
```
PRECONDITION: Logged in as CLIENT_VIEWER
ACTION: Navigate to /attention-queue
EXPECTED:
  - Empty items list
  - Summary shows all zeros
  - "No action items" message
```

#### Test 7.4: Tenant Isolation in Queue
```
PRECONDITION: Two organizations with active items
ACTION: WORKSTREAM_LEAD from Org A views queue
EXPECTED:
  - Only Org A items shown
  - Org B items not visible
  - RLS enforced at database level
```

---

### 8. ADMIN FEATURES

#### Test 8.1: View Admin Dashboard
```
PRECONDITION: Logged in as PLATFORM_ADMIN
ACTION: Navigate to /admin
EXPECTED:
  - Stats displayed: totalClients, totalUsers, totalPrograms, pendingNotifications
  - Quick action buttons visible
  - User management section
```

#### Test 8.2: Create User (RBAC)
```
ACTION: Click "Add User" in admin
INPUT:
  - Email: "newuser@example.com"
  - Password: "secure123"
  - Full Name: "Test User"
  - Role: WORKSTREAM_LEAD
  - Organization: [select org]
EXPECTED:
  - User created in Supabase Auth
  - Profile created with role and org_id
  - User can log in immediately
```

#### Test 8.3: Update User Role
```
ACTION: Edit existing user's role
INPUT: Change from FIELD_CONTRIBUTOR to WORKSTREAM_LEAD
EXPECTED:
  - Role updated in profiles table
  - User's permissions change immediately
  - No logout required
```

#### Test 8.4: Delete User
```
ACTION: Delete user from admin panel
EXPECTED:
  - Confirmation dialog shown
  - Profile deleted
  - Auth user remains (soft delete) or cascades
  - User cannot log in
```

#### Test 8.5: Create Organization
```
ACTION: POST /api/admin/organizations
INPUT:
  - Name: "Acme Corporation"
EXPECTED:
  - Organization created
  - Can assign users to org
  - Can create programs under org
```

---

### 9. EMAIL NOTIFICATIONS

#### Test 9.1: Escalation Email (Manual)
```
TRIGGER: Manual escalation created
EXPECTED EMAIL:
  - Subject: "[MANUAL] Escalation Alert - [Unit Title]"
  - Recipients: Target roles based on escalation level
  - Content: Unit details, escalation reason, action link
```

#### Test 9.2: Escalation Email (Automatic)
```
TRIGGER: Cron creates automatic escalation
EXPECTED EMAIL:
  - Subject: "[ALERT] Automatic Escalation - [Unit Title]"
  - Recipients: Target roles based on level
  - Content: Deadline info, time elapsed, action link
```

#### Test 9.3: Resolved Escalation - No Email
```
TRIGGER: Escalation already resolved (status='resolved')
EXPECTED:
  - No email sent
  - Log shows "skipping resolved escalation"
```

---

### 10. TENANT SAFETY (CRITICAL)

#### Test 10.1: GET /api/units/[id] - Cross-Tenant
```
PRECONDITION: User from Org A
ACTION: GET /api/units/[org-b-unit-id]
EXPECTED:
  - 403 Forbidden
  - "cross-tenant access denied"
```

#### Test 10.2: GET /api/programs/[id] - Cross-Tenant
```
PRECONDITION: User from Org A
ACTION: GET /api/programs/[org-b-program-id]
EXPECTED:
  - 403 Forbidden
  - "cross-tenant access denied"
```

#### Test 10.3: PATCH /api/units/[id] - Cross-Tenant
```
PRECONDITION: User from Org A
ACTION: PATCH /api/units/[org-b-unit-id]
EXPECTED:
  - 403 Forbidden (auth check before update)
```

#### Test 10.4: RLS Policy Verification
```
ACTION: Query programs table as Org A user
SQL: SELECT * FROM programs;
EXPECTED:
  - Only Org A programs returned
  - RLS automatically filters
  - No WHERE clause needed in app
```

---

### 11. AUDIT TRAIL

#### Test 11.1: Status Event Logging
```
ACTION: Block a unit
EXPECTED in unit_status_events:
  - event_type: "blocked"
  - old_status: "RED"
  - new_status: "BLOCKED"
  - triggered_by: [user_id]
  - triggered_by_role: "WORKSTREAM_LEAD"
  - reason: [blocked_reason]
  - created_at: [timestamp]
```

#### Test 11.2: Proof Approval Event
```
ACTION: Approve a proof
EXPECTED in unit_status_events:
  - event_type: "proof_approved"
  - triggered_by: [approver_id]
  - metadata: { proof_id, proofs_superseded }
```

#### Test 11.3: Events Are Immutable
```
ACTION: Try to UPDATE or DELETE from unit_status_events
EXPECTED:
  - Operation fails (no UPDATE/DELETE permissions)
  - Table is append-only
```

---

### 12. EDGE CASES & ERROR HANDLING

#### Test 12.1: Invalid CUSTOM Alert Config
```
ACTION: Create unit with invalid escalation_config
INPUT:
  - thresholds: [90, 75, 50] (not strictly increasing)
EXPECTED:
  - Database trigger rejects
  - Error: "Thresholds must be strictly increasing"
```

#### Test 12.2: BLOCKED Without Reason
```
ACTION: Try to set is_blocked=true with empty reason
EXPECTED:
  - Database constraint rejects
  - Error: "BLOCKED units must have non-empty reason"
```

#### Test 12.3: Empty Workstream Status
```
ACTION: Create workstream with no units
EXPECTED:
  - Workstream status: null or "EMPTY"
  - Metrics show 0 units
  - No errors
```

#### Test 12.4: Unit Past Deadline
```
SETUP: Unit with required_green_by in the past
EXPECTED:
  - computed_status: RED (regardless of proofs)
  - Escalation level may be 3 (max)
  - Shows as "overdue" in UI
```

---

## API ENDPOINT REFERENCE

### Programs
| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| GET | /api/programs | Yes | List all programs (RLS filtered) |
| POST | /api/programs | Yes (OWNER+) | Create program |
| GET | /api/programs/[id] | Yes | Get program details |
| PUT | /api/programs/[id] | Yes (OWNER+) | Update program |
| DELETE | /api/programs/[id] | Yes (OWNER+) | Delete program (cascade) |

### Workstreams
| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| GET | /api/workstreams?program_id=X | Yes | List workstreams |
| POST | /api/workstreams | Yes (LEAD+) | Create workstream |
| GET | /api/workstreams/[id] | Yes | Get workstream with metrics |
| PUT | /api/workstreams/[id] | Yes (LEAD+) | Update workstream |

### Units
| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| GET | /api/units?workstream_id=X | Yes | List units with proofs |
| POST | /api/units | Yes (CONTRIB+) | Create unit |
| GET | /api/units/[id] | Yes | Get unit details |
| PUT | /api/units/[id] | Yes (LEAD+) | Update unit |
| DELETE | /api/units/[id] | Yes (LEAD+) | Delete unit |
| POST | /api/units/[id]/escalate | Yes | Manual escalation |
| POST | /api/units/[id]/unblock | Yes (OWNER+) | Remove BLOCKED |

### Proofs
| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| POST | /api/units/[id]/proofs | Yes (CONTRIB+) | Upload proof |
| GET | /api/units/[id]/proofs | Yes | List proofs |
| POST | /api/units/[id]/proofs/[pid]/approve | Yes (LEAD+) | Approve/reject |

### Admin
| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| GET | /api/admin/stats | Yes (ADMIN) | System statistics |
| GET | /api/admin/users | Yes (ADMIN) | List all users |
| POST | /api/admin/create-rbac-user | Yes (ADMIN) | Create user |
| PUT | /api/admin/users/[id] | Yes (ADMIN) | Update user |
| DELETE | /api/admin/users/[id] | Yes (ADMIN) | Delete user |
| GET | /api/admin/organizations | Yes (ADMIN) | List organizations |
| POST | /api/admin/organizations | Yes (ADMIN) | Create organization |

### Attention Queue
| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| GET | /api/attention-queue | Yes | Get prioritized items |

### Notifications
| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| POST | /api/notifications/[id]/read | Yes | Mark as read |

### Cron
| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| GET | /api/cron/check-escalations | Cron Secret | Trigger auto-escalations |

---

## TEST EXECUTION CHECKLIST

### Pre-Test Setup
- [ ] Test database seeded with sample data
- [ ] Multiple organizations created
- [ ] Users in each role created
- [ ] Sample programs/workstreams/units exist

### Authentication Tests (5)
- [ ] 1.1 Valid login
- [ ] 1.2 Invalid login
- [ ] 1.3 Logout
- [ ] 1.4 Session persistence
- [ ] 1.5 Role-based redirect

### Program Tests (5)
- [ ] 2.1 Create program
- [ ] 2.2 View program list
- [ ] 2.3 Edit program
- [ ] 2.4 Delete program (cascade)
- [ ] 2.5 Cross-tenant access blocked

### Workstream Tests (3)
- [ ] 3.1 Create workstream
- [ ] 3.2 View workstream board
- [ ] 3.3 Workstream type validation

### Unit Tests (4)
- [ ] 4.1 Create unit with full config
- [ ] 4.2 Status computation (RED/GREEN/BLOCKED)
- [ ] 4.3 Alert profile validation
- [ ] 4.4 Deadline tracking

### Proof Tests (6)
- [ ] 5.1 Upload proof
- [ ] 5.2 Approve proof (valid)
- [ ] 5.3 Reject proof
- [ ] 5.4 Self-approval blocked
- [ ] 5.5 CLIENT cannot approve
- [ ] 5.6 Proof superseding

### Escalation Tests (6)
- [ ] 6.1 Manual escalation
- [ ] 6.2 Escalate with BLOCKED (authorized)
- [ ] 6.3 CLIENT proposes block
- [ ] 6.4 Unblock unit
- [ ] 6.5 Automatic escalation
- [ ] 6.6 BLOCKED units skip alerts

### Attention Queue Tests (4)
- [ ] 7.1 View attention queue
- [ ] 7.2 Priority calculation
- [ ] 7.3 CLIENT sees empty queue
- [ ] 7.4 Tenant isolation

### Admin Tests (5)
- [ ] 8.1 View admin dashboard
- [ ] 8.2 Create user
- [ ] 8.3 Update user role
- [ ] 8.4 Delete user
- [ ] 8.5 Create organization

### Email Tests (3)
- [ ] 9.1 Manual escalation email
- [ ] 9.2 Automatic escalation email
- [ ] 9.3 Resolved escalation - no email

### Tenant Safety Tests (4)
- [ ] 10.1 Units cross-tenant blocked
- [ ] 10.2 Programs cross-tenant blocked
- [ ] 10.3 PATCH cross-tenant blocked
- [ ] 10.4 RLS policy verification

### Audit Trail Tests (3)
- [ ] 11.1 Status event logging
- [ ] 11.2 Proof approval event
- [ ] 11.3 Events immutable

### Edge Case Tests (4)
- [ ] 12.1 Invalid CUSTOM config
- [ ] 12.2 BLOCKED without reason
- [ ] 12.3 Empty workstream
- [ ] 12.4 Past deadline handling

---

## TOTAL: 52 TEST CASES

**Pass Criteria:** All 52 tests pass
**Critical Tests:** 10.1-10.4 (Tenant Safety), 5.4 (Self-Approval), 6.3 (BLOCKED Authority)

---

## NOTES FOR LLM TESTER

1. **Always verify role context** before each test - permissions vary by role
2. **Check both UI and API** - some behaviors differ
3. **Verify database state** after mutations - use Supabase dashboard
4. **Test edge cases** - empty states, max values, invalid inputs
5. **Document any failures** with: expected vs actual, steps to reproduce
6. **Tenant isolation is critical** - always test cross-org access attempts

---

*Generated for Celestar Production Release - January 2026*

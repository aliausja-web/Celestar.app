# Smoke Test Design Prompt for Celestar Execution Readiness Portal

## Context for LLM

You are designing a comprehensive smoke test for **Celestar**, a commercial execution readiness portal. The platform enables organizations to track project execution through a hierarchical structure: **Organizations → Programs → Workstreams → Units**. Each unit requires proof of completion (photos/videos/documents) that must be approved before the unit turns GREEN.

### Platform Architecture

**Hierarchy:**
```
Organization (Client Company)
  └── Program (Major Initiative)
        └── Workstream (Functional Area)
              └── Unit (Deliverable Item)
                    └── Proof (Evidence of Completion)
```

**User Roles (RBAC):**
- `PLATFORM_ADMIN` - Full system access, manages all organizations
- `PROGRAM_OWNER` - Manages programs within their organization
- `WORKSTREAM_LEAD` - Manages workstreams and units within assigned workstreams
- `FIELD_CONTRIBUTOR` - Can create units and upload proofs
- `CLIENT_VIEWER` - Read-only access to their organization's data

**Unit Status Flow:**
- `RED` - No approved proof, needs attention
- `GREEN` - Has approved proof, complete
- `BLOCKED` - Manually blocked due to external dependency

**Escalation Levels:**
- Level 1 → WORKSTREAM_LEAD notified
- Level 2 → PROGRAM_OWNER + WORKSTREAM_LEAD notified
- Level 3 → PLATFORM_ADMIN + PROGRAM_OWNER notified (Critical)

**Proof Approval Workflow:**
1. User uploads proof (photo/video/document)
2. Proof enters `pending` status
3. Authorized approver (not the uploader) reviews
4. Proof is `approved` or `rejected`
5. Unit status recomputes automatically

### Technical Stack
- Frontend: Next.js 15 (App Router)
- Backend: Next.js API Routes
- Database: Supabase (PostgreSQL)
- Auth: Supabase Auth + Custom RBAC
- Storage: Supabase Storage (for proofs)
- Deployment: Netlify
- Email: Configured via escalation_notifications table

### Key API Endpoints
```
Authentication:
- POST /api/admin/create-rbac-user - Create new user with role

Organizations:
- GET/POST /api/admin/organizations
- GET/PATCH/DELETE /api/admin/organizations/[id]

Programs:
- GET/POST /api/programs
- GET/PATCH/DELETE /api/programs/[id]
- POST /api/admin/programs/[id]/assign - Assign program to organization

Workstreams:
- GET/POST /api/workstreams
- GET/PATCH/DELETE /api/workstreams/[id]

Units:
- GET/POST /api/units
- GET/PATCH/DELETE /api/units/[id]
- POST /api/units/[id]/escalate - Manual escalation
- POST /api/units/[id]/unblock - Remove blocked status
- POST /api/units/[id]/confirm - Confirm unit scope

Proofs:
- GET/POST /api/units/[id]/proofs
- POST /api/units/[id]/proofs/[proofId]/approve - Approve/reject proof

Monitoring:
- GET /api/attention-queue - Items requiring attention
- GET /api/cron/check-escalations - Trigger auto-escalations

Notifications:
- POST /api/notifications/[id]/read - Mark notification read
```

### Database Tables
- `organizations` - Client companies
- `profiles` - User profiles with roles and org assignment
- `programs` - Major initiatives (has org_id)
- `workstreams` - Functional areas within programs
- `units` - Deliverable items within workstreams
- `unit_proofs` - Evidence uploads
- `unit_escalations` - Escalation records
- `unit_status_events` - Audit log of status changes
- `in_app_notifications` - User notifications
- `escalation_notifications` - Email notification queue

---

## Your Task

Design a **comprehensive smoke test plan** that validates ALL functionality of the Celestar portal for commercial production use. The test must be thorough enough to catch any issues before client deployment.

### Requirements for the Smoke Test

#### 1. Multi-Tenant Organization Testing
- Create at least 3 different organizations
- Verify complete data isolation between organizations
- Test that users from Org A cannot see/modify Org B's data
- Test PLATFORM_ADMIN can see all organizations

#### 2. User & Role Management
- Create users for each role type in each organization
- Verify role-based permissions are enforced
- Test login/logout for each user type
- Verify authorization header handling

#### 3. Program Management
- Create multiple programs per organization
- Test program assignment to organizations
- Verify program CRUD operations
- Test that programs respect tenant isolation

#### 4. Workstream Management
- Create multiple workstreams per program
- Verify workstream CRUD operations
- Test workstream metrics calculation
- Verify workstream-level permissions

#### 5. Unit Management
- Create units with various configurations:
  - Different deadlines (past, near future, far future)
  - Different proof requirements
  - Different escalation configs
- Test unit status computation
- Verify unit count aggregation at workstream level

#### 6. Proof Upload & Approval Workflow
- Upload proofs of different types (photo, video, document)
- Verify proof storage works correctly
- Test the approval workflow:
  - Approver cannot approve their own proof (separation of duties)
  - Approved proof turns unit GREEN
  - Rejected proof keeps unit RED with reason
- Test proof metadata display

#### 7. Escalation System
- Test manual escalation:
  - Verify escalation levels increment correctly
  - Verify correct roles are notified per level
  - Test BLOCKED status setting
- Test automatic escalation:
  - Create units with past deadlines
  - Trigger cron job
  - Verify escalations created
- Verify escalation notifications created

#### 8. Email Notification Integration
- Verify escalation_notifications records created
- Verify email content is correct
- Test email delivery (if email service configured)
- Verify notification targeting by role

#### 9. Attention Queue
- Verify pending proofs appear
- Verify RED/BLOCKED units appear
- Verify active escalations appear
- Test priority sorting
- Verify tenant filtering works

#### 10. UI/UX Flows
- Test complete user journey from login to proof approval
- Verify all pages load without errors
- Test responsive design
- Verify error handling displays correctly

#### 11. Edge Cases & Error Handling
- Test with missing required fields
- Test with invalid UUIDs
- Test unauthorized access attempts
- Test cross-tenant access attempts
- Test concurrent operations

#### 12. Performance & Scale
- Test with realistic data volumes
- Verify pagination works
- Test API response times

---

## Output Format

Provide the smoke test as a **structured test plan** with:

1. **Test ID** - Unique identifier (e.g., ST-001)
2. **Category** - Which area being tested
3. **Test Name** - Descriptive name
4. **Preconditions** - Required setup
5. **Test Steps** - Numbered steps to execute
6. **Expected Results** - What should happen
7. **Actual Results** - [To be filled during testing]
8. **Status** - [PASS/FAIL/BLOCKED]
9. **Priority** - Critical/High/Medium/Low

Also provide:
- **Test Data Requirements** - What data needs to be created
- **Environment Setup** - Required configuration
- **Cleanup Procedures** - How to reset after testing

---

## Sample Test Case Format

```
┌─────────────────────────────────────────────────────────────────┐
│ TEST ID: ST-001                                                  │
│ CATEGORY: Authentication                                         │
│ PRIORITY: Critical                                               │
├─────────────────────────────────────────────────────────────────┤
│ TEST NAME: Platform Admin Login                                  │
├─────────────────────────────────────────────────────────────────┤
│ PRECONDITIONS:                                                   │
│ - Platform admin user exists in system                          │
│ - User has valid credentials                                    │
├─────────────────────────────────────────────────────────────────┤
│ TEST STEPS:                                                      │
│ 1. Navigate to /login                                           │
│ 2. Enter admin email                                            │
│ 3. Enter admin password                                         │
│ 4. Click "Sign In"                                              │
├─────────────────────────────────────────────────────────────────┤
│ EXPECTED RESULTS:                                                │
│ - User is redirected to /admin dashboard                        │
│ - Admin navigation options are visible                          │
│ - User session is established                                   │
├─────────────────────────────────────────────────────────────────┤
│ ACTUAL RESULTS: [To be filled]                                  │
│ STATUS: [ ]                                                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Critical Test Scenarios (Must Pass)

These scenarios MUST pass before commercial deployment:

1. **Complete Happy Path**: Admin creates org → creates users → user creates program → creates workstream → creates unit → uploads proof → different user approves proof → unit turns GREEN

2. **Tenant Isolation**: User from Org A attempts to access Org B's program/workstream/unit → receives 403 Forbidden

3. **Escalation Chain**: Unit misses deadline → auto-escalation triggers → L1 notification sent → still not resolved → L2 triggers → L3 triggers

4. **Separation of Duties**: User uploads proof → same user attempts to approve → system rejects with error

5. **Role Permissions**: FIELD_CONTRIBUTOR attempts to delete program → receives 403 Forbidden

---

## Test Environment URLs

- Production: https://celestar.app
- Admin Panel: https://celestar.app/admin
- Programs Dashboard: https://celestar.app/programs
- Attention Queue: https://celestar.app/attention-queue

---

Generate the complete smoke test plan covering ALL the above requirements. Be thorough - this is for commercial deployment where bugs cost real money and client trust.

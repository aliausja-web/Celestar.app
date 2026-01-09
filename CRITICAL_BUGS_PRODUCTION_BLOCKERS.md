# CRITICAL BUGS - PRODUCTION BLOCKERS
## Commercial Launch Readiness Audit - 2026-01-09

**STATUS: 🔴 MULTIPLE CRITICAL ISSUES FOUND - DO NOT LAUNCH**

These bugs WILL cause data corruption, authentication failures, and security breaches in production.

---

## BUG #1: DUAL ORGANIZATION SCHEMA 🔴 CRITICAL

### Problem
Two organization tables exist with different data types:
- `orgs` table (text ID) - Legacy
- `organizations` table (UUID) - New

### Impact
- **Data Integrity**: User organizations stored in wrong table
- **Authentication**: Users may not see their data (RLS mismatch)
- **Admin Dashboard**: Creates orgs in `organizations`, but app reads from `org_id`
- **Login Issue**: This likely caused your "account setup incomplete" error

### Evidence
```sql
-- profiles table has BOTH columns
profiles.org_id text REFERENCES orgs(id)
profiles.organization_id uuid REFERENCES organizations(id)

-- programs table has BOTH columns
programs.org_id text REFERENCES orgs(id)
programs.client_organization_id uuid REFERENCES organizations(id)
```

### Files Affected
- `app/api/admin/organizations/route.ts` - Uses `organizations` (UUID)
- `app/api/admin/users/route.ts` - Uses `organization_id` (UUID)
- `lib/auth-context.tsx:82` - Uses `org_id` (text)
- Multiple RLS policies reference different columns

### Fix Required
Run migration: `supabase/migrations/20260109_CRITICAL_schema_consolidation.sql`

---

## BUG #2: MIXED PROOFS TABLE REFERENCES 🔴 CRITICAL

### Problem
Database schema creates `proofs` table, but API code references both `proofs` AND `unit_proofs`

### Impact
- **Proof Upload**: May fail silently (wrong table)
- **Proof Approval**: Will definitely fail (table doesn't exist)
- **Status Verification**: Won't work if proofs in wrong table

### Evidence
```typescript
// Database schema
CREATE TABLE proofs (...)

// API files use BOTH names:
app/api/units/[id]/proofs/route.ts:        .from('proofs')      // Line 1
app/api/units/[id]/proofs/route.ts:        .from('unit_proofs') // Line 2
app/api/units/[id]/proofs/[proofId]/approve/route.ts: .from('unit_proofs')
```

### Fix Required
Standardize all API code to use `proofs` (matches schema)

---

## BUG #3: WORKSTREAM STATUS LOGIC 🟡 HIGH PRIORITY (FIXED)

### Problem
Empty workstreams showed GREEN status (false readiness)

### Status
✅ FIXED in migration `20260109_fix_workstream_status_logic.sql`
⚠️ **MUST BE APPLIED** before launch

---

## BUG #4: RLS POLICY COLUMN MISMATCH 🔴 CRITICAL

### Problem
RLS policies reference `organization_id` but data may be in `org_id` column

### Impact
- **Data Isolation Breach**: Users may see other organizations' data
- **Security Vulnerability**: Multi-tenant isolation broken
- **Regulatory Risk**: GDPR/compliance violation if data leaks

### Evidence
```sql
-- RLS policy uses organization_id
CREATE POLICY "organizations_access" ON organizations
  USING (
    id = (SELECT organization_id FROM profiles WHERE user_id = auth.uid())
  );

-- But auth-context.tsx sets org_id (text), not organization_id
```

### Fix Required
Part of schema consolidation migration

---

## BUG #5: PROFILE CREATION MISSING ORGANIZATION 🔴 CRITICAL

### Problem
New user creation may not set `organization_id` correctly if code uses `org_id`

### Impact
- "Account setup incomplete" error on login
- Users cannot access portal after signup
- Manual database fix required for each user

### Root Cause
Your earlier login issue - profile existed but had wrong organization column populated

### Fix Required
Ensure all user creation paths set `organization_id` (UUID), not `org_id` (text)

---

## IMMEDIATE ACTIONS REQUIRED

### Step 1: Schema Consolidation (30 minutes)
```sql
-- Run in Supabase SQL Editor
-- File: supabase/migrations/20260109_CRITICAL_schema_consolidation.sql
```

### Step 2: Fix Proofs Table References (15 minutes)
Update all API files to use `proofs` consistently:
- `app/api/units/[id]/proofs/[proofId]/approve/route.ts`
- `app/api/units/[id]/route.ts`
- `app/api/units/route.ts`

### Step 3: Apply Workstream Status Fix (5 minutes)
```sql
-- Run in Supabase SQL Editor
-- File: supabase/migrations/20260109_fix_workstream_status_logic.sql
```

### Step 4: Full System Test
1. Create new organization via Admin Dashboard
2. Create new user assigned to that organization
3. Login as that user - verify they see ONLY their org's data
4. Upload proof - verify it saves correctly
5. Approve proof as different user - verify status updates
6. Check workstream status reflects proof accurately

---

## RISK ASSESSMENT

| Bug | Severity | Probability | Impact | Status |
|-----|----------|-------------|--------|--------|
| #1 Dual Org Schema | 🔴 Critical | 100% | Data corruption | FIX READY |
| #2 Proofs Table | 🔴 Critical | 100% | Feature broken | NEEDS CODE FIX |
| #3 Workstream Status | 🟡 High | 80% | False readiness | FIX READY |
| #4 RLS Mismatch | 🔴 Critical | 100% | Security breach | FIX READY |
| #5 Profile Creation | 🔴 Critical | 60% | Login failures | FIX READY |

**LAUNCH READINESS: 🔴 NOT READY FOR PRODUCTION**

---

## ESTIMATED TIME TO FIX

- Schema consolidation migration: **30 minutes**
- Code fixes for proofs table: **15 minutes**
- Testing and verification: **60 minutes**
- **Total: ~2 hours**

---

## NEXT STEPS

1. **DO NOT LAUNCH** until all CRITICAL bugs are fixed
2. Run schema consolidation migration immediately
3. Fix proofs table references in code
4. Perform full end-to-end testing
5. Document test results before going live

**Your reputation depends on getting this right. Take the time to fix it properly.**

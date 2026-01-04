# Proof-First Verification System Implementation

## Overview

This document describes the implementation of the core proof-first, unmanipulatable verification system for the Celestar Portal. This system ensures that zone status can ONLY be changed from RED to GREEN by uploading photographic proof - no manual manipulation is possible.

## Key Principles

1. **Proof is Required**: Status can ONLY change from RED to GREEN when proof is uploaded
2. **Automatic Status Change**: Database triggers automatically update status on proof upload
3. **No Manual Override**: Even supervisors cannot manually change status (only admins for emergency overrides)
4. **Automatic Escalations**: System automatically escalates to authorities at preset deadlines
5. **GPS & Timestamp**: Every proof captures GPS location and timestamp automatically

## Implementation Components

### 1. Database Changes (Migration File)

**File**: `supabase/migrations/20260104_proof_first_enforcement.sql`

**New Fields Added to `zones` Table**:
- `deadline` (timestamptz) - Absolute deadline for zone completion
- `escalation_1_hours` (integer, default 24) - Hours before deadline for L1 escalation
- `escalation_2_hours` (integer, default 16) - Hours before deadline for L2 escalation
- `escalation_3_hours` (integer, default 8) - Hours before deadline for L3 escalation
- `site_coordinator` (text) - Contact for L1 escalation
- `site_authority` (text) - Contact for L2 escalation
- `final_authority` (text) - Contact for L3/final escalation
- `last_escalation_check` (timestamptz) - Tracks when last escalation check ran

**Database Functions**:
1. `auto_green_on_proof()` - Trigger function that runs after proof insert
   - Automatically sets zone status to GREEN
   - Clears escalation flags
   - Creates update record with STATUS_CHANGE type

2. `check_auto_escalations()` - Function to check and create escalations
   - Scans all RED zones with deadlines
   - Creates L1 escalation at T-24 hours (to site coordinator)
   - Creates L2 escalation at T-16 hours (to site authority)
   - Creates L3 escalation at T-8 hours (to final authority)
   - Can be called manually or via cron/scheduled job

**RLS Policy Changes**:
- Removed open update policy for zones
- Only admins can manually update zones (emergency override)
- Supervisors can update zone details but NOT status
- Status changes ONLY through proof upload trigger

### 2. TypeScript Type Updates

**File**: `lib/types.ts`

Updated `Zone` interface with new fields:
```typescript
deadline: Date | string | null;
escalation1Hours: number;
escalation2Hours: number;
escalation3Hours: number;
siteCoordinator: string | null;
siteAuthority: string | null;
finalAuthority: string | null;
lastEscalationCheck: Date | string | null;
```

### 3. UI Changes - Zone Detail Page

**File**: `app/zone/[id]/page.tsx`

**Removed**:
- Manual status change dropdown
- "Save Update" button
- `newStatus` state variable
- `uploadedProofId` state variable
- `saving` state variable
- `handleSaveUpdate()` function

**Modified**:
- `handleUploadProof()` now:
  - Uploads proof with GPS and timestamp
  - Automatically reloads zone data to get new GREEN status
  - Reloads updates to show automatic status change
  - Shows success message: "✅ Proof uploaded! Status automatically changed to GREEN."

**Added**:
- Info box explaining the proof-first system
- Clear messaging that status changes are automatic

### 4. Escalation System

**How It Works**:

1. **When creating a zone**, admin sets:
   - Deadline (absolute date/time)
   - Escalation thresholds (T-24, T-16, T-8 hours, customizable)
   - Authority contacts (site coordinator, site authority, final authority)

2. **System checks every hour** (via cron or scheduled function):
   - Calls `check_auto_escalations()`
   - Scans all RED zones with upcoming deadlines
   - Creates escalation records at appropriate times

3. **Escalation Levels**:
   - **L0**: No escalation (normal state)
   - **L1**: T-24 hours → Site Coordinator notified
   - **L2**: T-16 hours → Site Authority notified
   - **L3**: T-8 hours → Final Authority notified (CRITICAL)

4. **When proof is uploaded**:
   - Status changes to GREEN automatically
   - `is_escalated` set to false
   - `escalation_level` set to NULL
   - Crisis resolved!

## What Still Needs to Be Done

### 1. Admin Panel - Zone Creation UI

**File**: `app/admin/page.tsx`

Need to add these fields to the "Create Zone" dialog:
- **Deadline** (datetime picker)
- **Escalation 1 Hours** (number input, default 24)
- **Escalation 2 Hours** (number input, default 16)
- **Escalation 3 Hours** (number input, default 8)
- **Site Coordinator** (text input)
- **Site Authority** (text input)
- **Final Authority** (text input)

### 2. Run Database Migration

**Steps**:
1. Go to Supabase Dashboard → SQL Editor
2. Open new query
3. Copy contents of `supabase/migrations/20260104_proof_first_enforcement.sql`
4. Run the migration
5. Verify:
   - New columns exist in `zones` table
   - Functions `auto_green_on_proof` and `check_auto_escalations` exist
   - RLS policies updated

### 3. Set Up Escalation Checker Cron

**Option A: Supabase Edge Function + Cron**
1. Create Edge Function that calls `check_auto_escalations()`
2. Set up Supabase Cron to call it every hour

**Option B: External Cron (Vercel Cron, GitHub Actions, etc.)**
1. Create API route `/api/cron/check-escalations`
2. Have it call the database function
3. Set up external cron to hit this endpoint hourly

**Option C: Manual Trigger (Temporary)**
- Admin can manually call the function from SQL Editor when needed
- Run: `SELECT check_auto_escalations();`

### 4. Update Firestore Utils

**File**: `lib/firestore-utils.ts`

The `createZone` function needs to accept and insert the new fields:
```typescript
export async function createZone(
  projectId: string,
  name: string,
  deliverable: string,
  owner: string,
  acceptanceCriteria: string[],
  deadline: Date | null,
  escalation1Hours: number,
  escalation2Hours: number,
  escalation3Hours: number,
  siteCoordinator: string | null,
  siteAuthority: string | null,
  finalAuthority: string | null
)
```

### 5. Testing Checklist

- [ ] Upload proof to RED zone → Verify automatic GREEN change
- [ ] Check update history shows automatic status change
- [ ] Verify manual status change is not possible
- [ ] Create zone with deadline
- [ ] Manually trigger `check_auto_escalations()`
- [ ] Verify escalations create at correct times
- [ ] Upload proof to escalated zone → Verify escalation clears

## Security & Business Value

### Why This Matters

1. **Unmanipulatable**: Clients can TRUST the status - it's backed by proof
2. **Audit Trail**: Every change is tracked with proof, GPS, and timestamp
3. **Automatic Accountability**: Escalations happen automatically - no one can hide problems
4. **Evidence-Based**: All decisions based on photographic evidence, not claims

### Protection Mechanisms

1. **Database Triggers**: Status changes happen at database level, can't be bypassed by UI
2. **RLS Policies**: Row Level Security prevents unauthorized modifications
3. **Proof Requirement**: GREEN status requires proof record in database
4. **GPS & Timestamp**: Every proof has verifiable location and time

## Example Workflow

### Scenario: Building Activation Project

1. **Admin creates zone**:
   - Name: "Stage Setup - Main Hall"
   - Deliverable: "Stage fully assembled with lighting"
   - Owner: "John Supervisor"
   - Deadline: "Jan 10, 2026 18:00"
   - Escalation 1: 24 hours (Jan 9, 18:00 → Site Coordinator)
   - Escalation 2: 16 hours (Jan 10, 02:00 → Site Manager)
   - Escalation 3: 8 hours (Jan 10, 10:00 → Project Director)
   - Status: RED (default)

2. **Jan 9, 18:00** - T-24 hours:
   - System creates L1 escalation
   - Site Coordinator receives notification
   - Status: Still RED

3. **Jan 10, 02:00** - T-16 hours:
   - Still RED
   - System creates L2 escalation
   - Site Manager receives urgent notification

4. **Jan 10, 05:00** - Supervisor uploads proof:
   - Photo of completed stage
   - GPS: 40.7128°N, 74.0060°W
   - Timestamp: Jan 10, 2026 05:00:23
   - **Status automatically changes to GREEN**
   - Escalations cleared
   - Crisis resolved!

## Next Steps

1. Complete admin panel UI for new fields
2. Run database migration in Supabase
3. Test proof upload → automatic status change
4. Set up escalation checker (cron or manual initially)
5. Deploy to production
6. Monitor and verify system works as expected

## Emergency Override

Admins have emergency override capability for edge cases:
- Can manually update zone status via admin panel
- Creates update record with type: 'ADMIN_OVERRIDE'
- Fully audited and tracked
- Should be rare and justified

This maintains system integrity while allowing for exceptional circumstances.

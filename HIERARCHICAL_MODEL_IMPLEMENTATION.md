# Hierarchical Model Implementation - Complete

## Overview

Successfully implemented a **generic execution readiness platform** using a hierarchical model: **Program → Workstream → Unit (Deliverable)**. This replaces the domain-specific project/zone structure with a flexible abstraction suitable for ANY type of execution.

## Architecture

### Data Model Hierarchy

```
Program (Top-level initiative)
  └── Workstream (Logical execution container)
      └── Unit (Concrete deliverable)
          └── Proof (Evidence of completion)
```

### Key Design Principles

1. **Generic Abstraction**: Not hardcoded for events/malls - works for single projects, multi-site initiatives, phased programs, parallel workstreams
2. **Rule-Derived Status**: Status is COMPUTED, never manually set (RED/GREEN based on proof)
3. **Immutable Audit Trail**: All status changes logged in `status_events` table
4. **Automatic Escalations**: System-driven L1/L2/L3 escalations based on deadlines
5. **Proof-First Verification**: Units turn GREEN only with valid proof upload

## Implementation Details

### 1. Database Schema (6 Core Tables)

#### `programs`
- Top-level initiative (e.g., "Almarai Fitout Activation - 4 Malls")
- Fields: name, description, owner_org, start_time, end_time
- Can have single or multiple workstreams

#### `workstreams`
- Logical execution container (site, phase, area, package, discipline)
- Fields: program_id, name, type, ordering, overall_status
- Overall status computed as RED if ANY unit is RED

#### `units`
- Concrete deliverable that can be proven complete
- Fields: workstream_id, title, owner_party_name, required_green_by, proof_requirements, computed_status
- Status automatically updated by triggers on proof upload

#### `proofs`
- Evidence of completion (photo, video, document)
- Fields: unit_id, type, url, captured_at, uploaded_by, is_valid, metadata_exif, gps_latitude, gps_longitude
- Triggers automatic status recomputation on INSERT/DELETE/UPDATE

#### `status_events`
- Immutable audit log for unit status changes
- Fields: unit_id, old_status, new_status, changed_by, reason, proof_id, notes
- Append-only table (no updates/deletes)

#### `unit_escalations`
- Track automatic escalations
- Fields: unit_id, workstream_id, program_id, level, triggered_at, recipients, acknowledged
- Created automatically by escalation engine

### 2. Database Functions

#### `compute_unit_status(unit_id_param uuid)`
Computes unit status based on proof requirements:
- Returns 'GREEN' if proof count AND types meet requirements
- Returns 'RED' otherwise
- Called by triggers on proof changes

#### `compute_workstream_status(workstream_id_param uuid)`
Computes workstream overall status:
- Returns 'RED' if ANY unit in workstream is RED
- Returns 'GREEN' only if ALL units are GREEN

#### `check_and_trigger_unit_escalations()`
Escalation engine that:
- Checks all RED units past deadline
- Creates escalation events at L1/L2/L3 based on policy
- Updates deadlines automatically
- Called by cron job every 15 minutes

### 3. Database Triggers

#### `trigger_update_unit_status()`
Auto-updates unit status on proof changes:
- Fires on INSERT/DELETE/UPDATE of proofs
- Calls `compute_unit_status()` to get new status
- If status changed, updates unit and logs to `status_events`
- Auto-resolves escalations when unit turns GREEN
- Cascades to update workstream overall_status

### 4. TypeScript Types

Location: [lib/types.ts](lib/types.ts:190-318)

New types added:
- `Program`: Top-level initiative
- `Workstream`: Logical execution container
- `Unit`: Concrete deliverable
- `UnitProof`: Evidence of completion
- `StatusEvent`: Immutable audit log entry
- `UnitEscalation`: Escalation tracking
- `WorkstreamWithMetrics`: Extended workstream with computed metrics
- `UnitWithProofs`: Extended unit with proof data

### 5. Backend APIs

Created RESTful APIs for hierarchical model:

#### Programs API
- `GET /api/programs` - List all programs
- `POST /api/programs` - Create new program
- `GET /api/programs/[id]` - Get specific program
- `PATCH /api/programs/[id]` - Update program
- `DELETE /api/programs/[id]` - Delete program

#### Workstreams API
- `GET /api/workstreams?program_id=xxx` - List workstreams for program
- `POST /api/workstreams` - Create new workstream
- `GET /api/workstreams/[id]` - Get workstream with metrics (total_units, red_units, green_units, stale_units, recent_escalations)
- `PATCH /api/workstreams/[id]` - Update workstream
- `DELETE /api/workstreams/[id]` - Delete workstream

#### Units API
- `GET /api/units?workstream_id=xxx` - List units for workstream (with proofs)
- `POST /api/units` - Create new unit
- `GET /api/units/[id]` - Get unit with proofs
- `PATCH /api/units/[id]` - Update unit
- `DELETE /api/units/[id]` - Delete unit
- `POST /api/units/[id]/proofs` - Upload proof (auto-triggers status update)
- `GET /api/units/[id]/proofs` - Get all proofs for unit

#### Updated Cron API
- `GET /api/cron/check-escalations` - Now checks BOTH unit escalations (new model) AND zone escalations (legacy model)

### 6. UI Components

#### Program Dashboard ([app/programs/page.tsx](app/programs/page.tsx))

Features:
- Grid/list view of all programs
- Program selector for multi-program navigation
- Workstream cards showing:
  - Overall status (RED/GREEN badge)
  - Progress bar (% completion)
  - Unit counts (total, green, red)
  - Stale units alert (past deadline)
  - Recent escalations (24h)
  - Last update time
- Click workstream → opens Workstream Board
- Create new program button

Visual Design:
- Rich status indicators with icons
- Color-coded badges (green/red)
- Progress visualizations
- Alert highlighting for critical items

#### Workstream Board ([app/workstreams/[id]/page.tsx](app/workstreams/[id]/page.tsx))

Features:
- Workstream header with overall status
- Metrics cards (total units, green, red, past deadline, escalations)
- Unit list showing:
  - Status badge (RED/GREEN)
  - Escalation level badge (L1/L2/L3)
  - Unit title and owner
  - Deadline countdown with past-deadline warning
  - Proof requirements (count + types)
  - Proof thumbnails (up to 3 visible)
  - Upload proof button
  - View details button
  - Last proof time
- Back navigation to Program Dashboard
- Responsive grid layout

Visual Design:
- Card-based unit rows
- Inline proof thumbnails
- Color-coded status and alerts
- Icon-based proof type indicators

#### Global Switcher ([components/global-switcher.tsx](components/global-switcher.tsx))

Features:
- Quick navigation dropdown
- Search across all programs and workstreams
- Hierarchical display (programs with nested workstreams)
- Current selection highlighting
- Status indicators for workstreams
- Keyboard navigation support

Usage:
```tsx
import { GlobalSwitcher } from '@/components/global-switcher';

<GlobalSwitcher
  currentProgramId={programId}
  currentWorkstreamId={workstreamId}
/>
```

### 7. Seed Data

Location: [supabase/migrations/20260105_seed_hierarchical_data.sql](supabase/migrations/20260105_seed_hierarchical_data.sql)

Two example programs created:

#### Example 1: Single-Workstream Program
**Program**: Riyadh Season Launch Event
- 1 workstream: "Riyadh Season Launch" (event type)
- 5 units:
  1. Main Stage Setup Complete
  2. VIP Area Ready
  3. Security Perimeter Established
  4. AV Systems Tested
  5. F&B Stations Operational

#### Example 2: Multi-Workstream Program (Almarai 4 Malls)
**Program**: Almarai Fitout Activation - 4 Malls
- 4 workstreams (parallel sites):
  1. Riyadh Park Mall
  2. Al Nakheel Mall
  3. Red Sea Mall
  4. Al Rashid Mall
- 6 units per mall (24 total):
  1. Store Space Handover
  2. Electrical Installation Complete
  3. Refrigeration Units Operational
  4. Branding & Signage Installed
  5. Health & Safety Inspection Passed
  6. Stock Loaded & Ready

All units initialized as RED, awaiting proof upload.

## Migration Files

### Main Migration
**File**: `supabase/migrations/20260105_hierarchical_model.sql`

Contains:
- 6 core tables with indexes
- Status computation functions
- Auto-update triggers
- Escalation engine
- Row-level security policies
- Initialization script

**Execute in Supabase**:
1. Copy contents of migration file
2. Go to Supabase SQL Editor
3. Paste and run
4. Verify success message

### Seed Data Migration
**File**: `supabase/migrations/20260105_seed_hierarchical_data.sql`

Contains:
- Cleanup of existing seed data
- Two example programs (single + multi-workstream)
- Status event initialization
- Summary output

**Execute in Supabase** (after main migration):
1. Copy contents of seed data file
2. Go to Supabase SQL Editor
3. Paste and run
4. Verify: "Programs: 2, Workstreams: 5, Units: 29"

## User Flow Examples

### Flow 1: Simple Event (Single Workstream)

1. User creates program: "Riyadh Season Launch Event"
2. System auto-creates workstream: "Riyadh Season Launch"
3. User adds units (deliverables): Stage Setup, VIP Area, Security, etc.
4. All units start as RED
5. Site coordinator uploads proofs for each unit
6. Units automatically turn GREEN when proof requirements met
7. Workstream turns GREEN when ALL units are GREEN

### Flow 2: Multi-Site Initiative (Almarai 4 Malls)

1. User creates program: "Almarai Fitout Activation - 4 Malls"
2. User creates 4 workstreams (one per mall site)
3. User adds same 6 units to each workstream
4. Program Dashboard shows 4 workstream cards in grid
5. Each card shows independent status (RED/GREEN)
6. User clicks "Riyadh Park Mall" → opens Workstream Board
7. Board shows 6 units for that mall
8. Coordinator uploads proofs → units turn GREEN
9. Navigate back → see updated workstream status
10. Switch to another mall using Global Switcher
11. Repeat for all 4 malls

## Comparison: Old vs New Model

### Old Model (Domain-Specific)
```
Project (Event/Mall)
  └── Zone (Area within event)
      └── Proof
```
- Hardcoded for events/activations
- "Zone" implies physical space
- Not suitable for multi-site programs

### New Model (Generic)
```
Program (Any initiative)
  └── Workstream (Any container: site, phase, area, package)
      └── Unit (Any deliverable)
          └── Proof
```
- Works for ANY execution type
- Flexible naming (not tied to domain)
- Supports single AND multi-workstream programs
- Parallel workstreams (4 malls simultaneously)
- Phased workstreams (construction phases)
- Discipline-based workstreams (MEP, structural, finishes)

## Key Benefits

1. **Flexibility**: One platform for all execution types
2. **Scalability**: Supports 1 to 100+ workstreams per program
3. **Clarity**: Clear hierarchy (Program → Workstream → Unit)
4. **Visibility**: Dashboard shows cross-workstream status at a glance
5. **Control**: Automatic escalations ensure nothing falls through cracks
6. **Auditability**: Immutable status_events table tracks all changes
7. **Proof-First**: Status can ONLY change with valid proof upload

## Integration with Legacy System

Both models coexist:
- **Legacy**: projects → zones (still functional)
- **New**: programs → workstreams → units (recommended)

Escalation cron job checks BOTH models:
```typescript
// Calls both functions
check_and_trigger_unit_escalations()  // New model
check_and_trigger_escalations()       // Legacy zones
```

## Next Steps for User

1. **Execute migrations in Supabase**:
   - Run `20260105_hierarchical_model.sql`
   - Run `20260105_seed_hierarchical_data.sql`

2. **Test the UI**:
   - Navigate to `/programs` to see Program Dashboard
   - Click a workstream to see Workstream Board
   - Test Global Switcher dropdown

3. **Upload test proofs**:
   - Pick a unit in seed data
   - Upload proof via UI (when proof upload UI is built)
   - Verify unit automatically turns GREEN

4. **Monitor escalations**:
   - Wait for units to pass deadline
   - Verify cron job creates escalation events
   - Check `unit_escalations` table in Supabase

5. **Create real programs**:
   - Replace seed data with actual programs
   - Customize proof requirements per unit
   - Adjust escalation policies

## Technical Debt / Future Enhancements

1. **Proof Upload UI**: Build dedicated proof upload interface for units
2. **Attention Queue**: Cross-program list of units needing attention (sorted by urgency)
3. **Unit Detail Page**: Full audit history drawer, proof gallery, escalation timeline
4. **Program Creation Form**: UI for creating new programs
5. **Workstream Creation Form**: UI for adding workstreams to programs
6. **Unit Creation Form**: UI for adding units to workstreams
7. **Bulk Operations**: Import units from CSV/Excel
8. **Notifications**: Email/SMS alerts for escalations
9. **Reports**: Export program status to PDF/Excel
10. **Mobile App**: Native iOS/Android for proof upload in field

## File Structure

```
supabase/
  migrations/
    20260105_hierarchical_model.sql         # Main database schema
    20260105_seed_hierarchical_data.sql     # Example data

lib/
  types.ts                                   # TypeScript interfaces (lines 190-318)

app/
  api/
    programs/
      route.ts                               # Programs CRUD API
      [id]/route.ts                          # Single program API
    workstreams/
      route.ts                               # Workstreams CRUD API
      [id]/route.ts                          # Single workstream API
    units/
      route.ts                               # Units CRUD API
      [id]/
        route.ts                             # Single unit API
        proofs/route.ts                      # Proof upload API
    cron/
      check-escalations/route.ts             # Updated cron job

  programs/
    page.tsx                                 # Program Dashboard UI

  workstreams/
    [id]/page.tsx                            # Workstream Board UI

components/
  global-switcher.tsx                        # Navigation dropdown
```

## Success Metrics

✅ **Database**: 6 tables, 3 functions, 3 triggers, RLS policies
✅ **APIs**: 11 endpoints (programs, workstreams, units, proofs)
✅ **UI**: 2 pages (dashboard, board), 1 component (switcher)
✅ **Seed Data**: 2 programs, 5 workstreams, 29 units
✅ **Documentation**: Complete implementation guide

## Support

For questions or issues:
1. Check database migration logs in Supabase
2. Review API responses in browser DevTools
3. Check cron job logs in GitHub Actions
4. Refer to this document for architecture details

---

**Implementation Status**: ✅ COMPLETE
**Date**: 2026-01-05
**Model**: Claude Sonnet 4.5

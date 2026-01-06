# RBAC Implementation Guide

This guide walks you through deploying the complete Role-Based Access Control (RBAC) system for the Execution Readiness Platform.

## Overview

The RBAC system implements 5 roles with hierarchical permissions:

1. **PLATFORM_ADMIN** - Full system access (Celestar admin)
2. **PROGRAM_OWNER** - Can create/manage programs and all nested resources
3. **WORKSTREAM_LEAD** - Can manage workstreams and units within assigned workstreams
4. **FIELD_CONTRIBUTOR** - Can manage units and upload proofs
5. **CLIENT_VIEWER** - Read-only access to assigned programs

## Step 1: Run Database Migrations

Run these migrations in order in your Supabase SQL Editor:

### Migration 1: RBAC Schema
```bash
# File: supabase/migrations/20260106_rbac_implementation.sql
```

This creates:
- `app_role` enum type
- `orgs` table
- `profiles` table
- `program_members` and `workstream_members` tables
- Permission helper functions (11 functions)
- Row-Level Security policies on all tables

### Migration 2: Seed Organizations
```bash
# File: supabase/migrations/20260106_seed_orgs_and_update_programs.sql
```

This creates:
- 2 sample organizations (Celestar, Almarai)
- Updates existing programs with org_id

### Migration 3: User Cleanup
```bash
# File: supabase/migrations/20260106_create_test_users.sql
```

This deletes existing users from the `users` table (legacy) and `profiles` table (new).

**IMPORTANT:** Auth users must be deleted manually via Supabase Dashboard or API (not via SQL).

## Step 2: Delete Existing Auth Users

### Option A: Via Supabase Dashboard
1. Go to Authentication > Users
2. Select all users
3. Click Delete

### Option B: Via API (Recommended)
Create a script to delete all users:

```typescript
// scripts/delete-all-users.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function deleteAllUsers() {
  const { data: { users } } = await supabase.auth.admin.listUsers();

  for (const user of users) {
    await supabase.auth.admin.deleteUser(user.id);
    console.log(`Deleted user: ${user.email}`);
  }

  console.log('All users deleted');
}

deleteAllUsers();
```

Run with:
```bash
npx ts-node scripts/delete-all-users.ts
```

## Step 3: Create Test Users

Use the new `/api/admin/create-rbac-user` endpoint to create test users.

### Required: Create Initial Platform Admin

**IMPORTANT:** Create this user FIRST using Supabase Dashboard Auth UI:

1. Go to Authentication > Users > Add User
2. Email: `admin@celestar.com`
3. Password: `Admin@123`
4. Confirm email: YES
5. Copy the user ID

Then insert profile manually via SQL:
```sql
INSERT INTO profiles (user_id, org_id, full_name, role, email)
VALUES (
  '<USER_ID_FROM_STEP_5>',
  'org_celestar',
  'Platform Administrator',
  'PLATFORM_ADMIN',
  'admin@celestar.com'
);
```

### Create Remaining Test Users via API

Once you have the platform admin user, use the API to create remaining users.

**API Endpoint:** `POST /api/admin/create-rbac-user`

**Headers:**
```
Authorization: Bearer <ADMIN_TOKEN>
Content-Type: application/json
```

**Body Schema:**
```typescript
{
  email: string;
  password: string;
  full_name: string;
  org_id: string;
  role: 'PLATFORM_ADMIN' | 'PROGRAM_OWNER' | 'WORKSTREAM_LEAD' | 'FIELD_CONTRIBUTOR' | 'CLIENT_VIEWER';
  program_id?: string;        // Optional: assign to program
  workstream_id?: string;     // Optional: assign to workstream
  role_override?: AppRole;    // Optional: override role at program/workstream level
}
```

### Test Users to Create:

#### 1. Program Owner - Celestar
```json
{
  "email": "program.owner@celestar.com",
  "password": "Owner@123",
  "full_name": "Program Owner (Celestar)",
  "org_id": "org_celestar",
  "role": "PROGRAM_OWNER"
}
```

#### 2. Program Owner - Almarai
```json
{
  "email": "program.owner@almarai.com",
  "password": "Owner@123",
  "full_name": "Program Owner (Almarai)",
  "org_id": "org_almarai",
  "role": "PROGRAM_OWNER"
}
```

#### 3. Workstream Lead - Riyadh Zones
First, get the workstream ID for "Riyadh Season Zones":
```sql
SELECT id FROM workstreams WHERE name = 'Riyadh Season Zones';
```

Then create the user:
```json
{
  "email": "workstream.lead@celestar.com",
  "password": "Lead@123",
  "full_name": "Workstream Lead",
  "org_id": "org_celestar",
  "role": "WORKSTREAM_LEAD",
  "workstream_id": "<WORKSTREAM_ID>",
  "role_override": "WORKSTREAM_LEAD"
}
```

#### 4. Workstream Lead - Almarai Jeddah
Get the workstream ID for "Jeddah Mall":
```sql
SELECT id FROM workstreams WHERE name = 'Jeddah Mall';
```

```json
{
  "email": "workstream.jeddah@almarai.com",
  "password": "Lead@123",
  "full_name": "Jeddah Mall Lead",
  "org_id": "org_almarai",
  "role": "WORKSTREAM_LEAD",
  "workstream_id": "<WORKSTREAM_ID>",
  "role_override": "WORKSTREAM_LEAD"
}
```

#### 5. Field Contributor
```json
{
  "email": "field@celestar.com",
  "password": "Field@123",
  "full_name": "Field Contributor",
  "org_id": "org_celestar",
  "role": "FIELD_CONTRIBUTOR"
}
```

#### 6. Client Viewer - Celestar
```json
{
  "email": "client@celestar.com",
  "password": "Client@123",
  "full_name": "Client Viewer (Celestar)",
  "org_id": "org_celestar",
  "role": "CLIENT_VIEWER"
}
```

#### 7. Client Viewer - Almarai
```json
{
  "email": "client@almarai.com",
  "password": "Client@123",
  "full_name": "Client Viewer (Almarai)",
  "org_id": "org_almarai",
  "role": "CLIENT_VIEWER"
}
```

## Step 4: Test the System

### Test Role Permissions

1. **Platform Admin** (`admin@celestar.com`)
   - Should see all programs (Celestar + Almarai)
   - Can create new programs
   - Can manage all resources

2. **Program Owner** (`program.owner@celestar.com`)
   - Should see only Celestar programs
   - Can create new programs in Celestar org
   - Can manage all workstreams/units in their programs

3. **Workstream Lead** (`workstream.lead@celestar.com`)
   - Should see assigned workstream
   - Can manage units in their workstream
   - Can upload and approve proofs
   - Cannot create programs

4. **Field Contributor** (`field@celestar.com`)
   - Can view programs in their org
   - Can upload proofs
   - Cannot approve proofs
   - Cannot create/edit programs or workstreams

5. **Client Viewer** (`client@celestar.com`)
   - Read-only access
   - Cannot upload proofs
   - Cannot create/edit anything

### Test UI Permission Gating

- "New Program" button should only appear for PLATFORM_ADMIN and PROGRAM_OWNER
- Role should be displayed in the header (e.g., "Execution readiness across all programs (PROGRAM_OWNER)")
- Unauthorized API calls should return 403 errors

## Step 5: Deploy

Once all migrations are run and test users are created:

```bash
git add .
git commit -m "Implement complete RBAC system with 5 roles

- Add app_role enum and RBAC tables (orgs, profiles, members)
- Create 11 permission helper SQL functions
- Apply RLS policies to all hierarchical model tables
- Create API authorization utilities
- Add usePermissions() hook for UI gating
- Update all API endpoints with authorization checks
- Make new UI default for RBAC users
- Create test users for all 5 roles

🤖 Generated with Claude Code
Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

git push
```

## Troubleshooting

### Issue: API returns 401 Unauthorized
- Check that you're passing the Authorization header
- Verify token is valid: `supabase.auth.getSession()`
- Check that user has a profile in the `profiles` table

### Issue: User sees no programs
- Verify user's `org_id` matches program's `org_id`
- Check RLS policies are enabled
- Verify permission helper functions return expected values

### Issue: Cannot create users via API
- Ensure requesting user is PLATFORM_ADMIN
- Check environment variables are set
- Verify Supabase service role key is correct

## Next Steps

- Add UI for creating/editing programs, workstreams, and units
- Add proof upload UI with permission checks
- Add escalation acknowledgment UI
- Add org/user management UI for platform admins
- Add audit logging for all permission-gated actions

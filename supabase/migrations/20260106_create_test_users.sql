-- Create Test Users for RBAC System
-- Migration: 20260106_create_test_users.sql
-- NOTE: This migration deletes all existing users and creates new test users

-- ============================================================================
-- 1. DELETE EXISTING USERS FROM PROFILES/USERS TABLE
-- ============================================================================

-- Delete from legacy users table if it exists
DELETE FROM users WHERE true;

-- Delete from new profiles table
DELETE FROM profiles WHERE true;

-- Note: auth.users will be deleted via the admin API, not SQL
-- The create-user API endpoint will handle auth user creation

-- ============================================================================
-- 2. SAMPLE TEST USER DATA
-- ============================================================================

-- The following users should be created via the admin API:
-- Use: POST /api/admin/create-rbac-user

/*
Test Users to Create:

1. Platform Admin
   - Email: admin@celestar.com
   - Password: Admin@123
   - Org: org_celestar
   - Role: PLATFORM_ADMIN
   - Full Name: Platform Administrator

2. Program Owner - Celestar
   - Email: program.owner@celestar.com
   - Password: Owner@123
   - Org: org_celestar
   - Role: PROGRAM_OWNER
   - Full Name: Program Owner (Celestar)
   - Assigned to: Riyadh Season Launch Event

3. Program Owner - Almarai
   - Email: program.owner@almarai.com
   - Password: Owner@123
   - Org: org_almarai
   - Role: PROGRAM_OWNER
   - Full Name: Program Owner (Almarai)
   - Assigned to: Almarai 4 Malls

4. Workstream Lead - Riyadh Zones
   - Email: workstream.lead@celestar.com
   - Password: Lead@123
   - Org: org_celestar
   - Role: WORKSTREAM_LEAD
   - Full Name: Workstream Lead
   - Assigned to: Riyadh Season Zones workstream

5. Workstream Lead - Almarai Jeddah
   - Email: workstream.jeddah@almarai.com
   - Password: Lead@123
   - Org: org_almarai
   - Role: WORKSTREAM_LEAD
   - Full Name: Jeddah Mall Lead
   - Assigned to: Jeddah Mall workstream

6. Field Contributor
   - Email: field@celestar.com
   - Password: Field@123
   - Org: org_celestar
   - Role: FIELD_CONTRIBUTOR
   - Full Name: Field Contributor

7. Client Viewer - Celestar
   - Email: client@celestar.com
   - Password: Client@123
   - Org: org_celestar
   - Role: CLIENT_VIEWER
   - Full Name: Client Viewer (Celestar)

8. Client Viewer - Almarai
   - Email: client@almarai.com
   - Password: Client@123
   - Org: org_almarai
   - Role: CLIENT_VIEWER
   - Full Name: Client Viewer (Almarai)
*/

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- NEXT STEPS:
-- 1. Create an API endpoint: /api/admin/create-rbac-user
-- 2. Use that endpoint to create the test users listed above
-- 3. The endpoint will create auth.users AND profiles entries
-- 4. Optionally assign users to specific programs/workstreams via program_members/workstream_members

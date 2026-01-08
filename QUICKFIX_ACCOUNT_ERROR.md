# Quick Fix: "Account setup incomplete" Error

## Problem
You see this error when logging in:
> Account setup incomplete. Please contact administrator.

## Cause
Your user exists in Supabase Auth, but doesn't have a corresponding profile record in the `profiles` table.

## Solution (5 minutes)

### Step 1: Go to Supabase SQL Editor
1. Open your Supabase Dashboard
2. Click **SQL Editor** in the left sidebar
3. Click **New Query**

### Step 2: Find Your User ID
Paste and run this query:

```sql
SELECT
  au.id as user_id,
  au.email,
  CASE
    WHEN p.user_id IS NOT NULL THEN '✅ Has Profile'
    ELSE '❌ MISSING PROFILE'
  END as profile_status
FROM auth.users au
LEFT JOIN profiles p ON au.id = p.user_id
ORDER BY au.created_at DESC;
```

**Result**: You'll see a list of users. Find your email and copy the `user_id` (it's a long UUID like `550e8400-e29b-41d4-a716-446655440000`)

### Step 3: Create Your Profile
Replace the values below with your actual data and run:

```sql
INSERT INTO profiles (user_id, email, full_name, role, organization_id)
SELECT
  'YOUR_USER_ID_HERE'::uuid,  -- ⚠️ PASTE YOUR USER_ID FROM STEP 2
  'your-email@example.com',    -- ⚠️ YOUR ACTUAL EMAIL
  'Admin User',                -- Your name (optional)
  'PLATFORM_ADMIN',            -- This gives you full admin access
  (SELECT id FROM organizations WHERE name = 'Platform Admin Organization' LIMIT 1)
ON CONFLICT (user_id) DO UPDATE
SET
  email = EXCLUDED.email,
  role = EXCLUDED.role,
  organization_id = EXCLUDED.organization_id;
```

**Example** (with fake data):
```sql
INSERT INTO profiles (user_id, email, full_name, role, organization_id)
SELECT
  '550e8400-e29b-41d4-a716-446655440000'::uuid,
  'muaaz@gmail.com',
  'Muaaz Ahmad',
  'PLATFORM_ADMIN',
  (SELECT id FROM organizations WHERE name = 'Platform Admin Organization' LIMIT 1)
ON CONFLICT (user_id) DO UPDATE
SET
  email = EXCLUDED.email,
  role = EXCLUDED.role,
  organization_id = EXCLUDED.organization_id;
```

### Step 4: Verify
Run this to confirm the profile was created:

```sql
SELECT * FROM profiles WHERE email = 'your-email@example.com';  -- ⚠️ YOUR EMAIL
```

You should see your profile with `role = 'PLATFORM_ADMIN'`.

### Step 5: Login Again
1. Go back to the login page
2. Enter your credentials
3. You should now successfully login!

---

## Alternative: If You Don't Know Your Email

If you forgot which email you used, run this to see all auth users:

```sql
SELECT id, email, created_at FROM auth.users ORDER BY created_at DESC;
```

Then follow Steps 3-5 above.

---

## Need Help?

If you're still having issues:
1. Check that the `organizations` table has a "Platform Admin Organization" entry
2. Make sure you're using the correct email (the one you use to login)
3. Verify the user_id is a valid UUID from the auth.users table

The profile MUST match the exact email you use for authentication.

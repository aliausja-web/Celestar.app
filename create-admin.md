# Create Admin Account - Step by Step Guide

## Step 1: Clean Up Existing Users

### Delete from Supabase Auth:
1. Go to https://supabase.com/dashboard
2. Select your project
3. Navigate to **Authentication** → **Users**
4. Select all users (checkbox at top)
5. Click **Delete users** button
6. Confirm deletion

### Delete from Users Table:
1. In Supabase Dashboard, go to **SQL Editor**
2. Click **New query**
3. Paste and run:
```sql
DELETE FROM users;
```

## Step 2: Create New Admin Account

### Create Auth User:
1. In Supabase Dashboard, go to **Authentication** → **Users**
2. Click **Add user** → **Create new user**
3. Fill in:
   - **Email**: admin@celestar.com (or your preferred admin email)
   - **Password**: [Choose a secure password]
   - **Auto Confirm User**: ✓ Check this box
4. Click **Create user**
5. **COPY THE USER ID** - you'll need this for the next step

### Create Users Table Record:
1. Go to **SQL Editor** in Supabase
2. Click **New query**
3. Paste this SQL (replace `YOUR_USER_ID` with the ID you copied):
```sql
INSERT INTO users (uid, email, role, org_id)
VALUES (
  'YOUR_USER_ID',  -- Replace with the UID from the auth user you just created
  'admin@celestar.com',  -- Same email as auth user
  'admin',
  'org_001'
);
```
4. Click **Run**

## Step 3: Verify Admin Login

1. Go to https://celestar.app
2. Log in with:
   - Email: admin@celestar.com (or the email you used)
   - Password: [the password you set]
3. You should be redirected to the admin dashboard

## Step 4: Create Additional Users via UI

Now that you have admin access:
1. Go to the **Users** tab in the admin panel
2. Click **+ New User**
3. Create client and supervisor accounts as needed

All future users should be created through the admin UI - never manually in Supabase Auth.

## Important Notes

- The admin user MUST exist in BOTH places:
  1. Supabase Auth (for login credentials)
  2. Users table (for role and permissions)
- The `uid` in the users table MUST match the `id` from Supabase Auth
- Always use the same email in both places
- Once admin is set up, use the UI to create all other users

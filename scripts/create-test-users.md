# Create Test Users in Supabase

Follow these steps to create test users for the Celestar Portal:

## Option 1: Using Supabase Dashboard (Recommended)

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Navigate to **Authentication** → **Users**
4. Click **Add User** → **Create new user**

### Create these 3 users:

#### 1. Admin User
- Email: `admin@celestar.com`
- Password: `password123`
- Auto Confirm User: ✓ (check this box)

#### 2. Supervisor User
- Email: `supervisor@celestar.com`
- Password: `password123`
- Auto Confirm User: ✓ (check this box)

#### 3. Client User
- Email: `client@celestar.com`
- Password: `password123`
- Auto Confirm User: ✓ (check this box)

## Option 2: After Creating Auth Users, Add User Data

After creating users in Supabase Auth, you need to add their role data to the `users` table.

Run this SQL in the **SQL Editor**:

```sql
-- Get the UIDs of the created users
SELECT id, email FROM auth.users WHERE email IN ('admin@celestar.com', 'supervisor@celestar.com', 'client@celestar.com');

-- Then insert into users table (replace the UIDs with actual values from above query)
INSERT INTO users (uid, email, role, org_id)
VALUES
  ('<admin-uid-here>', 'admin@celestar.com', 'admin', 'celestar'),
  ('<supervisor-uid-here>', 'supervisor@celestar.com', 'supervisor', 'celestar'),
  ('<client-uid-here>', 'client@celestar.com', 'client', 'celestar')
ON CONFLICT (uid) DO NOTHING;
```

## Quick Test

After creating users, you can log in at:
- Local: http://localhost:3000/login
- Use any of the test accounts above

## Credentials Summary
- **Admin**: admin@celestar.com / password123
- **Supervisor**: supervisor@celestar.com / password123
- **Client**: client@celestar.com / password123

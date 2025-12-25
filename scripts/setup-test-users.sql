-- =====================================================
-- Celestar Portal - Test Users Setup Script
-- =====================================================
-- Run this in your Supabase SQL Editor to create test users
--
-- IMPORTANT: This creates users in both auth.users and public.users tables
-- with the following credentials:
--
-- Admin:      admin@celestar.com / password123
-- Supervisor: supervisor@celestar.com / password123
-- Client:     client@celestar.com / password123
-- =====================================================

-- Create Admin User
DO $$
DECLARE
  admin_uid uuid;
BEGIN
  -- Check if user already exists
  SELECT id INTO admin_uid FROM auth.users WHERE email = 'admin@celestar.com';

  IF admin_uid IS NULL THEN
    -- Create auth user (Supabase will send confirmation email if enabled)
    -- Note: You may need to create users via Dashboard if this doesn't work
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      created_at,
      updated_at,
      raw_app_meta_data,
      raw_user_meta_data,
      is_super_admin,
      confirmation_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      'admin@celestar.com',
      crypt('password123', gen_salt('bf')),
      NOW(),
      NOW(),
      NOW(),
      '{"provider":"email","providers":["email"]}',
      '{}',
      FALSE,
      ''
    )
    RETURNING id INTO admin_uid;

    -- Insert into public.users table
    INSERT INTO public.users (uid, email, role, org_id)
    VALUES (admin_uid, 'admin@celestar.com', 'admin', 'celestar')
    ON CONFLICT (uid) DO NOTHING;

    RAISE NOTICE 'Admin user created with UID: %', admin_uid;
  ELSE
    -- User exists, just ensure they're in public.users
    INSERT INTO public.users (uid, email, role, org_id)
    VALUES (admin_uid, 'admin@celestar.com', 'admin', 'celestar')
    ON CONFLICT (uid) DO UPDATE SET role = 'admin', org_id = 'celestar';

    RAISE NOTICE 'Admin user already exists with UID: %', admin_uid;
  END IF;
END $$;

-- Create Supervisor User
DO $$
DECLARE
  supervisor_uid uuid;
BEGIN
  SELECT id INTO supervisor_uid FROM auth.users WHERE email = 'supervisor@celestar.com';

  IF supervisor_uid IS NULL THEN
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      created_at,
      updated_at,
      raw_app_meta_data,
      raw_user_meta_data,
      is_super_admin,
      confirmation_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      'supervisor@celestar.com',
      crypt('password123', gen_salt('bf')),
      NOW(),
      NOW(),
      NOW(),
      '{"provider":"email","providers":["email"]}',
      '{}',
      FALSE,
      ''
    )
    RETURNING id INTO supervisor_uid;

    INSERT INTO public.users (uid, email, role, org_id)
    VALUES (supervisor_uid, 'supervisor@celestar.com', 'supervisor', 'celestar')
    ON CONFLICT (uid) DO NOTHING;

    RAISE NOTICE 'Supervisor user created with UID: %', supervisor_uid;
  ELSE
    INSERT INTO public.users (uid, email, role, org_id)
    VALUES (supervisor_uid, 'supervisor@celestar.com', 'supervisor', 'celestar')
    ON CONFLICT (uid) DO UPDATE SET role = 'supervisor', org_id = 'celestar';

    RAISE NOTICE 'Supervisor user already exists with UID: %', supervisor_uid;
  END IF;
END $$;

-- Create Client User
DO $$
DECLARE
  client_uid uuid;
BEGIN
  SELECT id INTO client_uid FROM auth.users WHERE email = 'client@celestar.com';

  IF client_uid IS NULL THEN
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      created_at,
      updated_at,
      raw_app_meta_data,
      raw_user_meta_data,
      is_super_admin,
      confirmation_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      'client@celestar.com',
      crypt('password123', gen_salt('bf')),
      NOW(),
      NOW(),
      NOW(),
      '{"provider":"email","providers":["email"]}',
      '{}',
      FALSE,
      ''
    )
    RETURNING id INTO client_uid;

    INSERT INTO public.users (uid, email, role, org_id)
    VALUES (client_uid, 'client@celestar.com', 'client', 'celestar')
    ON CONFLICT (uid) DO NOTHING;

    RAISE NOTICE 'Client user created with UID: %', client_uid;
  ELSE
    INSERT INTO public.users (uid, email, role, org_id)
    VALUES (client_uid, 'client@celestar.com', 'client', 'celestar')
    ON CONFLICT (uid) DO UPDATE SET role = 'client', org_id = 'celestar';

    RAISE NOTICE 'Client user already exists with UID: %', client_uid;
  END IF;
END $$;

-- Verify users were created
SELECT
  u.email,
  pu.role,
  pu.org_id,
  u.email_confirmed_at
FROM auth.users u
LEFT JOIN public.users pu ON u.id = pu.uid
WHERE u.email IN ('admin@celestar.com', 'supervisor@celestar.com', 'client@celestar.com')
ORDER BY pu.role;

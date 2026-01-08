# How to Onboard a New Client

This is a simple 3-step process you'll run whenever you get a new client.

---

## Step 1: Create the Client's Organization (30 seconds)

In Supabase SQL Editor:

```sql
-- Replace with your actual client's name and email
INSERT INTO organizations (name, type, is_active, contact_email) VALUES
  ('Client Company Name', 'client', true, 'client@example.com')
RETURNING id, name, type;
```

**Save the organization ID** that's returned - you'll need it for Steps 2 and 3.

---

## Step 2: Create Client Users

When a new client user signs up through your portal, link them to the organization:

```sql
-- Replace [CLIENT_ORG_ID] with the ID from Step 1
-- Replace the email with the actual user's email
UPDATE profiles
SET organization_id = '[CLIENT_ORG_ID]'
WHERE email = 'newuser@clientcompany.com';
```

**Repeat for each user** from that client organization.

---

## Step 3: Create Client's Programs

When creating a program for this client:

```sql
-- Replace [CLIENT_ORG_ID] with the ID from Step 1
INSERT INTO programs (name, description, client_organization_id, start_date, end_date) VALUES
  ('Client Program Name', 'Program description', '[CLIENT_ORG_ID]', '2026-01-15', '2026-03-30')
RETURNING id, name;
```

**That's it!** The client organization is now set up with complete data isolation.

---

## What Happens Automatically

✅ **Multi-Client Isolation**: Client A cannot see Client B's data
✅ **RLS Enforcement**: Database-level security ensures separation
✅ **Notifications**: Users only get alerts for their organization's programs
✅ **Escalations**: Only relevant team members are notified
✅ **Platform Admin Access**: You (as Platform Admin) can see all clients

---

## Testing Client Isolation

After onboarding a new client, verify isolation works:

1. **Log in as Client A user** → Should only see Client A's programs
2. **Log in as Client B user** → Should only see Client B's programs
3. **Log in as Platform Admin** → Should see ALL programs from ALL clients

---

## Example: Onboarding "Acme Corp"

```sql
-- 1. Create organization
INSERT INTO organizations (name, type, is_active, contact_email) VALUES
  ('Acme Corp', 'client', true, 'contact@acmecorp.com')
RETURNING id, name, type;
-- Returns: id = 'abc-123-xyz', name = 'Acme Corp', type = 'client'

-- 2. Link their users (after they sign up)
UPDATE profiles
SET organization_id = 'abc-123-xyz'
WHERE email IN ('john@acmecorp.com', 'sarah@acmecorp.com');

-- 3. Create their program
INSERT INTO programs (name, description, client_organization_id, start_date, end_date) VALUES
  ('Acme Festival 2026', 'Annual company festival', 'abc-123-xyz', '2026-06-01', '2026-06-15')
RETURNING id, name;
```

Done! Acme Corp is now onboarded and fully isolated from other clients.

---

## Quick Reference: Organization Types

- `'client'` → Your paying clients (isolated from each other)
- `'contractor'` → External contractors (if you ever need them)
- `'platform'` → Your company (Platform Admin organization)

---

Generated: 2026-01-08
System: Celestar v2.0 - Multi-Tenant Production

# Celestar - Execution Readiness Portal

A production-ready web application for proof-first execution verification with role-based access control.

## Features

- **Role-Based Access Control**: Three roles with distinct permissions
  - **Client** (view-only): View project dashboards, zone statuses, and proofs
  - **Supervisor** (field): Update zones, upload proof, add notes
  - **Admin** (full control): Manage everything + escalate issues

- **Proof-First Enforcement**: Status changes require photo/video proof
- **Append-Only Audit**: Immutable update history
- **Real-Time Escalations**: Admin-only escalation management with levels L0-L3
- **Mobile-First**: Optimized for supervisor field updates from mobile devices

## Tech Stack

- **Framework**: Next.js 13 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **Backend**: Firebase (Auth, Firestore, Storage)
- **Deployment**: Vercel-ready

## Setup Instructions

### 1. Firebase Configuration

1. Create a new Firebase project at https://console.firebase.google.com
2. Enable Authentication with Email/Password
3. Create a Firestore database
4. Enable Firebase Storage
5. Copy your Firebase config and update `.env`:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

### 2. Deploy Security Rules

Deploy the Firestore and Storage security rules to Firebase:

**Firestore Rules** (from `firestore.rules`):
- Go to Firebase Console → Firestore Database → Rules
- Copy and paste the contents of `firestore.rules`
- Click "Publish"

**Storage Rules** (from `storage.rules`):
- Go to Firebase Console → Storage → Rules
- Copy and paste the contents of `storage.rules`
- Click "Publish"

### 3. Install Dependencies

```bash
npm install
```

### 4. Seed Data

Run the seed script to populate demo users and sample project data:

```bash
npx tsx scripts/seed-data.ts
```

This creates:
- **3 demo users** with roles (admin, supervisor, client)
- **1 sample project** (L'Oréal Mall Fit-Out)
- **8 zones** with mixed RED/AMBER/GREEN statuses

### 5. Run Development Server

```bash
npm run dev
```

Visit http://localhost:3000

### 6. Demo Accounts

**Admin Access:**
- Email: admin@celestar.com
- Password: admin123

**Supervisor Access:**
- Email: supervisor@celestar.com
- Password: supervisor123

**Client Access:**
- Email: client@celestar.com
- Password: client123

## Key Rules

### Proof-First Enforcement

1. Any status update to **GREEN** requires proof upload
2. Any status change from **RED** → **AMBER** or **RED** → **GREEN** requires proof
3. Supervisors cannot change status without uploading proof first
4. All proofs are stored in Firebase Storage with metadata

### Role Permissions

**Client:**
- ✅ View project dashboards and zone statuses
- ✅ View proofs and escalation status
- ❌ Cannot change status, upload proof, or escalate

**Supervisor:**
- ✅ Upload photos/videos from any device
- ✅ Add notes and update zone status (with proof)
- ❌ Cannot escalate
- ❌ Cannot edit acceptance criteria

**Admin:**
- ✅ Full access to all features
- ✅ Can escalate zones (L1-L3 levels)
- ✅ Can manage projects, zones, and users
- ✅ Can review audit logs

### Escalation Visibility

- **Clients**: See escalated badge + level + time
- **Supervisors**: See escalated badge only
- **Admin**: Full escalation controls

## Data Model

### Collections

```typescript
users {
  uid: string
  email: string
  role: 'admin' | 'supervisor' | 'client'
  orgId: string
}

projects {
  name: string
  brand: string
  agency: string
  location: string
  startDate: string
}

zones {
  projectId: string
  name: string
  deliverable: string
  owner: string
  status: 'RED' | 'AMBER' | 'GREEN'
  acceptanceCriteria: string[]
  isEscalated: boolean
  escalationLevel: 'L0' | 'L1' | 'L2' | 'L3' | null
}

proofs {
  projectId: string
  zoneId: string
  url: string
  storagePath: string
  mediaType: string
  uploadedByUid: string
  uploadedByEmail: string
  note?: string
}

updates {
  projectId: string
  zoneId: string
  previousStatus: string
  newStatus: string
  proofId?: string
  note?: string
  byUid: string
  byEmail: string
  type: 'STATUS_CHANGE' | 'ESCALATION' | 'NOTE' | 'ADMIN_OVERRIDE'
}

escalations {
  projectId: string
  zoneId: string
  level: 'L0' | 'L1' | 'L2' | 'L3'
  note: string
  createdBy: string
}
```

## Deployment

### Deploy to Vercel

1. Push your code to GitHub
2. Import your repository on https://vercel.com
3. Add your environment variables in Vercel project settings
4. Deploy

### Firebase Setup for Production

1. Use Firebase production project (not the same as dev)
2. Deploy security rules to production
3. Update environment variables in Vercel

## Project Structure

```
├── app/
│   ├── login/          # Login page
│   ├── client/         # Client dashboard (read-only)
│   ├── supervisor/     # Supervisor dashboard
│   ├── admin/          # Admin console
│   └── zone/[id]/      # Zone detail page
├── components/
│   ├── ui/             # shadcn/ui components
│   ├── rag-counters.tsx
│   └── zone-table.tsx
├── lib/
│   ├── firebase.ts     # Firebase initialization
│   ├── auth-context.tsx # Auth provider
│   ├── firestore-utils.ts # Database operations
│   └── types.ts        # TypeScript types
├── scripts/
│   └── seed-data.ts    # Database seeding script
├── firestore.rules     # Firestore security rules
└── storage.rules       # Storage security rules
```

## Security

- All routes protected by authentication
- Role-based access enforced via Firestore rules
- Proof uploads restricted to supervisors and admins
- Server timestamps prevent time manipulation
- Audit logs are append-only

## Support

For questions or issues, contact the development team.

---

**Built with Next.js + Firebase + TypeScript**

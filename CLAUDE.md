# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server at http://localhost:3000
npm run build        # Production build
npm run lint         # ESLint
npm run typecheck    # TypeScript type checking (tsc --noEmit)
```

Supabase Edge Functions (in `supabase/functions/`) run on Deno, not Node. They are excluded from `tsconfig.json`.

## Architecture

**Celestar** is a proof-first execution verification portal. It uses a hierarchical model: **Programs → Workstreams → Units → Proofs**, with automatic escalation management and immutable audit trails.

### Tech Stack

- **Next.js 13.5** (App Router) + **TypeScript** (strict mode)
- **Tailwind CSS** + **shadcn/ui** (Radix primitives in `components/ui/`)
- **Supabase** for database (PostgreSQL), auth (email/password JWT), and file storage
- **Resend** for transactional email
- Path alias: `@/*` maps to project root

> **Note:** The README.md still references Firebase — the project has migrated to Supabase. The `lib/firebase.ts` and `lib/firestore-utils.ts` files are legacy.

### Directory Layout

- `app/` — Next.js App Router pages and `app/api/` route handlers
- `components/` — React components; `components/ui/` contains shadcn/ui primitives
- `lib/` — Core utilities, auth, types, Supabase clients
- `hooks/` — Custom React hooks (`use-permissions.ts`, `use-toast.ts`)
- `supabase/functions/` — Deno-based Edge Functions (email sending, deadline checks)
- `supabase/migrations/` — SQL migration files

### Key Routes

| Path | Purpose |
|---|---|
| `/login` | Authentication |
| `/programs`, `/programs/[id]` | Program listing and detail |
| `/workstreams/[id]` | Workstream detail with units |
| `/units/[id]` | Unit detail with proof upload/approval |
| `/attention-queue` | Escalation queue |
| `/admin/*` | Platform admin (users, clients, programs) |

### API Layer (`app/api/`)

All API routes use Bearer token auth. The `authorize()` function in `lib/auth-utils.ts` validates the JWT, fetches the user profile from the `profiles` table, and returns an `AuthContext` with `user_id`, `email`, `org_id`, and `role`.

Resources follow REST conventions: `/api/programs`, `/api/workstreams`, `/api/units/[id]`, `/api/units/[id]/proofs`, `/api/units/[id]/escalate`.

### Multi-Tenancy

All data is isolated by `org_id`. Every API query must filter by the user's `org_id` from their profile. `PLATFORM_ADMIN` role bypasses org filtering. Row Level Security (RLS) is enabled on all Supabase tables as a second layer.

### RBAC Roles

`PLATFORM_ADMIN` → `PROGRAM_OWNER` → `WORKSTREAM_LEAD` → `FIELD_CONTRIBUTOR` → `CLIENT_VIEWER`

Enforced at three levels: API middleware (`authorize()`), database RLS policies, and frontend via the `usePermissions()` hook.

### Proof-First Status Model

- Unit `computed_status` (RED/GREEN) is **never set manually** — it is computed server-side by database triggers based on proof submissions
- Any GREEN status requires approved proof evidence
- `unit_proofs` follow an approval workflow: `pending → approved | rejected`
- All status changes are recorded in the `status_events` table (immutable audit log)

### Automatic Escalation

- Triggered when unit deadlines pass (configurable thresholds per level)
- Escalation notifications routed by role
- Resolved automatically when a unit turns GREEN
- Cron endpoints: `/api/cron/check-escalations`, `/api/cron/deadline-reminders`

### Key Database Tables

`organizations`, `profiles`, `programs`, `workstreams`, `units`, `unit_proofs`, `unit_escalations`, `status_events`, `escalation_notifications`, `unit_dependencies`

### Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL        # Supabase project URL (public)
NEXT_PUBLIC_SUPABASE_ANON_KEY   # Supabase anon key (public)
SUPABASE_SERVICE_ROLE_KEY       # Service role key (server-only, never expose to client)
```

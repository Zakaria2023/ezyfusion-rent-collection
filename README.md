# Rent Collection

Rent collection for property managers: leases, invoices, and cash, bank
transfer and online payments, with role-based access for managers, staff and
tenants.

## Stack

- **App:** Next.js 16 (App Router, Server Actions), React 19, TypeScript
- **Data:** Supabase — PostgreSQL 17, Auth, Row Level Security, Storage
- **Data access:** Prisma 7 (`prisma-client` generator, `pg` driver adapter)
- **UI:** shadcn/ui, Tailwind CSS 4
- **Validation:** zod, react-hook-form
- **Dates:** date-fns 4 + `@date-fns/tz`
- **Tests:** Vitest

## Getting started

Prerequisites: Node.js ≥ 20.9, pnpm 9, Docker Desktop (running).

```bash
pnpm install                 # also generates the Prisma client
pnpm supabase start          # local Supabase stack (first run pulls images)
cp .env.example .env         # local defaults; matches `pnpm supabase status`
pnpm db:reset                # apply migrations + seed
pnpm dev                     # http://localhost:3000
```

Supabase Studio runs at <http://127.0.0.1:54323> and the local mail inbox
(sign-up / magic-link emails) at <http://127.0.0.1:54324>.

## Scripts

- `pnpm dev` — development server
- `pnpm build` — production build
- `pnpm db:reset` — recreate the local database from migrations and seed
- `pnpm db:pull` — introspect the database into the Prisma client
- `pnpm test` — unit and integration tests
- `pnpm check` — lint, typecheck, format check and tests

## Database

`supabase/migrations/*.sql` is the single source of truth for the schema,
including Row Level Security policies, constraints and database functions.
`supabase/seed.sql` loads demo data. Prisma introspects the resulting database
(`pnpm db:pull`) and is used only as a typed query client — it never runs
migrations.

## Project layout

```text
src/
  app/                 routes; each feature folder holds page.tsx, actions.ts, validation.ts
  components/          UI components grouped by feature; components/ui = shadcn
  lib/                 framework-agnostic helpers
  lib/server/          server-only code (Prisma client, authorization guards)
  lib/supabase/        Supabase clients for server and browser
  proxy.ts             session refresh (Next.js 16 proxy)
supabase/
  migrations/          schema, RLS policies, functions
  seed.sql             demo data
docs/
  DECISIONS.md         design decisions and their trade-offs
```

## Design decisions

See [docs/DECISIONS.md](docs/DECISIONS.md).

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
cp .env.example .env.local   # the only env file; matches `pnpm supabase status`
pnpm db:reset                # rebuild the schema from migrations
pnpm seed                    # demo data through the app services
pnpm dev                     # http://localhost:3000
```

Supabase Studio runs at <http://127.0.0.1:54323> and the local mail inbox
(sign-up / magic-link emails) at <http://127.0.0.1:54324>.

## Seeded accounts

From a fresh clone, exactly the grading sequence:

```bash
npx supabase start
npx supabase db reset         # migrations only; supabase/seed.sql is empty
npm install
cp .env.example .env.local
npm run seed                  # demo data through the app's own services
npm run build && npm start
```

`npm run seed` (`scripts/seed.ts`) creates the accounts with the Supabase
admin API (email already confirmed), the organizations, memberships, tenants
and units with Prisma, then the leases with `createLease` and Aisyah's
payments with `recordPayment` / `recordPaymentWithSlip` / `approvePayment` —
the same code the API uses, so invoices, allocations and audit rows are the
app's own. It refuses to run twice: on an already seeded database it exits
with code 1 and asks for `npx supabase db reset` first.

**Password for every account: `Rentals2026!`**

| Email                    | Role    | Organization         | Notes                                                               |
| ------------------------ | ------- | -------------------- | ------------------------------------------------------------------- |
| `manager@northwind.test` | manager | Northwind Properties |                                                                     |
| `staff@northwind.test`   | staff   | Northwind Properties |                                                                     |
| `aisyah@northwind.test`  | tenant  | Northwind Properties | Aisyah Rahman — A-12-3, 2026-01-31 to 2026-07-15, RM 1,500.00/month |
| `ben@northwind.test`     | tenant  | Northwind Properties | Ben Lim — B-05-1, 2026-01-01 to 2026-04-15, RM 1,000.29/month       |
| `probe@northwind.test`   | tenant  | Northwind Properties | Probe Tenant — C-01-7, 2026-02-28 to 2027-02-27, RM 2,000.00/month  |
| `manager@beta.test`      | manager | Beta Realty          |                                                                     |
| `chen@beta.test`         | tenant  | Beta Realty          | Chen Wei — KL-1, 2026-03-15 to 2027-03-14, RM 2,200.00/month        |

What each role can do after signing in at `/login`:

| Role    | Lands on     | Can                                                                                         |
| ------- | ------------ | ------------------------------------------------------------------------------------------- |
| manager | `/dashboard` | Everything in their organization: create leases, record payments (approved immediately), approve / reject / void payments, read the audit log |
| staff   | `/dashboard` | Read their organization's leases, invoices and payments; record payments (pending until a manager approves) |
| tenant  | `/portal`    | Read their own lease, invoices and payments; update their phone number; pay online           |

The same credentials are listed, commented out, at the bottom of
`.env.example`. They are deliberately not shown anywhere in the UI.

Unit D-03-2 (Northwind) has no lease. Aisyah's lease has two approved
payments: RM 3,000.00 cash (received 2026-01-31 10:00 MYT, recorded by the
manager) and RM 2,000.00 bank transfer with a PDF slip (received 2026-03-01
00:30 MYT, recorded by staff, approved by the manager).

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
`scripts/seed.ts` (`npm run seed`) loads demo data through the app services. Prisma introspects the resulting database
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
  seed.sql             intentionally empty (see scripts/seed.ts)
docs/
  DECISIONS.md         design decisions and their trade-offs
```

## Design decisions

See [docs/DECISIONS.md](docs/DECISIONS.md).

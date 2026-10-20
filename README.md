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

See [DECISIONS.md](DECISIONS.md).

## Testing

```bash
pnpm test          # unit + integration (needs the local Supabase stack running)
```

- `src/lib/*.test.ts` — billing (worked example, leap years, month-end
  anchors, proration rounding, `invoiceStatus` at 15:59:59.999Z vs 16:00Z,
  every `parseRinggitToSen` case), Malaysia-time helpers, money formatting,
  webhook signature (the brief's test vector). Run under three timezones:
  `$env:TZ='America/New_York'; pnpm test` (PowerShell — on Windows `TZ=` in Git
  Bash does not reach Node).
- `tests/payments.test.ts` — cap, two concurrent staff payments, concurrent
  double approve, approve re-check, void, allocation order, overlap 409
  (including concurrent creates), collections across the MYT month boundary.
- `tests/webhook.test.ts` — valid / repeated / 5 concurrent identical / forged
  / unknown / wrong-amount / out-of-order callbacks.
- `tests/access.test.ts` — the 401/403/404 matrix for every endpoint with real
  Bearer tokens, asserting nothing changed on every refusal.
- `tests/data-api.test.ts` — PostgREST and Storage with the publishable key as
  anon and as each role: exact visible rows, phone-only update, no writes, no
  RPC, catalog checks (RLS on, no anon grants).

The app was also checked end to end against a production build (`npm run
build && npm start`) from a fresh clone, with the brief's simulator
(`scripts/gateway-sim.mjs`).

## What works

Everything in sections 2–9 of the brief: billing functions, the full HTTP API
with 401/403/404 semantics and Bearer or cookie auth, Data API and Storage
access control, payments (cap, approve / reject / void, allocation, audit log)
safe under concurrency, the idempotent webhook, the collections report in
Malaysia months, the staff/manager UI and the tenant portal. Bonus: the
create-lease form previews the schedule live; the leases list has server-side
search and pagination in the URL; unit tests for billing and allocation; the
return page polls the bill status while it is pending.

## Skipped / known issues

- **Realtime** updates on the tenant portal are not implemented (the return
  page polls every 3 s instead).
- **Unapplied credit is not re-applied automatically.** After a void, an online
  payment's `unapplied_sen` stays on that payment (see DECISIONS.md, Part C
  question 5) and is not counted in the recording cap.
- **Deleting an auth user does not cascade** to `memberships`/`tenants`
  (Prisma cannot introspect cross-schema FKs; a trigger checks the user exists
  on insert instead).
- **Local stack caveat:** a default local Supabase accepts HS256 tokens signed
  with the CLI's well-known JWT secret; that is the local stack's
  configuration, not something the app can change. Production keys are
  different.
- The UI has no dark-mode toggle (it follows the system setting).

## What I would do next

- An audited "apply credit" action for `unapplied_sen`, and refunds as new
  negative-allocation rows.
- Pending-bill reuse for "Pay now" (today each click creates a new bill;
  paying two bills leaves the extra as unapplied credit).
- Late fees and reminders, done as idempotent jobs keyed by invoice and period.
- Playwright tests for the UI flows and a browser-timezone check in CI.
- Run Prisma queries inside `set local role authenticated` transactions so
  RLS also applies to server reads (defence in depth).

## AI logs

The transcripts of every AI session used for this work are in `ai-logs/`
(exported with `/export` in Claude Code).

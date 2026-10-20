# CLAUDE.md

Guidance for Claude Code in this repository.

## What this is

A **timed (4 h) technical assessment** for EzyFusion Group: part of a **rent
collection system for property managers** — leases, invoices, cash / bank
transfer / online payments, and access control for **managers, staff and
tenants**.

- The exact brief is only revealed once the timer starts. When it does, the user
  pastes it into `docs/TASK.md`. **That file is the authority** — if anything here
  conflicts with it, the brief wins; say so and follow the brief.
- Grading: hidden automated tests run **our migrations and seed script on their
  machine** against a local Supabase, then probe edge cases. The AI session logs
  are submitted, and the interview opens with a walkthrough of this code — so
  every decision must be one the user can explain.
- Assessed on: money and date correctness (rounding, timezones), DB design,
  RLS and server-side authorization, concurrency and idempotency (payments,
  webhooks), code quality.

### How to work during the test

- Time is the constraint. Prefer a small, correct, explained system over a wide,
  shaky one. Build the **data model + RLS + payment path first**, UI last.
- Before writing code for a feature, state the plan in 3–6 lines and the edge
  cases it must survive. Then build it.
- Record every non-obvious decision (one or two lines each: what, why, the
  alternative rejected) in `docs/DECISIONS.md` as you go. This is the
  interview script.
- Commit after every working step, Conventional Commits style
  (`feat(payments): …`, `fix(rls): …`, `test: …`), one logical change per
  commit, body says _why_. The history is part of what gets reviewed. Never
  `git push` — the user pushes.
- Never sign in to the assessment portal or touch it — the user does that.

### Before the time runs out (start this with ≥ 30 min left)

1. `pnpm db:reset` from scratch succeeds — migrations **and** seed, no manual
   steps. This is literally how it is graded.
2. `pnpm check` and `pnpm build` are green.
3. README: fill in the seeded demo accounts (email / password / role) and any
   setup step the brief adds. `.env.example` is complete.
4. `docs/DECISIONS.md` covers money, dates/timezone, RLS + server authz,
   concurrency, idempotency/webhooks, and anything deliberately left out.
5. Everything committed; the user pushes and submits.

## Stack & commands

Next.js 16.2 (App Router, TypeScript, React 19.2) · Supabase local via the
CLI (Postgres, Auth, RLS, Storage) · Prisma 7 (`prisma-client` generator +
`@prisma/adapter-pg`) · shadcn/ui (`base-nova` style, Base UI primitives) +
Tailwind 4 · zod 4 · react-hook-form · date-fns 4 + `@date-fns/tz` · Vitest.

Use **pnpm** for everything (`pnpm add`, `pnpm <script>`), never npm/yarn.
The Supabase CLI is a dev dependency: `pnpm supabase …`. The network here is
slow — prefer `pnpm add --prefer-offline` and don't add packages casually.

Commands:

- `pnpm supabase start` / `pnpm supabase stop` — start or stop the local
  Supabase stack. Docker Desktop must be running.
- `pnpm db:reset` — wipe the local database, re-run every migration in
  `supabase/migrations/`, then run `supabase/seed.sql`. **This is exactly what
  the graders run.**
- `pnpm supabase migration new <name>` — create a new, timestamped SQL
  migration file.
- `pnpm db:pull` — read the database into `prisma/schema.prisma` and
  regenerate the Prisma client. Run it after every migration.
- `pnpm dev` — run the app at `http://localhost:3000`.
- `pnpm test` — run the Vitest tests (`src/**/*.test.ts`, `tests/**/*.test.ts`).
- `pnpm check` — lint, typecheck, format check and tests in one go.
- `pnpm build` — **the real gate.** Run it before calling anything done;
  `tsc` alone is not enough.

Local URLs/keys come from `pnpm supabase status`; they live in `.env`
(gitignored; `.env.example` is the committed template). Both Next.js and
`prisma.config.ts` read `.env`.

- Prisma client: `import { prisma } from "@/lib/server/prisma"`. Generated code
  lives in `src/generated/prisma` (gitignored, regenerated on `postinstall`) —
  import types from `@/generated/prisma/client`.
- Next 16 renamed middleware to **`src/proxy.ts`** (export `proxy`) — that is
  where the Supabase session cookie is refreshed.
- Run any TypeScript that touches the DB through **Vitest** (`tests/*.test.ts`),
  not plain `node`: Node cannot resolve the generated Prisma client's
  extensionless imports. Integration tests load env with
  `process.loadEnvFile(".env")`. Postgres `bigint` comes back as JS `bigint`
  (`12345n`).
- Delete `supabase/migrations/.gitkeep` once the first real migration exists
  (`db reset` prints a "skipping" notice for it).
- Class names: `cn` from `@/lib/utils`. Add shadcn components with
  `pnpm dlx shadcn@latest add <name>`.

## Database: one source of truth

- **`supabase/migrations/*.sql` is the schema.** RLS policies, enums, CHECK
  constraints, triggers and SQL functions all live there, because the graders run
  migrations, not `prisma migrate`.
- **Prisma is the typed client only**: after every migration run
  `pnpm db:reset && pnpm db:pull`. Never hand-edit models in
  `prisma/schema.prisma` and never run `prisma migrate` / `prisma db push` /
  `prisma dev`. Introspection covers the `public` schema; reference
  `auth.users` by plain `uuid` FK in SQL.
- `supabase/seed.sql` must leave a usable demo: at least one manager, one staff,
  two tenants (on different leases), properties/units, leases, invoices in mixed
  states. Auth users are seeded straight into `auth.users` + `auth.identities`
  with `crypt('password', gen_salt('bf'))`. Seed **must be idempotent-safe on a
  fresh reset** and must not depend on anything outside the repo.
- Tables: snake_case plural names, `id uuid primary key default gen_random_uuid()`,
  `created_at timestamptz not null default now()`. Foreign keys always indexed.
  Push invariants into the DB (NOT NULL, CHECK, UNIQUE, FK) — the app is the
  second line of defence, not the first.

## Auth & authorization (two layers, both required)

- Supabase Auth is the identity provider. The **role** (`manager` | `staff` |
  `tenant`) lives in a `profiles` table keyed by `auth.users.id` (or in
  `app_metadata`). **Never** trust `user_metadata` — the user can edit it.
- **Layer 1 — RLS on every table** in the `public` schema: `enable row level
security` in the same migration that creates the table; no table is ever left
  open. Policies call small `security definer` helpers (`public.current_role()`,
  `public.is_tenant_of_lease(lease_id)`) with `set search_path = ''`. Tenants see
  only their own leases/invoices/payments; staff/manager scope is whatever the
  brief says (e.g. per property/organisation).
- **Layer 2 — server-side checks in every Server Action / Route Handler.**
  ⚠️ Prisma connects as the `postgres` role, which **bypasses RLS**. So every
  server entry point starts with `requireUser()` / `requireRole(...)` and scopes
  its query to what that user may touch. Where it is cheap, run Prisma inside a
  transaction that does `set local role authenticated` +
  `set_config('request.jwt.claims', …, true)` so RLS applies there too
  (add a `withRls(user, tx => …)` helper next to the client in
  `src/lib/server/prisma.ts` when the first query needs it).
- Never ship the `service_role` key to the browser. Only `NEXT_PUBLIC_SUPABASE_URL`
  and the anon/publishable key are public.
- Write a test that signs in as tenant A with supabase-js and proves it cannot
  read tenant B's rows. RLS that is not tested does not count.

## Money

- **Store money as integer minor units** (sen/cents) in `bigint` columns named
  `*_cents` (or `numeric(14,2)` if the brief dictates decimals — then use
  Prisma `Decimal`, never JS `number`). Never use floats for money, anywhere.
- Arithmetic in integers. Rounding happens **only** where a fraction is created
  (proration, percentage late fee, tax, splits), through **one** helper in
  `src/lib/money.ts` with an explicit, documented mode (default: half-up, away
  from zero — state it in DECISIONS.md).
- Splitting an amount into N parts (instalments, proration across days) must sum
  back to the exact total: distribute the remainder cent-by-cent
  deterministically. Unit-test that `sum(parts) === total`.
- Currency is one fixed code (MYR unless the brief says otherwise); store it if
  more than one is possible. Format only at the UI edge with `Intl.NumberFormat`.
- Invoice balance = total − sum of **applied** payment allocations. Never store a
  mutable running balance that can drift; if one is cached for speed, it is
  updated in the same transaction and guarded by a CHECK (`paid_cents <=
total_cents` unless overpayment/credit is in scope).

## Dates & time

- **Calendar dates** (lease start/end, billing period, due date) are Postgres
  `date` — no time, no timezone. **Instants** (paid_at, received webhook,
  created_at) are `timestamptz`, stored UTC.
- Business timezone is explicit: `Asia/Kuala_Lumpur` (UTC+8, no DST) unless the
  brief or a per-property `timezone` column says otherwise. "Today", "overdue",
  and "which period does this payment fall in" are computed **in that zone**.
  ❌ `new Date().toISOString().slice(0, 10)` gives the UTC date — wrong between
  00:00 and 08:00 MYT.
- Use `date-fns` + `@date-fns/tz` in `src/lib/dates.ts`; do date math on
  `yyyy-MM-dd` strings / `TZDate`, not on raw `Date` offsets.
- Month arithmetic is end-of-month aware: a lease anchored on the 31st bills on
  Feb 28/29, then back to the 31st. Inclusive vs exclusive end dates are decided
  once and written in DECISIONS.md. Leap years are tested.

## Payments, concurrency, idempotency

- **Every money-moving write is one DB transaction.** Applying a payment locks the
  invoice row first (`select … for update` via `$queryRaw`, or do the whole thing
  in a Postgres function called with `rpc`/`$queryRaw`), re-reads the balance,
  then writes. Two simultaneous payments must never over-apply.
- **Idempotency keys**: every payment-creating action takes a client-generated
  `idempotency_key`; the `payments` table has `unique (idempotency_key)`. A
  retry with the same key returns the original result instead of paying twice.
  Handle the unique-violation (`P2002`) as "already done", not as an error.
- **Webhooks** (online payments): a Route Handler is correct here (external HTTP
  caller). Read the **raw body**, verify the signature (constant-time compare),
  then insert into `webhook_events` with `unique (provider, event_id)` **before**
  processing, in the same transaction as the effect. Duplicate → 200 and no-op.
  Out-of-order events must not regress state (a `failed` arriving after
  `succeeded` does nothing): status transitions are explicit and forward-only.
- Cash and bank transfer are recorded by staff/manager; a bank transfer may need
  proof upload + approval before it counts. Online payments are `pending` until
  the webhook confirms them. Only confirmed payments reduce a balance.
- Reversals/refunds are new rows (negative allocation or a `reversal_of` FK),
  never updates or deletes of the original payment. Payments are append-only.

## Storage

- Uploaded files (e.g. bank-transfer slips) go in a **private** bucket created in
  a migration. Storage RLS policies on `storage.objects` scope access by path
  prefix (`{lease_id}/{payment_id}/…`). Downloads via short-lived signed URLs.
- Validate type and size server-side.

## Project structure

```text
src/
  app/                    routes; each feature folder has page.tsx, actions.ts, validation.ts
  app/api/webhooks/…      Route Handlers (only for external callers / raw bodies)
  components/<feature>/   components, grouped per feature; components/ui = shadcn
  lib/money.ts            integer money helpers (pure, unit-tested)
  lib/dates.ts            timezone-aware date helpers (pure, unit-tested)
  lib/enums.ts            all enum const arrays
  lib/server/             server-only code (`import "server-only"`): prisma client, auth guards
  lib/supabase/           supabase-js clients: server.ts (cookies), client.ts (browser)
  proxy.ts                Next 16 proxy (ex-middleware): refreshes the Supabase session
  generated/prisma/       Prisma client output — generated, gitignored
supabase/migrations/      THE schema (SQL)
supabase/seed.sql         demo data, run by `db reset`
prisma/schema.prisma      generated by `db pull` — do not hand-edit
docs/TASK.md              the brief (authority)
docs/DECISIONS.md         decision log for the interview
```

- Server Actions (`"use server"` in the route folder's `actions.ts`) do all
  mutations and queries from the app. Route Handlers only where an external
  caller or raw body requires one (webhooks, file streaming).
- Validate every action input with zod on the server, even if the client also
  validated. Return typed `{ ok: true, … } | { ok: false, error }` results;
  redirect on the server with `redirect()`.
- Forms: `useActionState` + `react-hook-form` + `zodResolver`; dispatch the
  validated data; `isPending` disables submit.

## Code conventions

- TypeScript strict. No `any` (use `unknown` + narrowing), no non-null `!`.
- Arrow functions only; implicit return when the body is only a return.
- All `type`s in one block at the top of the file, below imports and module
  constants. Props always a named type, never inline.
- Named exports; `export default` only for pages/layouts, at the bottom.
- Import React types directly (`import { ReactNode } from "react"`), never
  `React.ReactNode`.
- Every `if`/`else` body in braces.
- Enums: `const x = [...] as const satisfies readonly string[]` in
  `lib/enums.ts`, never TS `enum`. Mirror them as Postgres enums or CHECKs.
- File names kebab-case. Icons from `lucide-react`. `next/link` for navigation,
  `next/image` for images.
- Tailwind scale values, no arbitrary `[...]` values when a token exists.
- Never disable a lint rule; fix the code.

## Tests

- Vitest for the pure helpers (`money.ts`, `dates.ts`) — rounding, remainder
  distribution, month-end, leap year, timezone boundary at 00:00–08:00 MYT.
- Integration tests against the local DB for: RLS isolation between tenants,
  double-submit with the same idempotency key, two concurrent payments on one
  invoice, duplicate and out-of-order webhooks.
- The hidden tests target edge cases — when in doubt, write the test first.

# Decisions

One entry per non-obvious decision: what was chosen, why, and the alternative
that was rejected. Written as the work happens — this is the script for the
code walkthrough.

## Setup

- **SQL migrations are the schema; Prisma only introspects.** RLS policies,
  CHECK constraints, triggers and SQL functions cannot be expressed in a Prisma
  schema, and the graders run `supabase db reset`. Rejected: `prisma migrate`,
  which would split the schema across two tools.
- **Prisma connects as `postgres` and bypasses RLS**, so authorization is
  enforced twice: explicitly in every Server Action, and by RLS for any
  supabase-js access with the user's JWT.

## Where the brief overrides CLAUDE.md

The brief (`docs/TASK.md`) is the authority; these are the deliberate
departures from the pre-test working agreement.

- **Seed data is created by `npm run seed` (TypeScript, `scripts/seed.ts`), not
  `supabase/seed.sql`.** The brief requires the seed to go "through your normal
  code paths", so leases and payments are created by the same service functions
  the API uses. `seed.sql` stays empty. Rejected: SQL inserts of invoices, which
  could drift from what `generateSchedule` produces.
- **Env file is `.env.local`** (graders run `cp .env.example .env.local`).
  `prisma.config.ts` and the seed read `.env.local` first, then `.env`.
- **Roles come from `memberships` (manager/staff) and `tenants.user_id`**
  (tenant), as the brief names them, instead of a `profiles` table.
- **Route Handlers for the HTTP API** (`/api/...`), because the hidden tests
  call them with `Authorization: Bearer`. UI mutations use Server Actions that
  call the same service functions, so both paths share one implementation of
  every rule.
- **Money is `bigint` sen and `number` in TypeScript.** The brief's
  `amountSen: number` is the contract; amounts stay far below 2^53, and
  conversion from Prisma's `bigint` goes through a checked `toSafeNumber`.

## Webhook signature and HTTP plumbing

- **Signatures are compared in constant time, and only well-formed ones get
  that far.** `verifySignature` (`src/lib/gateway-signature.ts`) accepts only
  exactly 64 lowercase hex characters, then runs `timingSafeEqual` on two
  32-byte buffers. Rejected: string `===`, which leaks how many leading
  characters matched.
- **A form key sent twice is rejected; unknown keys are kept and signed.** With
  a duplicate we cannot know which value the gateway signed. Rejected: "last
  value wins" (`Object.fromEntries`), which lets an attacker append an unsigned
  second value.
- **Keys are sorted by UTF-16 code unit, not `localeCompare`.** That is the
  brief's "ascending by character code" and the simulator's default `.sort()`;
  locale-aware ordering varies with ICU settings.
- **A missing `GATEWAY_X_SIGNATURE_KEY` throws (500), never 401 or a pass.**
  An HMAC with an empty key is forgeable by anyone.
- **One `handle()` wrapper maps thrown `HttpError`s to `{ error }` responses**
  (`src/lib/server/http.ts`). Routes read as a straight line of guards
  (`throw notFound()`), and a 500 logs only `error.message`, never bodies,
  tokens or the gateway key.

## Money and dates (`src/lib/billing.ts`, `dates.ts`, `money.ts`)

- **Proration is exact round-half-up in integers:**
  `floor((2·rent·used + full) / (2·full))` in BigInt. It is the only place a
  fraction of a sen is created. Rejected: `Math.round(rent * used / full)` in
  floats, which can misround near .5 and loses precision for big values.
- **Calendar dates are `(y, m, d)` integers / day serial numbers, never a
  `Date` read with local getters.** The hidden tests run under three TZs;
  `new Date('2026-03-01').getDate()` is the 28th in New York. Rejected:
  date-fns on local `Date`s.
- **"Today in Malaysia" = `floor((epochMs + 8h) / 1 day)`.** Malaysia is a
  fixed UTC+8 with no DST, so this is exact and needs no tz database. One
  function (`malaysiaDateOf`) is shared by `invoiceStatus` and the app.
- **Anchors are start + k months, clamped to the month end**, always from the
  start date. Rejected: adding a month to the previous anchor, which drifts
  (Jan 31 → Feb 28 → Mar 28).
- **`parseRinggitToSen` builds sen from the digit strings** (ringgit·100 +
  fraction padded to 2). Rejected: `parseFloat("1.15") * 100` = 114.999….
- **Display strings are built by hand, not `toLocaleString`**, so server and
  browser render byte-identical text (no ICU/NBSP differences → no hydration
  mismatch) and always in Malaysia time regardless of the viewer's zone.
- **End dates are inclusive** everywhere (lease `end_date`, `period_end`), as
  the brief defines them; the overlap constraint uses `daterange(…, '[]')`.
- **Testing TZ on Windows:** `TZ=…` set in Git Bash does not reach Node;
  set it in PowerShell (`$env:TZ='America/New_York'`). A test asserts the
  zone actually took effect.

## Database design (`supabase/migrations/`)

- **Composite foreign keys carry `org_id`**: `leases (unit_id, org_id) →
  units (id, org_id)`, and likewise for tenants, invoices, payments and
  allocations. A row can never point into another organization, whatever IDs
  the API is sent. Rejected: checking it only in app code.
- **`leases_no_overlap`: a gist exclusion constraint on
  `(unit_id =, daterange(start_date, end_date, '[]') &&)`.** Two concurrent
  inserts of overlapping leases: the second waits, then fails with 23P01, which
  maps to 409. Rejected: "select overlapping, then insert", which races.
- **`payments.gateway_bill_id UNIQUE`** is the database-level guarantee that a
  bill creates at most one payment, behind the app's row lock.
- **Money invariants are enforced by triggers too**: forward-only statuses
  (`pending_verification → approved|rejected`, `approved → voided`;
  `pending → paid|failed`, `failed → paid` for bills), payments immutable and
  never deleted, allocation sums ≤ invoice and payment amounts (with row
  locks), allocations deletable only once their payment is voided. Prisma
  connects as the owner and bypasses RLS, so the database must defend itself.
- **`audit_log` is append-only for every role, including the owner**: BEFORE
  UPDATE/DELETE row triggers plus a BEFORE TRUNCATE statement trigger. A
  REVOKE would not bind the owner.
- **No FK from `user_id` to `auth.users`.** Prisma 7 introspection fails on
  cross-schema FKs (P4002), so a trigger checks the user exists instead.
  Trade-off: deleting an auth user does not cascade.
- **One deposit per lease = `UNIQUE NULLS NOT DISTINCT (lease_id,
  period_index)`**; the deposit is the row with a NULL period. Rejected: a
  partial unique index, which Prisma mis-introspected as a one-to-one relation.
- **Gateway bill ids are `'bill_' || 32 hex` from `gen_random_uuid()`**
  (122 random bits), so they are unguessable, with a CHECK on the format.
- **Statuses are text + CHECK, not Postgres enums**, so the Prisma client sees
  plain strings that match `src/lib/enums.ts`, and adding a value needs no
  enum migration.

## Data API and Storage (layer 2 of access control)

- **Grants are the outer wall, RLS the inner one.** Supabase's default
  privileges give `anon`/`authenticated` ALL on new tables; the migration
  revokes everything, then grants `SELECT` to `authenticated` on the 10
  tables, and `UPDATE (phone)` on `tenants` only. "A tenant updates only their
  phone" is therefore a column privilege, and the RLS policy limits it to
  their own row. `anon` has no privileges at all.
- **No functions in `public`.** RLS helpers (`private.member_org_id()`,
  `private.tenant_lease_ids()`, …) are `security definer`,
  `set search_path = ''`, in the `private` schema, which PostgREST does not
  expose, so every `/rest/v1/rpc/...` call returns 404.
- **Storage**: the private bucket `payment-slips` (5 MB, JPEG/PNG/PDF) is
  created in a migration. INSERT/SELECT policies on `storage.objects` allow
  only staff or managers whose org id is the first path segment. There are no
  UPDATE/DELETE policies; cleanup of an orphaned upload uses the secret key on
  the server. A trigger rejects a `payments.slip_path` that is not an existing
  object in that payment's own org folder.
- **Verified with real tokens** against PostgREST and Storage (tenant
  isolation, staff vs other org, phone-only update, rpc 404, anon denied,
  uploads to another org's folder refused).

# Decisions

## Part C — answers

### 1. The same `paid=true` callback twice, 5 ms apart

Both reach `src/app/api/webhooks/gateway/route.ts:12` (raw body) →
`processGatewayCallback`. Each verifies the HMAC
(`src/lib/server/services/gateway.ts:265`), validates fields, finds the bill
and checks the amount. Each then opens a transaction in `applyCallback`:
`lockLease` (`gateway.ts:197`) takes `SELECT … FOR UPDATE` on the lease row, so
the second request **waits** until the first commits. The first re-reads the
bill `FOR UPDATE` (`gateway.ts:198-200`), sees `pending`, marks it paid,
creates one approved online payment with `received_at = paid_at`
(`gateway.ts:228`), allocates it and writes the audit row. The second then
re-reads the bill, sees `paid` (`gateway.ts:215`) and returns 200 with no
effect. The database guarantees it independently:
`payments.gateway_bill_id` is `UNIQUE`
(`supabase/migrations/20261020100616_schema.sql:228`), a second insert's 23505
is answered 200 (`gateway.ts:292`), and a trigger makes `paid` terminal.

### 2. RM 800 and RM 700 at the same moment, RM 1,000 remaining

Both enter `recordPayment` (`src/lib/server/services/payments.ts:127`). Each
transaction first calls `lockLease` (`payments.ts:151`), `SELECT … FOR UPDATE`
on the lease row, so they run one after the other. The winner, say RM 800,
reads the totals (`payments.ts:152`): cap = invoiced − allocated − pending =
1,000, so it is inserted (pending for staff) and commits. The RM 700 request
was blocked on the lock; it now reads the totals **after** that commit, sees
RM 800 pending, cap = 200, and gets 422 (`payments.ts:153-156`). The lock is
what stops both being accepted: without it both would read 1,000. The test
`tests/payments.test.ts:75` fires both concurrently and fails when the lock is
removed. Which request wins is decided by lock order, not by amount.

### 3. Every place that works out "today" or converts date ↔ instant

All Malaysia time (fixed UTC+8, no DST), because the business is in Malaysia
while the server runs in UTC and viewers are anywhere:

- `src/lib/billing.ts:158` `malaysiaDateOf`: today = ⌊(epoch + 8 h) / day⌋;
  used by `invoiceStatus` (`billing.ts:225`), so an invoice due 03-01 becomes
  overdue at 03-01T16:00Z.
- `src/lib/dates.ts:85` `todayInMalaysia` (same function): amount due now
  (`gateway.ts:113`), dashboard overdue (`leases.ts:397-412`), the portal
  (`src/components/portal/portal-data.ts:202`).
- `dates.ts:95` `malaysiaLocalToInstant`: form input read as +08:00
  (`src/app/(staff)/leases/[leaseId]/actions.ts`); `dates.ts:120/126`: output
  as +08:00.
- `dates.ts:149/157`: Postgres `date` ↔ `'YYYY-MM-DD'` through UTC midnight,
  with no zone (a date has no time).
- `src/lib/server/services/reports.ts:55-56`: month bounds
  `AT TIME ZONE 'Asia/Kuala_Lumpur'`.
- `src/lib/gateway-signature.ts:91`: `paid_at` uses its own offset; the API
  requires one on `receivedAt`.

### 4. Queries not subject to RLS, and what authorizes them instead

- **All Prisma queries** (owner role, `src/lib/server/prisma.ts`). The caller
  is authenticated with `getUser()` / `getUser(token)`
  (`src/lib/server/auth.ts:42,53`). The role comes only from
  `memberships`/`tenants` (`auth.ts:77-93`). Then `requireVisibleLease` /
  `requireVisiblePayment` scope by `org_id` (and `tenant_id` for tenants) →
  404 (`src/lib/server/access.ts:30-73`), and `requireMember`/`requireManager`
  → 403 (`access.ts:86-94`). Composite `(id, org_id)` FKs and triggers are the
  backstop.
- **Service role** (`src/lib/server/supabase-admin.ts`): slip
  upload/verify/remove/sign (`src/lib/server/slips.ts:60-101`), always called
  after those same lease/payment checks; `createUser` in the CLI-only seed
  (`scripts/seed.ts:178`).
- **SECURITY DEFINER** RLS helpers
  (`supabase/migrations/20261020100622_access_control.sql:50-110`): read-only,
  filtered by `auth.uid()`, `search_path = ''`, in the unexposed `private`
  schema. Trigger functions only enforce invariants.
- **Webhook**: there is no user; it is authorized by the HMAC (`gateway.ts:265`).

### 5. A void reopens invoices while the lease has `unapplied_sen` from an online payment

`voidPayment` (`src/lib/server/services/payments.ts:335-375`) sets the payment
`voided` (`:353`) and deletes **only its own** allocations (`:359`). Nothing
else moves: the online payment keeps its `unapplied_sen`, the reopened
invoices show unpaid/overdue, and the remaining balance grows by the voided
amount. The unapplied credit is shown on the lease page (payments table) for
the manager to act on.

I chose not to re-apply the credit automatically because the brief says
"Other payments' allocations do not change". Silently moving money from an
already-settled online payment would rewrite its allocations after the fact
and blur the audit trail. The cost: the credit is not counted in the cap, so a
manager could record a manual payment while credit exists. An explicit, audited
"apply credit" action is the next step (README → "What I would do next").

### 6. Two things the AI assistant got wrong, and how I noticed

1. **`npm install` would have failed at grading step 3.**
   `@hookform/resolvers@6` has an npm peer conflict (ERESOLVE) that pnpm hides,
   and there was no `package-lock.json`. I asked for an independent
   brief-contract audit, which ran `npm install` on a copy and caught it. Fix:
   pin v5 and commit a lockfile (commit `fix(build): make the graders' npm
   install resolve`). In `ai-logs/`, search "ERESOLVE".
2. **Wrong instructions and validation.** The seed was told to run with
   `tsx --conditions=react-server`, which crashed (`createContext is not a
   function`); the seed agent caught it when running it (search
   "conditions=react-server"). The payment rules also rejected a future
   `receivedAt`, which the brief never asks for, and checked reasons with zod's
   `.min(5)` (UTF-16 units), so `"😀😀😀"` gave a 500 against the DB's
   `char_length` CHECK. Both were found by the money/concurrency audit I asked
   for (search "😀😀😀"), then fixed with tests.

---

## Decision log


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

## Server-side authorization (layer 1 of access control)

- **Role and organization come only from `memberships` / `tenants.user_id`**,
  after `supabase.auth.getUser()` (cookie) or `getUser(token)` (Bearer).
  Never `getSession()` (unverified) or `user_metadata` (user-editable). Tested:
  a user whose `user_metadata` says `manager` but has no membership gets 401.
- **One check order in every endpoint: 401 → 404 → 403 → 400 → 409/422.**
  Visibility is decided before the role, so a record in another organization
  (or another tenant's lease) is 404 and its existence is never revealed. A
  tenant who can see their lease but tries to record a payment gets 403.
  Services therefore take `input: unknown` and validate it with zod *after*
  the visibility and role checks; validating in the route would answer 400
  before 404.
- **IDs in bodies are untrusted.** `createLease` loads the unit and tenant
  filtered by the caller's `org_id` (404 otherwise), and the composite FKs
  make a cross-org lease impossible even if that check had a bug.
- **Services take an `Actor` and never import `next/headers`**, so route
  handlers, Server Actions, the seed and the tests all go through the same
  rules. Rejected: duplicating checks per entry point.
- **Prisma bypasses RLS**, so every Prisma query is either scoped by the
  actor's `org_id` / lease visibility (`src/lib/server/access.ts`) or runs
  after that check. RLS is the second wall for the Data API.

## Payments and concurrency

- **One lock order: the lease row first (`SELECT … FOR UPDATE`), then the
  payment or bill row.** Every money-moving transaction (record, approve,
  reject, void, webhook settlement, bill creation) takes `lockLease` first, so
  operations on one lease run one at a time and never deadlock. Rejected:
  SERIALIZABLE plus a retry loop, which is harder to reason about and explain.
- **Cap = invoiced − allocated − pending, computed under that lock.** Two
  staff record RM 800 and RM 700 at once on RM 1,000 remaining: the second
  waits for the lock, re-reads the totals with the first one's RM 800 now
  pending, and gets 422. A test proves the lock matters: with it removed,
  both are accepted.
- **Approval re-checks against invoiced − allocated** (the remaining
  balance), not the recording cap: the payment being approved is itself one of
  the pending ones. Over the balance → 422, and it stays pending.
- **Approving twice at once allocates once**: the second request waits on the
  lock, re-reads the payment `FOR UPDATE`, sees `approved` and gets 409. The
  allocation trigger also refuses rows for a payment that is not approved.
- **Allocation order: due date, deposit before rent, period index**, filling
  each invoice before the next, including invoices not yet due. The remainder
  goes to `unapplied_sen`, which a CHECK allows only for online payments.
- **Void deletes only that payment's allocations and never re-allocates.**
  Other payments, including another payment's `unapplied_sen`, are untouched,
  as the brief says ("Other payments' allocations do not change"). Reopened
  invoices show as unpaid/overdue and a manager decides. Rejected: automatically
  moving unapplied credit onto reopened invoices, which would silently change
  an already-settled payment's allocations.
- **Payments are append-only**: reject/void are status changes with a
  mandatory reason (≥ 5 chars, also a CHECK), never deletes. Void overwrites
  `decided_by/at`; the full history is in `audit_log`.
- **Slips**: the type is checked by magic bytes and the size server-side. The
  file goes to `<org>/<lease>/<uuid>.<ext>` after authorization, and
  `recordPaymentWithSlip` removes it if recording fails, so no orphan is left.

## Online payments and the webhook

- **Signature first.** Nothing is parsed or looked up before the HMAC
  verifies, so an unsigned caller cannot probe which bill ids exist.
- **Single payment per bill, three layers:** (1) the transaction locks the
  lease then the bill `FOR UPDATE` and re-reads its status, so a concurrent
  duplicate waits and then sees `paid` → 200 no-op; (2)
  `payments.gateway_bill_id UNIQUE`; (3) a 23505 on that one constraint is
  answered 200 ("another delivery won"), not 500. Rejected: a separate
  `webhook_events` table; the bill's own status plus the UNIQUE already make
  the effect idempotent.
- **Forward-only bill states** (trigger): `pending → paid|failed`,
  `failed → paid`. A late `paid=false` after `paid` is a 200 no-op.
- **`received_at = paid_at`** from the callback (parsed with its offset), not
  the delivery time, so a retry delivered after midnight still counts in the
  right month.
- **Amount due now** = unpaid amounts of invoices due on or before
  `todayInMalaysia(now)`, computed under the lease lock. If a tenant pays two
  bills, the extra becomes `unapplied_sen` on the second online payment, which
  the brief allows only for online payments.
- **The return page only reads the bill's status** and ignores its `paid`
  query parameter. Only the signed webhook settles a bill.

## Seed

- **`npm run seed` goes through the services**: leases via `createLease`,
  payments via `recordPayment` / `recordPaymentWithSlip` / `approvePayment`
  with real manager/staff actors. Only rows that have no service (auth users,
  orgs, memberships, tenants, units) are written directly. Rejected: SQL
  inserts of invoices/allocations, which could drift from the real rules.
- **The seed refuses a non-fresh database** (exit 1, "run `npx supabase db
  reset` first") rather than upserting, so it can never half-merge.
- **`server-only` under tsx**: `scripts/tsconfig.json` maps it to an empty
  stub. Rejected: `--conditions=react-server`, which also swaps React for its
  server build and crashes on `next/navigation`.

## Fixes from the self-audit (independent reviewer agents)

- **`receivedAt` must carry an offset** (`Z`, `+08:00` or `+0800`); a bare
  local time is ambiguous on a UTC server and is refused (400). Any instant is
  accepted, including a future one: the brief does not forbid it, and the
  UI defaults the field to "now" in Malaysia time anyway. Rejected: a
  "not in the future" rule, which the hidden tests could legitimately trip
  (the Probe Tenant lease runs into 2027).
- **Reasons are counted in characters (code points)**, exactly like the DB's
  `char_length` CHECK. zod's `.min(5)` counts UTF-16 units, so `"😀😀😀"`
  passed zod and then failed the constraint with a 500; it is now a 400.
- **audit_log triggers are `ENABLE ALWAYS`.** An ordinary trigger is skipped
  when a session sets `session_replication_role = replica`, which let the
  owner delete audit rows with plain DML. Found by the self-audit, fixed in
  `20261020105928_audit_log_always_triggers.sql`. DDL (dropping the trigger)
  remains possible for the owner, but that is a visible schema change.
- **Slips given to the HTTP API by path are re-checked by their bytes.**
  Storage's `allowed_mime_types` trusts the declared Content-Type, so
  `recordPayment` downloads the object and applies the same magic-byte and
  5 MB checks as the UI upload (`verifyStoredSlip`).

## UI

- **Logic lives in hooks.** Every client component with logic has a sibling
  `use-*.ts` hook; components only render.
- **Every page and Server Action authorizes itself** (`getActor()` → the same
  services as the API). A hidden button is not a check: a staff member who
  calls the approve Server Action directly gets the 403 message.
- **Times are entered and shown in Malaysia time regardless of the browser.**
  The received-at field sends the raw `datetime-local` string; the server reads
  it as UTC+8 (`malaysiaLocalToInstant`). Its default value is computed on the
  server, and all display goes through deterministic formatters, so there is
  no hydration mismatch in any browser timezone.
- **Slips open through `/slips/:paymentId`**, a no-store GET route that checks
  access and redirects to a 60-second signed URL created on click, so pages
  never embed a live storage credential.
- **Lease pages return a real 404** for records the user cannot see: the
  detail and new-lease routes render without a streaming `loading.tsx`, so
  `notFound()` runs before the status is sent.
- **The create-lease preview uses the same pure `generateSchedule`** the server
  stores, so what the manager sees is exactly what is created.

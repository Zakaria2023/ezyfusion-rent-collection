# Part B - Code Review

Line numbers count each of the three files separately. Line 1 is the
`// app/...` path comment exactly as the PR shows it:

- **late-fees** = `app/api/leases/[leaseId]/late-fees/route.ts`
- **webhook** = `app/api/webhooks/gateway/route.ts`
- **collections** = `app/(staff)/dashboard/actions.ts`

Findings run from most to least severe. Two facts from the brief matter
throughout. First, `prisma` connects as the database owner, so RLS never runs
for these queries and every check has to be in this code. Second, all
examples use the seed data (Northwind: `manager@`, `staff@`, Aisyah, Ben.
Beta: `manager@beta.test`, Chen).

---

## Critical

### 1. collections L6-14: the Server Action has no authentication or authorization, and it trusts `orgId` from the caller

```ts
'use server'
export async function getCollections(orgId: string, from: string, to: string) {
```

Every exported function in a `'use server'` file is a POST endpoint. Once the
dashboard references it from client code, anyone can call it with any
arguments. Next.js documents that Server Actions must be treated as public API
endpoints. This one never calls `getUser()`, never checks the role and takes
the organization from the request.

**Scenario.** Chen, a Beta tenant, or a caller with no session at all, replays
the action's POST with `orgId` set to Northwind's id and receives Northwind's
monthly takings. That breaks "nobody ever sees another organization's data"
and "every endpoint must authenticate the caller and check their organization
and role".

**Fix.** Drop the `orgId` parameter. Authenticate with
`supabase.auth.getUser()`. Load the caller's `memberships` row and use its
`org_id`. Allow only `staff` and `manager` (a tenant gets 403, and no session
gets 401 or a redirect).

```ts
export const getCollections = async (from: string, to: string) => {
  const user = await requireUser()                       // getUser(), never getSession()
  const m = await prisma.membership.findFirst({ where: { userId: user.id } })
  if (!m) throw new ForbiddenError()                     // tenants have no membership
  // ...query with m.orgId
}
```

### 2. late-fees L12-14: the role comes from `user_metadata`, which any user can edit

```ts
if (user?.user_metadata.role !== 'manager') {
```

A user can write `user_metadata` themselves with the publishable key
(`supabase.auth.updateUser({ data: { role: 'manager' } })`).

**Scenario.** Aisyah runs that call from her browser console, then POSTs to
`/api/leases/<Ben's lease>/late-fees` and adds charges to Ben's lease. Any
user in any organization can do the same. The reverse also fails: the real
`manager@northwind.test`, whose role is stored in `memberships`, gets 403. The
brief requires roles from `memberships` and from `tenants.user_id`, never from
`user_metadata`.

**Fix.** Read the role from `memberships` for the authenticated `user.id`. See
finding 3 for the full check order.

### 3. late-fees L18-22: the lease lookup is not scoped to the caller's organization

```ts
const lease = await prisma.lease.findUnique({ where: { id: leaseId }, ... })
```

Fixing finding 2 is not enough on its own. `manager@beta.test` is a genuine
manager, so they pass the role check and can then add late fees to any
Northwind lease. The 200 vs 404 response also lets them test whether a
Northwind lease id exists. The brief says another organization's record must
return 404.

**Fix.** Follow the brief's 401 → 404 → 403 order:

```ts
if (!user) return json({ error: 'Unauthorized' }, 401)
const m = await prisma.membership.findFirst({ where: { userId: user.id } })
const lease = await prisma.lease.findUnique({ where: { id: leaseId }, include: { tenant: true } })
const visible = lease && (lease.orgId === m?.orgId || lease.tenant.userId === user.id)
if (!visible) return json({ error: 'Not found' }, 404)    // other org / other tenant
if (m?.role !== 'manager') return json({ error: 'Forbidden' }, 403) // own staff, the lease's tenant
```

### 4. webhook L21-38: a check-then-act race lets one bill create two payments

```ts
const bill = await prisma.gatewayBill.findUnique({ where: { id: fields.id } })   // outside the tx, no lock
if (bill.status === 'paid') return NextResponse.json({ ok: true })
await prisma.$transaction(async (tx) => {
  await tx.gatewayBill.update({ where: { id: bill.id }, data: { status: 'paid' } }) // unconditional
```

**Scenario.** The gateway delivers the same `paid=true` callback for a
RM 2,100.50 bill twice, 5 ms apart. Both requests read `status = 'pending'`
before either one commits.

1. Request A's `UPDATE` locks the bill row.
2. Request B's `UPDATE` waits on that lock.
3. A commits.
4. Under READ COMMITTED, B re-checks `WHERE id = …`. It still matches, so B
   updates the row again and creates a second approved payment.
5. `allocate` then spends B's RM 2,100.50 on invoices that are not due yet and
   leaves the rest as `unapplied_sen`.

The tenant paid once, but the lease is credited twice. That breaks "a bill
creates at most one payment, ever". If `payments.gateway_bill_id` happens to
have a unique index (nothing in this PR relies on one), B fails with P2002
instead. That is an unhandled 500, so the gateway keeps retrying.

**Fix.** Make the status transition the guard, inside the transaction:

```ts
await prisma.$transaction(async (tx) => {
  const [bill] = await tx.$queryRaw<Bill[]>`
    SELECT id, org_id, lease_id, amount_sen, status FROM gateway_bills WHERE id = ${id} FOR UPDATE`
  // decide 404 / 422 / no-op / settle from this locked row only
})
```

Also add `UNIQUE (gateway_bill_id)` on `payments` as a database backstop. An
alternative is a conditional
`UPDATE gateway_bills SET status='paid' WHERE id=$1 AND status <> 'paid' RETURNING *`,
where zero rows means "already paid, return 200".

---

## High

### 5. webhook L19-35: `paid_amount` is never compared with the bill, and the payment amount comes from the callback

```ts
amountSen: BigInt(fields.paid_amount),
```

The brief requires a 422, with no effect, when `paid=true` and `paid_amount`
is not the bill's amount.

**Scenario.** A bill for 210050 sen comes back with `paid_amount=10000`
(partial capture, or a gateway or config bug). The bill is marked `paid`
forever and an RM 100.00 payment is recorded, so RM 2,000.50 of rent can never
be collected through that bill. A larger value instead records money that was
never received.

The parsing is also loose. `BigInt('12.5')` throws, which gives a 500.
`BigInt('')` is `0n` and `BigInt('0x10')` is `16n`.

**Fix.** Parse strictly with `/^\d+$/`, compare with `bill.amountSen` under
the lock from finding 4 and return 422 on a mismatch. Create the payment with
`bill.amountSen`.

### 6. late-fees L28-46: the endpoint is not idempotent, so every call adds another 2% fee

Nothing records that an invoice has already been charged a fee. Each POST
creates a new fee invoice for every overdue rent invoice.

**Scenario.** On 2026-03-20, Ben has period 2 (due 2026-03-01, 100029 sen)
unpaid. The manager double-clicks, or the client retries after a timeout, or
two managers press the button together. Ben gets two RM 20.01 late fees for
the same invoice, and a third on the next run.

**Fix.** Link each fee to the invoice it penalises with a
`late_fee_for_invoice_id uuid UNIQUE` column. Insert with
`ON CONFLICT DO NOTHING` (or `createMany({ skipDuplicates: true })`) in one
transaction, so concurrent or repeated calls create each fee at most once.

### 7. collections L8 and L11: month bucketing and range bounds use the session time zone (UTC), not Malaysia time

```sql
to_char(date_trunc('month', received_at), 'YYYY-MM')
received_at >= ${from}::date AND received_at < ${to}::date + interval '1 month'
```

For a `timestamptz`, `date_trunc` and `to_char` work in the session
`TimeZone`, which is UTC on Supabase. Comparing a `timestamptz` with a `date`
value (or with `date + interval`, which is a `timestamp`) casts that value at
midnight in the session time zone, which is 08:00 Malaysia time.

**Scenario.** The seeded bank transfer was received at 2026-03-01 00:30 MYT,
which is 2026-02-28T16:30Z. It is bucketed as `2026-02`. Northwind's report
for 2026-01..2026-03 therefore shows February 200000 and no March row, where
the brief expects March 200000.

The range edges are also off by 8 hours. A payment at 2026-01-01 03:00 MYT is
dropped. A payment at 2026-04-01 06:00 MYT (still 2026-03-31 in UTC) is
included and counted in March.

**Fix.** Do every boundary in Asia/Kuala_Lumpur. The combined query is under
finding 10.

### 8. webhook L16: logs the whole callback and the correct signature for it

```ts
console.error('Invalid signature', { fields, expected })
```

The brief says "never log … whole callback payloads". This line is also worse
than a payload leak. `expected` is the valid HMAC for whatever the sender
submitted.

**Scenario.** An attacker POSTs `id=<their bill>&paid=true&paid_amount=<bill amount>&…`
with a junk signature and gets a 401. The log line now holds the correct
`x_signature` for that exact payload. Anyone who can read the logs (a log
service, a support engineer or a leaked export) can replay the request with
that signature and settle the bill without paying.

**Fix.** Log only the outcome and a non-secret identifier, for example
`console.warn('gateway webhook: bad signature', { id: fields.id })`. Never log
`expected`, the fields object or the key.

---

## Medium

### 9. webhook L19: `paid=false` returns 200 without checking that the bill exists and without moving it from pending to failed

```ts
if (fields.paid !== 'true') return NextResponse.json({ ok: true })
```

The brief's table requires 404 for an unknown bill, and `pending → failed`
for `paid=false`. With this code, a signed `paid=false` for bill X leaves X
`pending` forever, so the tenant UI keeps showing a failed payment as in
progress. An unknown bill id gets 200 instead of 404.

**Fix.** Look up and lock the bill (as in finding 4) before branching. Then
`UPDATE … SET status='failed' WHERE id=$1 AND status='pending'`. A bill that
is already `failed` or `paid` is a no-op that returns 200, and a paid bill
never goes back.

### 10. collections L7-13: months with nothing collected are missing

`GROUP BY` returns only months that have payments. The brief requires one
entry per month in the range, including zeros.

**Scenario.** Even after the time-zone fix, Northwind for 2026-01..2026-03
returns two rows (`2026-01`, `2026-03`) instead of three with
`{ month: '2026-02', collectedSen: 0 }`. The dashboard's 6-month chart then
shifts or misses bars.

**Fix** (also fixes finding 7, and the `numeric` return type noted under
"Looks suspicious but is correct"):

```sql
SELECT to_char(m, 'YYYY-MM') AS month, COALESCE(SUM(p.amount_sen), 0)::bigint AS total
FROM generate_series(${from}::timestamp, ${to}::timestamp, interval '1 month') AS m
LEFT JOIN payments p
  ON p.org_id = ${orgId}::uuid AND p.status = 'approved'
 AND p.received_at >= (m AT TIME ZONE 'Asia/Kuala_Lumpur')
 AND p.received_at <  ((m + interval '1 month') AT TIME ZONE 'Asia/Kuala_Lumpur')
GROUP BY m ORDER BY m
```

### 11. webhook L34: `receivedAt: new Date()` uses the delivery time instead of `paid_at`

The brief says `received_at = paid_at`.

**Scenario.** A tenant pays at `2026-03-31 23:50:00 +0800`. The webhook
arrives at 00:05 MYT on 1 April, or a retry arrives hours later. The payment
lands in April's collections, and the tenant's payment history shows the wrong
time.

**Fix.** Parse `paid_at` strictly and reject it if malformed:

```ts
const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/.exec(fields.paid_at ?? '')
const receivedAt = m && new Date(`${m[1]}T${m[2]}${m[3]}:${m[4]}`)
```

### 12. late-fees L41 and L50-52: invoice references are duplicated

```ts
reference: await nextReference(lease.orgId),   // inside the loop
...
const last = await prisma.invoice.findFirst({ where: { orgId }, orderBy: { createdAt: 'desc' } })
```

`prisma.invoice.create(...)` returns a lazy `PrismaPromise`. Its query only
runs when something calls `.then`, which here is `Promise.all` on L46.
Checked in `@prisma/client` 7.10 runtime: `then`/`catch`/`finally` call the
executor.

So when the loop calls `nextReference` the second time, the first fee has not
been inserted yet, and both read the same "last" invoice.

**Scenario.** Aisyah has two overdue rent invoices and the last org reference
is `INV-41`. Both fees get `INV-42`. Two concurrent requests, or any other
invoice insert in the org, race the same way, because the code reads the
maximum and then inserts.

If `reference` is unique, every create after the first fails with P2002. The
request returns 500 with one fee already committed (see finding 13).

**Fix.** Generate references in the database: a per-org counter row
`UPDATE … SET next = next + 1 RETURNING next` inside the transaction, or a
sequence. Back it with `UNIQUE (org_id, reference)`.

### 13. late-fees L33-46: the fee inserts are not atomic

`Promise.all` of separate `create`s runs them as independent auto-committed
statements on different connections. If one fails (finding 12's P2002, a
CHECK violation from finding 16, or a dropped connection), the others are
already committed. The client gets a 500, and a retry piles more fees on top
(finding 6).

**Fix.** Build the rows first, then make one write inside
`prisma.$transaction(async tx => …)`, using `createMany` or sequential creates
with the unique key from finding 6.

### 14. late-fees L38: `kind: 'late_fee'` is outside the invoice model the brief defines

The brief fixes `InvoiceKind = 'deposit' | 'rent'`. It also fixes
`kind: 'deposit' | 'rent'` in the `GET /api/leases/:leaseId` response shape
and defines allocation order only for deposit and rent. One of two things
happens:

- If `invoices.kind` is constrained to those values, as the brief's model
  implies, every fee insert fails.
- If it is not, the lease endpoint returns a kind the contract and its tests
  do not allow, and allocation order for a fee due today is undefined.

Either way, fees also raise the lease's remaining balance, so they change the
payment cap and "amount due now".

**Fix.** Decide this explicitly. Either keep late fees as a separate
`late_fees` table outside the invoice/allocation contract, or extend the enum,
the response type, `invoiceStatus` and the allocation order together, and
document the change.

---

## Low

### 15. late-fees L13-14: a missing login returns 403 instead of 401

With no session, `user` is `null`, `user?.user_metadata.role` is `undefined`,
and the code returns 403. The brief requires 401 for "a request without a
valid login". Fix: check `if (!user)` first and return 401 (as in finding 3).

### 16. late-fees L31-32: the 0.995 float threshold skips unpaid invoices, and tiny balances produce RM 0.00 fees

```ts
if (Number(paid) / Number(invoice.amountSen) >= 0.995) continue
```

The comment says the fee applies to every rent invoice "still unpaid", but
this skips any invoice with up to 0.5% outstanding. On a RM 1,500.00 invoice
with RM 7.50 unpaid (149250/150000 = 0.995 exactly), no fee is charged, even
though `invoiceStatus` reports it as `overdue`.

Going the other way, an unpaid amount of 1 to 24 sen that is still above 0.5%
gives `fee = 0`. That is possible on a short prorated last period, for example
20 sen left on a 3334-sen one-day period. The code then inserts a 0-sen
invoice, or hits a `CHECK (amount_sen > 0)` and produces finding 13's partial
failure.

**Fix.** Compare in integers and skip zero fees:

```ts
const unpaid = invoice.amountSen - paid
if (unpaid <= 0n) continue
const fee = (unpaid * 2n + 50n) / 100n   // half-up, bigint
if (fee === 0n) continue
```

### 17. webhook L15: the signature comparison is not constant-time

`expected !== fields.x_signature` can return at the first differing
character, which gives a (noisy) timing oracle for forging signatures.

**Fix.**

```ts
const a = Buffer.from(expected, 'hex'), b = Buffer.from(fields.x_signature ?? '', 'hex')
if (a.length !== b.length || !timingSafeEqual(a, b)) return 401
```

### 18. All three files: malformed input causes 500s instead of the specified responses

- **webhook L8:** `req.formData()` throws a TypeError on a JSON or empty body,
  which returns 500. A request with no form body has no signature, so it
  should get 401.
- **late-fees L18, webhook L21:** if the id columns are `uuid`, a non-UUID
  `leaseId` or `id` makes Postgres reject the cast, which returns 500. They
  should return 404.
- **collections L11:** `from`/`to` are not validated. `'2026-13'` raises a
  Postgres error, and `to < from` silently returns `[]`. The brief's endpoint
  wants 400 for an invalid range.

**Fix.** Wrap the body parse and return 401. Check ids with zod `.uuid()` and
return 404. Check `from`/`to` with `/^\d{4}-(0[1-9]|1[0-2])$/` and
`from <= to`, returning 400.

---

## Looks suspicious but is correct

- **late-fees L24:** `new Date(Date.now() + 8*3600*1000).toISOString().slice(0, 10)`
  is today's Malaysia date. Shifting the epoch by +8 h and reading the UTC
  fields does not depend on the server's `TZ`, and Malaysia has no DST.
- **late-fees L25 and L29:** `Date.parse('YYYY-MM-DD')` parses a date-only ISO
  string as UTC midnight (per spec), so `cutoff` is UTC midnight of "today −
  7". Prisma returns `@db.Date` as `new Date('YYYY-MM-DD')`, which is also UTC
  midnight. `>=` compares the two Dates numerically through `valueOf()`
  (unlike `===`). A fee therefore applies once the Malaysia date is
  `dueDate + 8` or later. For an invoice due 2026-03-01, that is from
  2026-03-09 00:00 MYT, which is "more than 7 days after", consistent with the
  brief's overdue rule.
- **late-fees L39:** `new Date(todayMyt)` is UTC midnight, and
  `@prisma/adapter-pg` formats `DATE` parameters with `getUTC*`. The stored
  date is exactly `todayMyt` on any server.
- **late-fees L32:** `Math.round(Number(unpaid) * 2 / 100)` looks like float
  money math, but it is exact. `unpaid * 2` is an exact integer, the true
  quotient is a multiple of 0.02 (never within float error of `.5` unless it
  is exactly `.5`, which is representable), and `Math.round` rounds `.5` up
  for positive values. 25 sen gives 1 sen of fee and 75 sen gives 2. The
  bigint version in finding 16 is still cleaner.
- **late-fees L30:** the allocation sum starts at `0n` and adds `bigint`s,
  which is exact. Voided payments' allocations are deleted under the brief's
  rules, so they are not counted.
- **late-fees L17:** `await params` is correct. In Next 15 and later, route
  `params` is a Promise.
- **webhook L9-13:** the signature source matches the spec and test vector.
  It covers every field except `x_signature` (so future fields are covered),
  default `.sort()` orders by UTF-16 code unit ("by character code"), and it
  uses `key+value` joined by `|`.
- **webhook L8:** `Object.fromEntries` keeps only the last duplicate key.
  This is not exploitable because the HMAC is computed over the same
  deduplicated map the handler then reads. Appending `&paid=true` to a signed
  `paid=false` body changes the source string, so the request gets 401.
- **webhook L14:** if `GATEWAY_X_SIGNATURE_KEY` is unset, `createHmac` throws
  and the request returns 500. That fails closed: nothing is ever accepted
  unsigned.
- **webhook L23-38:** a `failed` bill falls through and gets settled by
  `paid=true`, which the brief requires. `orgId` and `leaseId` come from the
  bill row, not the callback. `allocate` runs in the same transaction as the
  payment insert.
- **collections L7-13:** the tagged `$queryRaw` template sends `orgId`, `from`
  and `to` as bind parameters (`${orgId}::uuid` casts a parameter), so this is
  not SQL injection.
- **collections L7 and L14:** `SUM(bigint)` returns `numeric`, so Prisma
  returns a `Decimal`, not the `bigint` the type annotation claims.
  `Number(decimal)` goes through `valueOf()` (a string) and is exact for
  totals below 2^53 sen, so the values are right. Only the annotation is
  wrong. `SUM(...)::bigint` in finding 10 makes it true.
- **collections L10:** `status = 'approved'` correctly excludes pending,
  rejected and voided payments. `amount_sen` (including any `unapplied_sen`)
  is the right measure for "total of approved payments".

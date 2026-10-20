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

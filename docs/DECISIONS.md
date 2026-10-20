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

import "server-only";

// Prisma 7 with @prisma/adapter-pg wraps Postgres errors several layers deep
// (PrismaClientKnownRequestError -> meta.driverAdapterError -> cause, with the
// SQLSTATE in `originalCode` or, for unmapped codes like 23P01, `code`).
// This walks the chain and returns the first SQLSTATE found, so services can
// map constraint and trigger errors to HTTP statuses.

// Five-character SQLSTATE; Prisma's own codes (P1000–P6999) are excluded, while
// Postgres' PL/pgSQL class P0 (P0001 raise_exception) is kept.
const SQLSTATE_PATTERN = /^(?!P[1-9])[0-9A-Z]{5}$/;
const MAX_DEPTH = 6;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const findSqlState = (value: unknown, depth: number): string | null => {
  if (!isRecord(value) || depth > MAX_DEPTH) {
    return null;
  }
  for (const key of ["originalCode", "code"]) {
    const code = value[key];
    if (typeof code === "string" && SQLSTATE_PATTERN.test(code)) {
      return code;
    }
  }
  for (const key of ["cause", "meta", "driverAdapterError"]) {
    const found = findSqlState(value[key], depth + 1);
    if (found) {
      return found;
    }
  }
  return null;
};

/** The Postgres SQLSTATE behind a Prisma error ('23P01', '23505', …), or null. */
export const pgErrorCode = (error: unknown): string | null =>
  findSqlState(error, 0);

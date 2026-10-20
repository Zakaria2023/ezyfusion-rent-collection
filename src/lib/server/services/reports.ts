import "server-only";
import { BUSINESS_TIME_ZONE, isYearMonth, monthsBetween } from "@/lib/dates";
import { toSafeNumber } from "@/lib/money";
import { requireMember } from "../access";
import type { Actor } from "../auth";
import { badRequest } from "../http";
import { prisma } from "../prisma";

// Collections report: approved payments per Malaysia calendar month of
// received_at, one row per month in the range (zeros included).

const MAX_MONTHS = 120;

export type CollectionsRow = { month: string; collectedSen: number };

type CollectionsDbRow = { month: string; collected: bigint };

/**
 * GET /api/reports/collections?from=YYYY-MM&to=YYYY-MM. Staff and managers.
 * Month boundaries are Malaysia midnight: each month is the instant range
 * [YYYY-MM-01 00:00 MYT, next month 00:00 MYT), so a payment at
 * 2026-03-01 00:30 MYT (2026-02-28T16:30Z) counts in March. A range join
 * (not date_trunc on the column) lets the (org_id, status, received_at)
 * index serve the query.
 */
export const collectionsReport = async (
  actor: Actor,
  from: unknown,
  to: unknown,
): Promise<CollectionsRow[]> => {
  requireMember(actor);
  if (!isYearMonth(from) || !isYearMonth(to)) {
    throw badRequest("from and to must be months written as YYYY-MM");
  }
  if (from > to) {
    throw badRequest("from must not be after to");
  }
  const months = monthsBetween(from, to);
  if (months.length > MAX_MONTHS) {
    throw badRequest(`Range is limited to ${MAX_MONTHS} months`);
  }

  const rows = await prisma.$queryRaw<CollectionsDbRow[]>`
    SELECT to_char(m.month_start, 'YYYY-MM') AS month,
           coalesce(sum(p.amount_sen), 0)::bigint AS collected
      FROM generate_series(
             ${`${from}-01`}::timestamp,
             ${`${to}-01`}::timestamp,
             interval '1 month'
           ) AS m(month_start)
      LEFT JOIN public.payments p
        ON p.org_id = ${actor.orgId}::uuid
       AND p.status = 'approved'
       AND p.received_at >= (m.month_start AT TIME ZONE ${BUSINESS_TIME_ZONE})
       AND p.received_at < ((m.month_start + interval '1 month') AT TIME ZONE ${BUSINESS_TIME_ZONE})
     GROUP BY m.month_start
     ORDER BY m.month_start`;

  return rows.map((row) => ({
    month: row.month,
    collectedSen: toSafeNumber(BigInt(row.collected)),
  }));
};

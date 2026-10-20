import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import {
  generateSchedule,
  invoiceStatus,
  type InvoiceKind,
  type InvoiceStatus,
  type ScheduledInvoice,
} from "@/lib/billing";
import {
  calendarDateFromDb,
  calendarDateToDb,
  toMalaysiaIso,
  todayInMalaysia,
} from "@/lib/dates";
import { toSafeNumber } from "@/lib/money";
import {
  isUuid,
  requireManager,
  requireMember,
  requireVisibleLease,
} from "../access";
import { writeAudit } from "../allocation";
import type { Actor } from "../auth";
import { pgErrorCode } from "../db-errors";
import { badRequest, conflict, notFound } from "../http";
import { prisma } from "../prisma";

// Lease creation and the read models built on leases (lease detail, leases
// list, dashboard). Services take an Actor and authorize themselves; routes,
// Server Actions and the seed script all go through here.

const createLeaseSchema = z.object({
  unitId: z.string(),
  tenantId: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  monthlyRentSen: z.int().positive(),
  depositSen: z.int().nonnegative(),
});

const PAGE_SIZE = 20;
// 100 years of monthly invoices. Guards against a typo (year 9999) inserting
// ~100k rows in one request; no real lease comes close.
const MAX_SCHEDULE_LENGTH = 1201;
const TRANSACTION_OPTIONS = { maxWait: 10000, timeout: 20000 };
const EXCLUSION_VIOLATION = "23P01";
const OVERLAP_MESSAGE = "The unit already has a lease overlapping these dates";

const paymentMethods = ["cash", "bank_transfer", "online"] as const;
const paymentStatuses = [
  "pending_verification",
  "approved",
  "rejected",
  "voided",
] as const;

export type CreateLeaseInput = z.input<typeof createLeaseSchema>;

export type LeaseDetail = {
  lease: {
    id: string;
    unitId: string;
    tenantId: string;
    startDate: string;
    endDate: string;
    monthlyRentSen: number;
    depositSen: number;
  };
  invoices: {
    id: string;
    kind: InvoiceKind;
    periodIndex: number | null;
    periodStart: string | null;
    periodEnd: string | null;
    dueDate: string;
    amountSen: number;
    paidSen: number;
    status: InvoiceStatus;
  }[];
  payments: {
    id: string;
    amountSen: number;
    unappliedSen: number;
    method: "cash" | "bank_transfer" | "online";
    status: "pending_verification" | "approved" | "rejected" | "voided";
    receivedAt: string;
  }[];
};

export type LeaseListRow = {
  id: string;
  unitName: string;
  tenantName: string;
  startDate: string;
  endDate: string;
  monthlyRentSen: number;
  depositSen: number;
};

export type LeaseListQuery = { q?: string; page?: number };

export type LeaseList = {
  rows: LeaseListRow[];
  total: number;
  pageSize: number;
};

export type DashboardStats = { overdueCount: number };

type OverdueCandidateRow = {
  due_date: Date;
  amount_sen: bigint;
  paid_sen: bigint;
};

const asPaymentMethod = (
  value: string,
): LeaseDetail["payments"][number]["method"] => {
  const method = paymentMethods.find((m) => m === value);
  if (!method) {
    throw new Error(`Unknown payment method in database: ${value}`);
  }
  return method;
};

const asPaymentStatus = (
  value: string,
): LeaseDetail["payments"][number]["status"] => {
  const status = paymentStatuses.find((s) => s === value);
  if (!status) {
    throw new Error(`Unknown payment status in database: ${value}`);
  }
  return status;
};

const asInvoiceKind = (value: string): InvoiceKind => {
  if (value !== "deposit" && value !== "rent") {
    throw new Error(`Unknown invoice kind in database: ${value}`);
  }
  return value;
};

const scheduleOrBadRequest = (
  input: z.output<typeof createLeaseSchema>,
): ScheduledInvoice[] => {
  let schedule: ScheduledInvoice[];
  try {
    schedule = generateSchedule(input);
  } catch (error) {
    throw badRequest(error instanceof Error ? error.message : "Invalid lease");
  }
  if (schedule.length > MAX_SCHEDULE_LENGTH) {
    throw badRequest("Lease is too long (more than 100 years)");
  }
  return schedule;
};

/**
 * Manager only. Stores the lease and exactly generateSchedule's invoices, all
 * or nothing. Overlap safety: the unit row is locked first, so concurrent
 * creates on one unit queue up and the pre-check sees the earlier lease; the
 * leases_no_overlap exclusion constraint is the backstop (23P01 -> 409).
 */
export const createLease = async (
  actor: Actor,
  input: unknown,
): Promise<{ id: string }> => {
  requireManager(actor);
  const data = createLeaseSchema.parse(input);
  const schedule = scheduleOrBadRequest(data);
  // A malformed id is invalid input (400); a well-formed id of another org's
  // unit/tenant is "not found" (404) further down, never revealed.
  if (!isUuid(data.unitId) || !isUuid(data.tenantId)) {
    throw badRequest("unitId and tenantId must be UUIDs");
  }
  const startDate = calendarDateToDb(data.startDate);
  const endDate = calendarDateToDb(data.endDate);

  try {
    return await prisma.$transaction(async (tx) => {
      const units = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM public.units
         WHERE id = ${data.unitId}::uuid AND org_id = ${actor.orgId}::uuid
           FOR UPDATE`;
      if (units.length === 0) {
        throw notFound();
      }
      const tenant = await tx.tenants.findFirst({
        where: { id: data.tenantId, org_id: actor.orgId },
        select: { id: true },
      });
      if (!tenant) {
        throw notFound();
      }
      // Both ends inclusive: [a, b] and [c, d] overlap iff a <= d and c <= b.
      const overlapping = await tx.leases.findFirst({
        where: {
          unit_id: data.unitId,
          start_date: { lte: endDate },
          end_date: { gte: startDate },
        },
        select: { id: true },
      });
      if (overlapping) {
        throw conflict(OVERLAP_MESSAGE);
      }

      const lease = await tx.leases.create({
        data: {
          org_id: actor.orgId,
          unit_id: data.unitId,
          tenant_id: data.tenantId,
          start_date: startDate,
          end_date: endDate,
          monthly_rent_sen: BigInt(data.monthlyRentSen),
          deposit_sen: BigInt(data.depositSen),
          created_by: actor.userId,
        },
        select: { id: true },
      });
      await tx.invoices.createMany({
        data: schedule.map((invoice): Prisma.invoicesCreateManyInput => ({
          org_id: actor.orgId,
          lease_id: lease.id,
          kind: invoice.kind,
          period_index: invoice.periodIndex,
          period_start:
            invoice.periodStart === null
              ? null
              : calendarDateToDb(invoice.periodStart),
          period_end:
            invoice.periodEnd === null
              ? null
              : calendarDateToDb(invoice.periodEnd),
          due_date: calendarDateToDb(invoice.dueDate),
          amount_sen: BigInt(invoice.amountSen),
        })),
      });
      await writeAudit(tx, {
        orgId: actor.orgId,
        actorId: actor.userId,
        action: "lease.created",
        entityId: lease.id,
        details: {
          unitId: data.unitId,
          tenantId: data.tenantId,
          startDate: data.startDate,
          endDate: data.endDate,
          monthlyRentSen: data.monthlyRentSen,
          depositSen: data.depositSen,
          invoiceCount: schedule.length,
        },
      });
      return { id: lease.id };
    }, TRANSACTION_OPTIONS);
  } catch (error) {
    if (pgErrorCode(error) === EXCLUSION_VIOLATION) {
      throw conflict(OVERLAP_MESSAGE);
    }
    throw error;
  }
};

/**
 * GET /api/leases/:leaseId. Invoices in allocation order (due date, deposit
 * before rent, period index); paid = sum of allocations; status computed now.
 */
export const getLeaseDetail = async (
  actor: Actor,
  leaseId: string,
  now: Date = new Date(),
): Promise<LeaseDetail> => {
  const lease = await requireVisibleLease(actor, leaseId);
  const [invoices, payments] = await Promise.all([
    prisma.invoices.findMany({
      where: { lease_id: lease.id },
      // kind ASC puts 'deposit' before 'rent' (alphabetical), which is the
      // brief's "deposit before rent" tie-break on the same due date.
      orderBy: [{ due_date: "asc" }, { kind: "asc" }, { period_index: "asc" }],
      include: { payment_allocations: { select: { amount_sen: true } } },
    }),
    prisma.payments.findMany({
      where: { lease_id: lease.id },
      orderBy: [{ received_at: "asc" }, { created_at: "asc" }],
    }),
  ]);

  return {
    lease: {
      id: lease.id,
      unitId: lease.unit_id,
      tenantId: lease.tenant_id,
      startDate: calendarDateFromDb(lease.start_date),
      endDate: calendarDateFromDb(lease.end_date),
      monthlyRentSen: toSafeNumber(lease.monthly_rent_sen),
      depositSen: toSafeNumber(lease.deposit_sen),
    },
    invoices: invoices.map((invoice) => {
      const paidSen = toSafeNumber(
        invoice.payment_allocations.reduce((sum, a) => sum + a.amount_sen, 0n),
      );
      const amountSen = toSafeNumber(invoice.amount_sen);
      const dueDate = calendarDateFromDb(invoice.due_date);
      return {
        id: invoice.id,
        kind: asInvoiceKind(invoice.kind),
        periodIndex: invoice.period_index,
        periodStart:
          invoice.period_start === null
            ? null
            : calendarDateFromDb(invoice.period_start),
        periodEnd:
          invoice.period_end === null
            ? null
            : calendarDateFromDb(invoice.period_end),
        dueDate,
        amountSen,
        paidSen,
        status: invoiceStatus({ dueDate, amountSen, paidSen }, now),
      };
    }),
    payments: payments.map((payment) => ({
      id: payment.id,
      amountSen: toSafeNumber(payment.amount_sen),
      unappliedSen: toSafeNumber(payment.unapplied_sen),
      method: asPaymentMethod(payment.method),
      status: asPaymentStatus(payment.status),
      receivedAt: toMalaysiaIso(payment.received_at),
    })),
  };
};

/**
 * Leases list for the UI: members see their organization's leases, a tenant
 * sees their own. Server-side search on unit or tenant name, 20 per page.
 */
export const listLeases = async (
  actor: Actor,
  query: LeaseListQuery = {},
): Promise<LeaseList> => {
  const q = query.q?.trim() ?? "";
  const page =
    query.page !== undefined &&
    Number.isSafeInteger(query.page) &&
    query.page > 0
      ? query.page
      : 1;
  const where: Prisma.leasesWhereInput = {
    org_id: actor.orgId,
    ...(actor.kind === "tenant" ? { tenant_id: actor.tenantId } : {}),
    ...(q
      ? {
          OR: [
            { units: { name: { contains: q, mode: "insensitive" } } },
            { tenants: { full_name: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.leases.findMany({
      where,
      orderBy: [{ start_date: "desc" }, { id: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        units: { select: { name: true } },
        tenants: { select: { full_name: true } },
      },
    }),
    prisma.leases.count({ where }),
  ]);
  return {
    rows: rows.map((lease) => ({
      id: lease.id,
      unitName: lease.units.name,
      tenantName: lease.tenants.full_name,
      startDate: calendarDateFromDb(lease.start_date),
      endDate: calendarDateFromDb(lease.end_date),
      monthlyRentSen: toSafeNumber(lease.monthly_rent_sen),
      depositSen: toSafeNumber(lease.deposit_sen),
    })),
    total,
    pageSize: PAGE_SIZE,
  };
};

/**
 * Dashboard numbers for staff and managers. The overdue count uses
 * invoiceStatus (statuses are never stored); SQL only pre-filters invoices
 * that are not fully paid and due before today's Malaysia date.
 */
export const dashboardStats = async (
  actor: Actor,
  now: Date = new Date(),
): Promise<DashboardStats> => {
  requireMember(actor);
  const today = todayInMalaysia(now);
  const candidates = await prisma.$queryRaw<OverdueCandidateRow[]>`
    SELECT i.due_date, i.amount_sen,
           coalesce(sum(a.amount_sen), 0)::bigint AS paid_sen
      FROM public.invoices i
      LEFT JOIN public.payment_allocations a ON a.invoice_id = i.id
     WHERE i.org_id = ${actor.orgId}::uuid
       AND i.due_date < ${today}::date
     GROUP BY i.id
    HAVING coalesce(sum(a.amount_sen), 0) < i.amount_sen`;
  const overdueCount = candidates.filter(
    (row) =>
      invoiceStatus(
        {
          dueDate: calendarDateFromDb(row.due_date),
          amountSen: toSafeNumber(BigInt(row.amount_sen)),
          paidSen: toSafeNumber(BigInt(row.paid_sen)),
        },
        now,
      ) === "overdue",
  ).length;
  return { overdueCount };
};

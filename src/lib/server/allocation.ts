import "server-only";
import type { Prisma } from "@/generated/prisma/client";

// Money-moving building blocks. Every function takes the caller's transaction:
// they are only correct inside one that has already called lockLease().
//
// Lock order (the same everywhere, so two transactions never deadlock):
//   1. the lease row (lockLease)            — serializes all money on a lease
//   2. the payment row, if any (FOR UPDATE)
//   3. invoice/payment rows touched by the allocation trigger (FOR NO KEY UPDATE)

export type Tx = Prisma.TransactionClient;

export type LeaseTotals = {
  invoicedSen: bigint;
  allocatedSen: bigint;
  pendingSen: bigint;
};

export type AuditEntry = {
  orgId: string;
  actorId: string | null;
  action: string;
  entityId: string | null;
  details: Prisma.InputJsonObject;
};

type UnpaidInvoiceRow = { id: string; unpaid_sen: bigint };
type TotalsRow = { invoiced: bigint; allocated: bigint; pending: bigint };

/**
 * Takes the lease row lock. Every money-moving transaction on a lease calls
 * this FIRST, so cap checks, approvals, voids and webhook settlements on one
 * lease run one at a time and each sees the previous one's committed rows.
 * Returns false if the lease does not exist.
 */
export const lockLease = async (tx: Tx, leaseId: string): Promise<boolean> => {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM public.leases WHERE id = ${leaseId}::uuid FOR UPDATE`;
  return rows.length > 0;
};

/** Sums for the cap: total invoiced, total allocated, total still pending_verification. */
export const leaseTotals = async (
  tx: Tx,
  leaseId: string,
): Promise<LeaseTotals> => {
  const rows = await tx.$queryRaw<TotalsRow[]>`
    SELECT
      (SELECT coalesce(sum(i.amount_sen), 0)::bigint
         FROM public.invoices i
        WHERE i.lease_id = ${leaseId}::uuid) AS invoiced,
      (SELECT coalesce(sum(a.amount_sen), 0)::bigint
         FROM public.payment_allocations a
         JOIN public.invoices i ON i.id = a.invoice_id
        WHERE i.lease_id = ${leaseId}::uuid) AS allocated,
      (SELECT coalesce(sum(p.amount_sen), 0)::bigint
         FROM public.payments p
        WHERE p.lease_id = ${leaseId}::uuid
          AND p.status = 'pending_verification') AS pending`;
  const row = rows[0];
  if (!row) {
    throw new Error("leaseTotals returned no row");
  }
  return {
    invoicedSen: BigInt(row.invoiced),
    allocatedSen: BigInt(row.allocated),
    pendingSen: BigInt(row.pending),
  };
};

/**
 * Allocates an approved payment to its lease's invoices that still have
 * something unpaid, in allocation order (due date, deposit before rent, period
 * index), filling each before the next — including invoices not due yet.
 * Whatever is left is stored as unapplied_sen. Caller holds the lease lock.
 */
export const allocatePayment = async (
  tx: Tx,
  paymentId: string,
): Promise<void> => {
  const payment = await tx.payments.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      org_id: true,
      lease_id: true,
      amount_sen: true,
      status: true,
      _count: { select: { payment_allocations: true } },
    },
  });
  if (!payment) {
    throw new Error(`Payment ${paymentId} not found`);
  }
  if (payment.status !== "approved") {
    throw new Error(`Payment ${paymentId} is ${payment.status}, not approved`);
  }
  if (payment._count.payment_allocations > 0) {
    throw new Error(`Payment ${paymentId} is already allocated`);
  }

  const invoices = await tx.$queryRaw<UnpaidInvoiceRow[]>`
    SELECT i.id,
           (i.amount_sen - coalesce(sum(a.amount_sen), 0))::bigint AS unpaid_sen
      FROM public.invoices i
      LEFT JOIN public.payment_allocations a ON a.invoice_id = i.id
     WHERE i.lease_id = ${payment.lease_id}::uuid
     GROUP BY i.id
    HAVING i.amount_sen - coalesce(sum(a.amount_sen), 0) > 0
     ORDER BY i.due_date, (i.kind = 'deposit') DESC, i.period_index, i.id`;

  let remaining = payment.amount_sen;
  const allocations: Prisma.payment_allocationsCreateManyInput[] = [];
  for (const invoice of invoices) {
    if (remaining <= 0n) {
      break;
    }
    const unpaid = BigInt(invoice.unpaid_sen);
    const amount = remaining < unpaid ? remaining : unpaid;
    allocations.push({
      org_id: payment.org_id,
      payment_id: payment.id,
      invoice_id: invoice.id,
      amount_sen: amount,
    });
    remaining -= amount;
  }

  if (allocations.length > 0) {
    await tx.payment_allocations.createMany({ data: allocations });
  }
  if (remaining > 0n) {
    await tx.payments.update({
      where: { id: payment.id },
      data: { unapplied_sen: remaining },
    });
  }
};

/** Appends one audit_log row (append-only table) inside the caller's transaction. */
export const writeAudit = async (tx: Tx, entry: AuditEntry): Promise<void> => {
  await tx.audit_log.create({
    data: {
      org_id: entry.orgId,
      actor_id: entry.actorId,
      action: entry.action,
      entity_id: entry.entityId,
      details: entry.details,
    },
  });
};

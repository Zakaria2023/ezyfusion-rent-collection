import "server-only";
import { Prisma } from "@/generated/prisma/client";
import {
  parseCallbackBody,
  parsePaidAt,
  parseSenAmount,
  verifySignature,
} from "@/lib/gateway-signature";
import { todayInMalaysia } from "@/lib/dates";
import { toSafeNumber } from "@/lib/money";
import type { Actor } from "../auth";
import { findVisibleLease, requireVisibleLease } from "../access";
import { allocatePayment, lockLease, writeAudit } from "../allocation";
import type { Tx } from "../allocation";
import { forbidden, unprocessable } from "../http";
import { prisma } from "../prisma";

// Online payments (docs/TASK.md section 5): a tenant opens a gateway bill for
// what is due now; only the signed webhook callback can settle it.

type CreatedBill = { billId: string; amountSen: number };

type CallbackResult = { status: number; body: Record<string, unknown> };

type BillView = {
  id: string;
  amountSen: number;
  status: string;
  leaseId: string;
  paidAt: string | null;
};

type DueRow = { due: bigint };

type BillStatusRow = { status: string };

type SettleOutcome = "settled" | "failed" | "noop";

type ValidCallback =
  | { billId: string; paid: false }
  | {
      billId: string;
      paid: true;
      amountSen: number;
      paidAt: Date;
      transactionId: string | null;
    };

const GATEWAY_BILL_UNIQUE = "payments_gateway_bill_id_key";

// Concurrent deliveries of one callback queue on the lease lock; give them
// room beyond Prisma's 2 s / 5 s defaults instead of failing with a 500.
const TX_OPTIONS = { maxWait: 10_000, timeout: 15_000 };

const OK: CallbackResult = { status: 200, body: { ok: true } };

const reply = (status: number, error: string): CallbackResult => ({
  status,
  body: { error },
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

// The pg driver adapter reports a unique violation as P2002 (model query) or
// P2010 (raw query), with the Postgres code and index under
// meta.driverAdapterError.cause. Only OUR constraint counts as "already done".
const isGatewayBillUniqueViolation = (error: unknown): boolean => {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }
  const adapterError = error.meta?.driverAdapterError;
  const cause = isRecord(adapterError) ? adapterError.cause : undefined;
  if (!isRecord(cause) || cause.originalCode !== "23505") {
    return false;
  }
  const constraint = cause.constraint;
  return isRecord(constraint) && constraint.index === GATEWAY_BILL_UNIQUE;
};

// Unpaid amount of the lease's invoices due on or before `today` (a Malaysia
// calendar date). Allocations never exceed an invoice (trigger), but
// greatest(…, 0) keeps the sum honest even so.
const amountDueNow = async (
  tx: Tx,
  leaseId: string,
  today: string,
): Promise<bigint> => {
  const rows = await tx.$queryRaw<DueRow[]>`
    SELECT coalesce(sum(greatest(i.amount_sen - coalesce(a.allocated, 0), 0)), 0)::bigint AS due
      FROM public.invoices i
      LEFT JOIN (
        SELECT invoice_id, sum(amount_sen) AS allocated
          FROM public.payment_allocations
         GROUP BY invoice_id
      ) a ON a.invoice_id = i.id
     WHERE i.lease_id = ${leaseId}::uuid
       AND i.due_date <= ${today}::date`;
  return BigInt(rows[0]?.due ?? 0n);
};

/** POST /api/leases/:leaseId/gateway-bills — the lease's own tenant only. */
export const createGatewayBill = async (
  actor: Actor,
  leaseId: string,
  now: Date = new Date(),
): Promise<CreatedBill> => {
  // 404 first (other org / other tenant / bad id), then 403 for staff/manager.
  const lease = await requireVisibleLease(actor, leaseId);
  if (actor.kind !== "tenant" || lease.tenant_id !== actor.tenantId) {
    throw forbidden();
  }
  const today = todayInMalaysia(now);
  return prisma.$transaction(async (tx) => {
    await lockLease(tx, lease.id);
    const due = await amountDueNow(tx, lease.id, today);
    if (due <= 0n) {
      throw unprocessable("Nothing is due");
    }
    // id comes from the DB default: 'bill_' + 32 random hex (unguessable).
    const bill = await tx.gateway_bills.create({
      data: {
        org_id: lease.org_id,
        lease_id: lease.id,
        amount_sen: due,
        created_by: actor.userId,
      },
      select: { id: true, amount_sen: true },
    });
    return { billId: bill.id, amountSen: toSafeNumber(bill.amount_sen) };
  }, TX_OPTIONS);
};

/** The bill, only if its lease is visible to the actor. Read-only. */
export const getBillForActor = async (
  actor: Actor,
  billId: string,
): Promise<BillView | null> => {
  const bill = await prisma.gateway_bills.findFirst({
    where: { id: billId, org_id: actor.orgId },
  });
  if (!bill) {
    return null;
  }
  const lease = await findVisibleLease(actor, bill.lease_id);
  if (!lease) {
    return null;
  }
  return {
    id: bill.id,
    amountSen: toSafeNumber(bill.amount_sen),
    status: bill.status,
    leaseId: bill.lease_id,
    paidAt: bill.paid_at ? bill.paid_at.toISOString() : null,
  };
};

// Field validation, run only AFTER the signature has been verified.
const validateFields = (
  fields: Record<string, string>,
): ValidCallback | string => {
  const billId = fields.id;
  if (!billId) {
    return "Missing id";
  }
  if (fields.paid === "false") {
    return { billId, paid: false };
  }
  if (fields.paid !== "true") {
    return "paid must be true or false";
  }
  const amountSen = parseSenAmount(fields.paid_amount ?? "");
  if (amountSen === null) {
    return "Invalid paid_amount";
  }
  const paidAt = parsePaidAt(fields.paid_at ?? "");
  if (paidAt === null) {
    return "Invalid paid_at";
  }
  return {
    billId,
    paid: true,
    amountSen,
    paidAt,
    transactionId: fields.transaction_id || null,
  };
};

// Applies a verified, validated callback. Lock order matches every other
// money path: lease row first, then the bill row. Under the lease lock the
// bill's status is re-read, so a concurrent duplicate sees 'paid' and no-ops.
const applyCallback = async (
  callback: ValidCallback,
  bill: { org_id: string; lease_id: string; amount_sen: bigint },
): Promise<SettleOutcome> =>
  prisma.$transaction(async (tx) => {
    await lockLease(tx, bill.lease_id);
    const rows = await tx.$queryRaw<BillStatusRow[]>`
      SELECT status FROM public.gateway_bills
       WHERE id = ${callback.billId} FOR UPDATE`;
    const status = rows[0]?.status;

    if (!callback.paid) {
      if (status !== "pending") {
        // failed: repeat delivery. paid: late/out-of-order — never goes back.
        return "noop";
      }
      await tx.gateway_bills.update({
        where: { id: callback.billId },
        data: { status: "failed" },
      });
      return "failed";
    }

    if (status === "paid") {
      return "noop";
    }
    await tx.gateway_bills.update({
      where: { id: callback.billId },
      data: {
        status: "paid",
        paid_at: callback.paidAt,
        transaction_id: callback.transactionId,
      },
    });
    // payments.gateway_bill_id is UNIQUE: even if this point were reached
    // twice, the second insert fails with 23505 and its transaction rolls back.
    const payment = await tx.payments.create({
      data: {
        org_id: bill.org_id,
        lease_id: bill.lease_id,
        amount_sen: bill.amount_sen,
        method: "online",
        status: "approved",
        received_at: callback.paidAt,
        gateway_bill_id: callback.billId,
      },
      select: { id: true },
    });
    await allocatePayment(tx, payment.id);
    await writeAudit(tx, {
      orgId: bill.org_id,
      actorId: null,
      action: "payment.online_settled",
      entityId: payment.id,
      details: {
        billId: callback.billId,
        amountSen: toSafeNumber(bill.amount_sen),
        transactionId: callback.transactionId,
      },
    });
    return "settled";
  }, TX_OPTIONS);

/**
 * POST /api/webhooks/gateway. Takes the raw x-www-form-urlencoded body.
 * Never logs the key or the payload.
 */
export const processGatewayCallback = async (
  rawBody: string,
  key: string,
): Promise<CallbackResult> => {
  // 1. Signature before anything else: an unsigned body tells us nothing.
  const parsed = parseCallbackBody(rawBody);
  if (!parsed.ok || !verifySignature(parsed.fields, key)) {
    return reply(401, "Invalid signature");
  }

  // 2. Shape of the signed fields.
  const callback = validateFields(parsed.fields);
  if (typeof callback === "string") {
    return reply(400, callback);
  }

  // 3. The bill. lease_id and amount_sen are immutable (trigger), so reading
  //    them outside the transaction is safe; status is re-read under lock.
  const bill = await prisma.gateway_bills.findUnique({
    where: { id: callback.billId },
    select: { org_id: true, lease_id: true, amount_sen: true },
  });
  if (!bill) {
    return reply(404, "Unknown bill");
  }
  if (callback.paid && BigInt(callback.amountSen) !== bill.amount_sen) {
    return reply(422, "paid_amount does not match the bill");
  }

  // 4. The effect, exactly once.
  try {
    await applyCallback(callback, bill);
  } catch (error) {
    if (isGatewayBillUniqueViolation(error)) {
      // Another delivery created this bill's payment first: already done.
      return OK;
    }
    throw error;
  }
  return OK;
};

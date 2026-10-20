import "server-only";
import { z } from "zod";
import type { payments } from "@/generated/prisma/client";
import { toSafeNumber } from "@/lib/money";
import {
  requireManager,
  requireMember,
  requireVisibleLease,
  requireVisiblePayment,
} from "../access";
import {
  allocatePayment,
  leaseTotals,
  lockLease,
  writeAudit,
  type Tx,
} from "../allocation";
import type { Actor } from "../auth";
import { pgErrorCode } from "../db-errors";
import { badRequest, conflict, notFound, unprocessable } from "../http";
import { prisma } from "../prisma";
import {
  removeSlip,
  signedSlipUrl,
  uploadSlip,
  verifyStoredSlip,
} from "../slips";

// Manual payments (cash, bank transfer) and the manager decisions on them.
//
// Concurrency: every transaction here locks the lease row FIRST (lockLease),
// then re-reads whatever it decides on. Two staff recording at once, or two
// managers approving at once, therefore run one after the other on that
// lease, and the second sees the first's committed rows: the cap cannot be
// exceeded together and a payment cannot be approved (allocated) twice.
//
// Check order in every entry point: 404 (not visible) -> 403 (role) ->
// 400 (input) -> 409 (state) / 422 (amount). 401 is the route's job.

const TRANSACTION_OPTIONS = { maxWait: 10000, timeout: 20000 };
const FK_VIOLATION = "23503";
const UNIQUE_VIOLATION = "23505";

// '+0800' (ISO 8601 basic offset) → '+08:00', which zod's validator expects.
const normalizeOffset = (value: unknown): unknown =>
  typeof value === "string"
    ? value.replace(/([+-]\d{2})(\d{2})$/, "$1:$2")
    : value;

const recordPaymentSchema = z.object({
  amountSen: z.int().positive(),
  method: z.enum(["cash", "bank_transfer"]),
  // ISO 8601 with an explicit offset (Z, ±hh:mm or ±hhmm); a bare local
  // time is ambiguous on a UTC server, so it is refused rather than guessed.
  receivedAt: z.union([
    z.preprocess(normalizeOffset, z.iso.datetime({ offset: true })),
    z.date(),
  ]),
  // null is treated like "absent" (a JSON client may send slipPath: null).
  slipPath: z
    .string()
    .min(1)
    .nullish()
    .transform((value) => value ?? undefined),
});

// Counted in characters (code points), like the DB's char_length CHECK;
// zod's .min() counts UTF-16 units, so "😀😀😀" would pass it and then fail
// the constraint with a 500.
const reasonSchema = z.object({
  reason: z
    .string()
    .trim()
    .refine(
      (reason) => [...reason].length >= 5,
      "Reason must be at least 5 characters",
    ),
});

export type RecordPaymentInput = z.input<typeof recordPaymentSchema>;
export type ReasonInput = z.input<typeof reasonSchema>;
export type PaymentStatus =
  "pending_verification" | "approved" | "rejected" | "voided";
export type RecordPaymentResult = { id: string; status: PaymentStatus };
export type DecisionResult = { status: PaymentStatus };
export type SlipInput = Omit<RecordPaymentInput, "slipPath" | "method"> & {
  method: "cash" | "bank_transfer";
};

const toInstant = (value: string | Date): Date => {
  const instant = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(instant.getTime())) {
    throw badRequest("receivedAt: Invalid date-time");
  }
  return instant;
};

// Re-reads the payment under a row lock, after the lease lock is held.
const lockPayment = async (tx: Tx, paymentId: string): Promise<payments> => {
  await tx.$queryRaw`
    SELECT id FROM public.payments WHERE id = ${paymentId}::uuid FOR UPDATE`;
  const payment = await tx.payments.findUnique({ where: { id: paymentId } });
  if (!payment) {
    throw notFound();
  }
  return payment;
};

const asStatus = (status: string): PaymentStatus => {
  if (
    status !== "pending_verification" &&
    status !== "approved" &&
    status !== "rejected" &&
    status !== "voided"
  ) {
    throw new Error(`Unknown payment status in database: ${status}`);
  }
  return status;
};

/**
 * POST /api/leases/:leaseId/payments. Staff and managers only. A manager's
 * payment is approved (and allocated) at once; a staff payment waits as
 * pending_verification. Capped at the lease's remaining balance minus what is
 * already pending.
 */
export const recordPayment = async (
  actor: Actor,
  leaseId: string,
  input: unknown,
): Promise<RecordPaymentResult> => {
  const lease = await requireVisibleLease(actor, leaseId);
  requireMember(actor);
  const data = recordPaymentSchema.parse(input);
  const receivedAt = toInstant(data.receivedAt);
  if (data.method === "bank_transfer") {
    if (!data.slipPath) {
      throw badRequest("slipPath: A bank transfer needs a slip");
    }
    if (!data.slipPath.startsWith(`${lease.org_id}/`)) {
      throw badRequest("slipPath: Slip must be in the organization's folder");
    }
    await verifyStoredSlip(data.slipPath);
  } else if (data.slipPath !== undefined) {
    throw badRequest("slipPath: Only a bank transfer has a slip");
  }

  const approveNow = actor.role === "manager";
  try {
    return await prisma.$transaction(async (tx) => {
      await lockLease(tx, lease.id);
      const totals = await leaseTotals(tx, lease.id);
      const cap = totals.invoicedSen - totals.allocatedSen - totals.pendingSen;
      if (BigInt(data.amountSen) > cap) {
        throw unprocessable(
          `Amount exceeds the remaining balance (max ${cap > 0n ? cap.toString() : "0"} sen)`,
        );
      }
      const decidedAt = new Date();
      const payment = await tx.payments.create({
        data: {
          org_id: lease.org_id,
          lease_id: lease.id,
          amount_sen: BigInt(data.amountSen),
          method: data.method,
          status: approveNow ? "approved" : "pending_verification",
          received_at: receivedAt,
          slip_path: data.slipPath ?? null,
          recorded_by: actor.userId,
          decided_by: approveNow ? actor.userId : null,
          decided_at: approveNow ? decidedAt : null,
        },
        select: { id: true, status: true },
      });
      await writeAudit(tx, {
        orgId: lease.org_id,
        actorId: actor.userId,
        action: "payment.recorded",
        entityId: payment.id,
        details: {
          leaseId: lease.id,
          amountSen: data.amountSen,
          method: data.method,
          receivedAt: receivedAt.toISOString(),
          slipPath: data.slipPath ?? null,
        },
      });
      if (approveNow) {
        await allocatePayment(tx, payment.id);
        await writeAudit(tx, {
          orgId: lease.org_id,
          actorId: actor.userId,
          action: "payment.approved",
          entityId: payment.id,
          details: {
            leaseId: lease.id,
            amountSen: data.amountSen,
            onRecord: true,
          },
        });
      }
      return { id: payment.id, status: asStatus(payment.status) };
    }, TRANSACTION_OPTIONS);
  } catch (error) {
    const code = pgErrorCode(error);
    // payments_slip_exists trigger: the file is not in the bucket.
    if (code === FK_VIOLATION) {
      throw badRequest("slipPath: Slip file not found");
    }
    // payments.slip_path is unique: one slip backs one payment.
    if (code === UNIQUE_VIOLATION) {
      throw badRequest("slipPath: Slip is already used by another payment");
    }
    throw error;
  }
};

/**
 * UI path for a bank transfer: upload the slip, record the payment, and
 * remove the uploaded file if recording fails (the brief: no file is left
 * behind). Cash goes straight to recordPayment.
 */
export const recordPaymentWithSlip = async (
  actor: Actor,
  leaseId: string,
  input: SlipInput,
  slip: File | null,
): Promise<RecordPaymentResult> => {
  const lease = await requireVisibleLease(actor, leaseId);
  requireMember(actor);
  if (input.method === "cash") {
    return recordPayment(actor, lease.id, input);
  }
  if (!slip) {
    throw badRequest("slip: A bank transfer needs a slip");
  }
  const slipPath = await uploadSlip(lease.org_id, lease.id, slip);
  try {
    return await recordPayment(actor, lease.id, { ...input, slipPath });
  } catch (error) {
    await removeSlip(slipPath).catch(() => undefined);
    throw error;
  }
};

/**
 * Manager only. Re-checks the amount against the remaining balance at this
 * moment (invoiced - allocated); if it no longer fits, 422 and it stays
 * pending. Approving twice at once: the second waits on the lease lock, then
 * sees 'approved' and gets 409, so allocation happens once.
 */
export const approvePayment = async (
  actor: Actor,
  paymentId: string,
): Promise<DecisionResult> => {
  const visible = await requireVisiblePayment(actor, paymentId);
  requireManager(actor);
  return prisma.$transaction(async (tx) => {
    await lockLease(tx, visible.lease_id);
    const payment = await lockPayment(tx, visible.id);
    if (payment.status !== "pending_verification") {
      throw conflict(`Payment is ${payment.status}, not pending_verification`);
    }
    const totals = await leaseTotals(tx, payment.lease_id);
    const remaining = totals.invoicedSen - totals.allocatedSen;
    if (payment.amount_sen > remaining) {
      throw unprocessable(
        `Amount exceeds the remaining balance (${remaining > 0n ? remaining.toString() : "0"} sen)`,
      );
    }
    await tx.payments.update({
      where: { id: payment.id },
      data: {
        status: "approved",
        decided_by: actor.userId,
        decided_at: new Date(),
      },
    });
    await allocatePayment(tx, payment.id);
    await writeAudit(tx, {
      orgId: payment.org_id,
      actorId: actor.userId,
      action: "payment.approved",
      entityId: payment.id,
      details: {
        leaseId: payment.lease_id,
        amountSen: toSafeNumber(payment.amount_sen),
      },
    });
    return { status: "approved" as const };
  }, TRANSACTION_OPTIONS);
};

/** Manager only. pending_verification -> rejected, with a reason (>= 5 chars). */
export const rejectPayment = async (
  actor: Actor,
  paymentId: string,
  input: unknown,
): Promise<DecisionResult> => {
  const visible = await requireVisiblePayment(actor, paymentId);
  requireManager(actor);
  const { reason } = reasonSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    await lockLease(tx, visible.lease_id);
    const payment = await lockPayment(tx, visible.id);
    if (payment.status !== "pending_verification") {
      throw conflict(`Payment is ${payment.status}, not pending_verification`);
    }
    await tx.payments.update({
      where: { id: payment.id },
      data: {
        status: "rejected",
        decision_reason: reason,
        decided_by: actor.userId,
        decided_at: new Date(),
      },
    });
    await writeAudit(tx, {
      orgId: payment.org_id,
      actorId: actor.userId,
      action: "payment.rejected",
      entityId: payment.id,
      details: { leaseId: payment.lease_id, reason },
    });
    return { status: "rejected" as const };
  }, TRANSACTION_OPTIONS);
};

/**
 * Manager only. approved -> voided, with a reason; removes this payment's
 * allocations only. Other payments are not touched and nothing is
 * re-allocated (in particular, no other payment's unapplied_sen moves in to
 * fill the reopened invoices — see DECISIONS.md).
 */
export const voidPayment = async (
  actor: Actor,
  paymentId: string,
  input: unknown,
): Promise<DecisionResult> => {
  const visible = await requireVisiblePayment(actor, paymentId);
  requireManager(actor);
  const { reason } = reasonSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    await lockLease(tx, visible.lease_id);
    const payment = await lockPayment(tx, visible.id);
    if (payment.status !== "approved") {
      throw conflict(`Payment is ${payment.status}, not approved`);
    }
    // Status first: the allocation trigger only allows deletes once voided.
    await tx.payments.update({
      where: { id: payment.id },
      data: {
        status: "voided",
        decision_reason: reason,
        decided_by: actor.userId,
        decided_at: new Date(),
      },
    });
    const removed = await tx.payment_allocations.deleteMany({
      where: { payment_id: payment.id },
    });
    await writeAudit(tx, {
      orgId: payment.org_id,
      actorId: actor.userId,
      action: "payment.voided",
      entityId: payment.id,
      details: {
        leaseId: payment.lease_id,
        amountSen: toSafeNumber(payment.amount_sen),
        reason,
        allocationsRemoved: removed.count,
      },
    });
    return { status: "voided" as const };
  }, TRANSACTION_OPTIONS);
};

/**
 * A 60-second signed URL for a payment's slip. Staff and managers of the
 * payment's organization only (tenants cannot read slips: 403); null when the
 * payment has no slip.
 */
export const paymentSlipUrl = async (
  actor: Actor,
  paymentId: string,
): Promise<string | null> => {
  const payment = await requireVisiblePayment(actor, paymentId);
  requireMember(actor);
  return payment.slip_path ? signedSlipUrl(payment.slip_path) : null;
};

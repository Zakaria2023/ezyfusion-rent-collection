import { describe, expect, it } from "vitest";
import { computeSignature } from "@/lib/gateway-signature";
import { HttpError } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import {
  createGatewayBill,
  getBillForActor,
  processGatewayCallback,
} from "@/lib/server/services/gateway";
import { createFixture } from "./helpers/fixtures";

// Online payments against the local database (docs/TASK.md section 5).
// Default fixture lease: three RM 1,000.00 rent invoices due 2026-01-01,
// 2026-02-01 and 2026-03-01, no deposit.

type CallbackFields = Record<string, string>;

const KEY = process.env.GATEWAY_X_SIGNATURE_KEY ?? "";

// 2026-02-15 08:00 MYT: the January and February invoices are due.
const MID_FEBRUARY = new Date("2026-02-15T00:00:00Z");

const signed = (fields: CallbackFields, key = KEY): string =>
  new URLSearchParams({
    ...fields,
    x_signature: computeSignature(fields, key),
  }).toString();

const paidFields = (
  billId: string,
  amountSen: number,
  paidAt = "2026-02-15 10:00:00 +0800",
): CallbackFields => ({
  id: billId,
  paid: "true",
  paid_amount: String(amountSen),
  paid_at: paidAt,
  transaction_id: `TX-${billId.slice(-6)}`,
  transaction_status: "completed",
});

const failedFields = (billId: string): CallbackFields => ({
  id: billId,
  paid: "false",
  paid_amount: "0",
  paid_at: "2026-02-15 10:00:00 +0800",
  transaction_id: `TX-${billId.slice(-6)}`,
  transaction_status: "failed",
});

const deliver = (fields: CallbackFields) =>
  processGatewayCallback(signed(fields), KEY);

const billState = async (billId: string) => {
  const bill = await prisma.gateway_bills.findUniqueOrThrow({
    where: { id: billId },
  });
  const payments = await prisma.payments.findMany({
    where: { gateway_bill_id: billId },
    include: { payment_allocations: true },
  });
  return { bill, payments };
};

const openBill = async (now = MID_FEBRUARY) => {
  const fixture = await createFixture();
  const bill = await createGatewayBill(
    fixture.tenantActor,
    fixture.leaseId,
    now,
  );
  return { fixture, bill };
};

const statusOf = async (promise: Promise<unknown>): Promise<number | null> => {
  try {
    await promise;
    return null;
  } catch (error) {
    if (error instanceof HttpError) {
      return error.status;
    }
    throw error;
  }
};

describe("createGatewayBill", () => {
  it("bills the unpaid amount of invoices due on or before today in Malaysia", async () => {
    const { bill } = await openBill();
    expect(bill.amountSen).toBe(200000);
    expect(bill.billId).toMatch(/^bill_[0-9a-f]{32}$/);
  });

  it("uses the Malaysia date: 2026-02-28 16:30 UTC is already 1 March in MYT", async () => {
    const { bill } = await openBill(new Date("2026-02-28T16:30:00Z"));
    expect(bill.amountSen).toBe(300000);
  });

  it("refuses with 422 when nothing is due yet", async () => {
    const fixture = await createFixture();
    // 2025-12-31 23:59:59 MYT: the first invoice is due tomorrow.
    const now = new Date("2025-12-31T15:59:59Z");
    expect(
      await statusOf(
        createGatewayBill(fixture.tenantActor, fixture.leaseId, now),
      ),
    ).toBe(422);
  });

  it("refuses with 422 once everything due is paid", async () => {
    const { fixture, bill } = await openBill();
    expect(
      (await deliver(paidFields(bill.billId, bill.amountSen))).status,
    ).toBe(200);
    expect(
      await statusOf(
        createGatewayBill(fixture.tenantActor, fixture.leaseId, MID_FEBRUARY),
      ),
    ).toBe(422);
  });

  it("returns 404 for another tenant's lease and 403 for staff and managers", async () => {
    const fixture = await createFixture();
    const other = await createFixture();
    expect(
      await statusOf(
        createGatewayBill(other.tenantActor, fixture.leaseId, MID_FEBRUARY),
      ),
    ).toBe(404);
    expect(
      await statusOf(
        createGatewayBill(other.managerActor, fixture.leaseId, MID_FEBRUARY),
      ),
    ).toBe(404);
    expect(
      await statusOf(
        createGatewayBill(fixture.staffActor, fixture.leaseId, MID_FEBRUARY),
      ),
    ).toBe(403);
    expect(
      await statusOf(
        createGatewayBill(fixture.managerActor, fixture.leaseId, MID_FEBRUARY),
      ),
    ).toBe(403);
  });
});

describe("getBillForActor", () => {
  it("shows the bill to its lease's tenant and org members, nobody else", async () => {
    const { fixture, bill } = await openBill();
    const other = await createFixture();
    const view = await getBillForActor(fixture.tenantActor, bill.billId);
    expect(view).toMatchObject({
      id: bill.billId,
      status: "pending",
      paidAt: null,
    });
    expect(
      await getBillForActor(fixture.staffActor, bill.billId),
    ).not.toBeNull();
    expect(await getBillForActor(other.tenantActor, bill.billId)).toBeNull();
    expect(await getBillForActor(other.managerActor, bill.billId)).toBeNull();
  });
});

describe("processGatewayCallback", () => {
  it("settles a pending bill: one approved payment, received_at = paid_at, allocated", async () => {
    const { fixture, bill } = await openBill();
    const result = await deliver(paidFields(bill.billId, bill.amountSen));
    expect(result).toEqual({ status: 200, body: { ok: true } });

    const { bill: row, payments } = await billState(bill.billId);
    expect(row.status).toBe("paid");
    expect(row.paid_at?.toISOString()).toBe("2026-02-15T02:00:00.000Z");
    expect(payments).toHaveLength(1);
    const payment = payments[0];
    expect(payment).toMatchObject({
      method: "online",
      status: "approved",
      amount_sen: 200000n,
      unapplied_sen: 0n,
      lease_id: fixture.leaseId,
    });
    expect(payment?.received_at.toISOString()).toBe("2026-02-15T02:00:00.000Z");
    // January then February, each filled.
    const invoices = await prisma.invoices.findMany({
      where: { lease_id: fixture.leaseId },
      orderBy: { due_date: "asc" },
      include: { payment_allocations: true },
    });
    const paid = invoices.map((invoice) =>
      invoice.payment_allocations.reduce((sum, a) => sum + a.amount_sen, 0n),
    );
    expect(paid).toEqual([100000n, 100000n, 0n]);

    const audit = await prisma.audit_log.findMany({
      where: { entity_id: payment?.id, action: "payment.online_settled" },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.actor_id).toBeNull();
  });

  it("treats a repeat delivery of a paid callback as a no-op", async () => {
    const { bill } = await openBill();
    const fields = paidFields(bill.billId, bill.amountSen);
    expect((await deliver(fields)).status).toBe(200);
    expect(await deliver(fields)).toEqual({ status: 200, body: { ok: true } });
    const { payments } = await billState(bill.billId);
    expect(payments).toHaveLength(1);
  });

  it("creates exactly one payment when 5 identical callbacks arrive at once", async () => {
    const { bill } = await openBill();
    const fields = paidFields(bill.billId, bill.amountSen);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => deliver(fields)),
    );
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    const { bill: row, payments } = await billState(bill.billId);
    expect(row.status).toBe("paid");
    expect(payments).toHaveLength(1);
    expect(payments[0]?.payment_allocations).toHaveLength(2);
  });

  it("ends paid with one payment when paid and failed callbacks race", async () => {
    const { bill } = await openBill();
    const results = await Promise.all([
      deliver(failedFields(bill.billId)),
      deliver(paidFields(bill.billId, bill.amountSen)),
      deliver(failedFields(bill.billId)),
      deliver(paidFields(bill.billId, bill.amountSen)),
    ]);
    expect(results.every((r) => r.status === 200)).toBe(true);
    const { bill: row, payments } = await billState(bill.billId);
    expect(row.status).toBe("paid");
    expect(payments).toHaveLength(1);
  });

  it("rejects a forged, missing or stale signature with 401 and changes nothing", async () => {
    const { bill } = await openBill();
    const fields = paidFields(bill.billId, bill.amountSen);
    expect(
      (await processGatewayCallback(signed(fields, "wrong_key"), KEY)).status,
    ).toBe(401);
    expect(
      (
        await processGatewayCallback(
          new URLSearchParams(fields).toString(),
          KEY,
        )
      ).status,
    ).toBe(401);
    // Signed, then a field changed in transit.
    const tampered = new URLSearchParams(signed(fields));
    tampered.set("paid_amount", "1");
    expect(
      (await processGatewayCallback(tampered.toString(), KEY)).status,
    ).toBe(401);
    // A field sent twice: we cannot tell which value was signed.
    expect(
      (await processGatewayCallback(`${signed(fields)}&id=${bill.billId}`, KEY))
        .status,
    ).toBe(401);
    expect((await processGatewayCallback("", KEY)).status).toBe(401);

    const { bill: row, payments } = await billState(bill.billId);
    expect(row.status).toBe("pending");
    expect(payments).toHaveLength(0);
  });

  it("returns 404 for an unknown bill", async () => {
    const result = await deliver(paidFields(`bill_${"0".repeat(32)}`, 100));
    expect(result).toEqual({ status: 404, body: { error: "Unknown bill" } });
  });

  it("returns 422 and changes nothing when paid_amount is not the bill's amount", async () => {
    const { bill } = await openBill();
    const result = await deliver(paidFields(bill.billId, bill.amountSen - 1));
    expect(result.status).toBe(422);
    const { bill: row, payments } = await billState(bill.billId);
    expect(row.status).toBe("pending");
    expect(payments).toHaveLength(0);
  });

  it("returns 400 for signed but malformed fields", async () => {
    const { bill } = await openBill();
    const base = paidFields(bill.billId, bill.amountSen);
    expect((await deliver({ ...base, paid: "yes" })).status).toBe(400);
    expect((await deliver({ ...base, paid_amount: "12.50" })).status).toBe(400);
    expect(
      (await deliver({ ...base, paid_at: "2026-02-30 10:00:00 +0800" })).status,
    ).toBe(400);
    const withoutId = Object.fromEntries(
      Object.entries(base).filter(([key]) => key !== "id"),
    );
    expect((await deliver(withoutId)).status).toBe(400);
    expect((await billState(bill.billId)).bill.status).toBe("pending");
  });

  it("paid=false: pending becomes failed, a repeat is a no-op", async () => {
    const { bill } = await openBill();
    expect((await deliver(failedFields(bill.billId))).status).toBe(200);
    expect((await billState(bill.billId)).bill.status).toBe("failed");
    expect((await deliver(failedFields(bill.billId))).status).toBe(200);
    const { bill: row, payments } = await billState(bill.billId);
    expect(row.status).toBe("failed");
    expect(payments).toHaveLength(0);
  });

  it("paid=false after paid (out of order) leaves the bill paid", async () => {
    const { bill } = await openBill();
    expect(
      (await deliver(paidFields(bill.billId, bill.amountSen))).status,
    ).toBe(200);
    expect((await deliver(failedFields(bill.billId))).status).toBe(200);
    const { bill: row, payments } = await billState(bill.billId);
    expect(row.status).toBe("paid");
    expect(payments).toHaveLength(1);
  });

  it("paid=true after failed settles the bill", async () => {
    const { bill } = await openBill();
    expect((await deliver(failedFields(bill.billId))).status).toBe(200);
    expect(
      (await deliver(paidFields(bill.billId, bill.amountSen))).status,
    ).toBe(200);
    const { bill: row, payments } = await billState(bill.billId);
    expect(row.status).toBe("paid");
    expect(payments).toHaveLength(1);
  });

  it("accepts an extra unknown field as long as it is signed", async () => {
    const { bill } = await openBill();
    const fields = {
      ...paidFields(bill.billId, bill.amountSen),
      currency: "MYR",
    };
    expect((await deliver(fields)).status).toBe(200);
    expect((await billState(bill.billId)).bill.status).toBe("paid");
  });

  it("stores paid_at 2026-03-01 00:30:00 +0800 as 2026-02-28T16:30:00Z", async () => {
    const { bill } = await openBill();
    const fields = paidFields(
      bill.billId,
      bill.amountSen,
      "2026-03-01 00:30:00 +0800",
    );
    expect((await deliver(fields)).status).toBe(200);
    const { bill: row, payments } = await billState(bill.billId);
    expect(row.paid_at?.toISOString()).toBe("2026-02-28T16:30:00.000Z");
    expect(payments[0]?.received_at.toISOString()).toBe(
      "2026-02-28T16:30:00.000Z",
    );
  });

  it("keeps what is left over as unapplied_sen once every invoice is paid", async () => {
    const fixture = await createFixture();
    const late = new Date("2026-03-15T00:00:00Z");
    // Two bills opened before either is paid both cover the full 300000.
    const first = await createGatewayBill(
      fixture.tenantActor,
      fixture.leaseId,
      late,
    );
    const second = await createGatewayBill(
      fixture.tenantActor,
      fixture.leaseId,
      late,
    );
    expect(
      (await deliver(paidFields(first.billId, first.amountSen))).status,
    ).toBe(200);
    expect(
      (await deliver(paidFields(second.billId, second.amountSen))).status,
    ).toBe(200);
    const { payments } = await billState(second.billId);
    expect(payments[0]).toMatchObject({
      amount_sen: 300000n,
      unapplied_sen: 300000n,
    });
    expect(payments[0]?.payment_allocations).toHaveLength(0);
  });
});

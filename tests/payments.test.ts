import { describe, expect, test } from "vitest";
import { z } from "zod";
import { generateSchedule } from "@/lib/billing";
import { calendarDateFromDb } from "@/lib/dates";
import { allocatePayment } from "@/lib/server/allocation";
import { HttpError } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import { createLease, getLeaseDetail } from "@/lib/server/services/leases";
import {
  approvePayment,
  recordPayment,
  rejectPayment,
  voidPayment,
} from "@/lib/server/services/payments";
import { collectionsReport } from "@/lib/server/services/reports";
import { createFixture } from "./helpers/fixtures";

// Integration tests against the local Supabase database (pnpm supabase start).

const RECEIVED_AT = "2026-01-15T10:00:00+08:00";
const ONE_MONTH = { startDate: "2026-01-01", endDate: "2026-01-31" };

const cash = (amountSen: number, receivedAt = RECEIVED_AT) => ({
  amountSen,
  method: "cash" as const,
  receivedAt,
});

const statusOf = async (promise: Promise<unknown>): Promise<number> => {
  try {
    await promise;
    return 200;
  } catch (error) {
    if (error instanceof HttpError) {
      return error.status;
    }
    if (error instanceof z.ZodError) {
      return 400;
    }
    throw error;
  }
};

const allocatedTo = async (paymentId: string): Promise<bigint> => {
  const result = await prisma.payment_allocations.aggregate({
    where: { payment_id: paymentId },
    _sum: { amount_sen: true },
  });
  return result._sum.amount_sen ?? 0n;
};

describe("recording payments", () => {
  test("the cap is the remaining balance minus pending payments", async () => {
    const f = await createFixture(); // 300000 invoiced
    expect(
      await statusOf(recordPayment(f.staffActor, f.leaseId, cash(300001))),
    ).toBe(422);
    const approved = await recordPayment(
      f.managerActor,
      f.leaseId,
      cash(100000),
    );
    expect(approved.status).toBe("approved");
    const pending = await recordPayment(f.staffActor, f.leaseId, cash(150000));
    expect(pending.status).toBe("pending_verification");
    // 300000 - 100000 allocated - 150000 pending = 50000 left.
    expect(
      await statusOf(recordPayment(f.staffActor, f.leaseId, cash(50001))),
    ).toBe(422);
    expect(
      (await recordPayment(f.managerActor, f.leaseId, cash(50000))).status,
    ).toBe("approved");
  });

  test("two concurrent staff payments cannot exceed the cap together", async () => {
    const f = await createFixture({
      lease: { ...ONE_MONTH, monthlyRentSen: 100000 },
    });
    const results = await Promise.allSettled([
      recordPayment(f.staffActor, f.leaseId, cash(80000)),
      recordPayment(f.staffActor, f.leaseId, cash(70000)),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(
      rejected[0]?.status === "rejected" &&
        rejected[0].reason instanceof HttpError &&
        rejected[0].reason.status,
    ).toBe(422);
    expect(
      await prisma.payments.count({ where: { lease_id: f.leaseId } }),
    ).toBe(1);
  });

  test("input validation", async () => {
    const f = await createFixture();
    const bad = [
      { ...cash(100), amountSen: 0 },
      { ...cash(100), amountSen: 1.5 },
      { ...cash(100), amountSen: "100" },
      { ...cash(100), receivedAt: "2026-01-15T10:00:00" }, // no offset
      { ...cash(100), slipPath: `${f.orgId}/x.pdf` }, // cash with a slip
      { ...cash(100), method: "bank_transfer" }, // no slip
      { ...cash(100), method: "bank_transfer", slipPath: "other-org/x.pdf" },
      {
        ...cash(100),
        method: "bank_transfer",
        slipPath: `${f.orgId}/missing.pdf`,
      },
      { ...cash(100), method: "online" },
      undefined,
    ];
    for (const body of bad) {
      expect(await statusOf(recordPayment(f.staffActor, f.leaseId, body))).toBe(
        400,
      );
    }
    expect(
      await prisma.payments.count({ where: { lease_id: f.leaseId } }),
    ).toBe(0);
  });
});

describe("approving, rejecting, voiding", () => {
  test("a payment approved twice at once is allocated once", async () => {
    const f = await createFixture();
    const payment = await recordPayment(f.staffActor, f.leaseId, cash(50000));
    const results = await Promise.all([
      statusOf(approvePayment(f.managerActor, payment.id)),
      statusOf(approvePayment(f.managerActor, payment.id)),
    ]);
    expect(results.sort()).toEqual([200, 409]);
    expect(await allocatedTo(payment.id)).toBe(50000n);
    expect(
      await prisma.audit_log.count({
        where: { entity_id: payment.id, action: "payment.approved" },
      }),
    ).toBe(1);
  });

  test("approval re-checks the remaining balance and leaves it pending on 422", async () => {
    const f = await createFixture({
      lease: { ...ONE_MONTH, monthlyRentSen: 100000 },
    });
    const pending = await recordPayment(f.staffActor, f.leaseId, cash(60000));
    // An online payment settles 50000 meanwhile (not subject to the cap).
    const bill = await prisma.gateway_bills.create({
      data: { org_id: f.orgId, lease_id: f.leaseId, amount_sen: 50000n },
    });
    await prisma.$transaction(async (tx) => {
      await tx.gateway_bills.update({
        where: { id: bill.id },
        data: { status: "paid", paid_at: new Date() },
      });
      const online = await tx.payments.create({
        data: {
          org_id: f.orgId,
          lease_id: f.leaseId,
          amount_sen: 50000n,
          method: "online",
          status: "approved",
          received_at: new Date(),
          gateway_bill_id: bill.id,
        },
      });
      await allocatePayment(tx, online.id);
    });
    expect(await statusOf(approvePayment(f.managerActor, pending.id))).toBe(
      422,
    );
    const after = await prisma.payments.findUniqueOrThrow({
      where: { id: pending.id },
    });
    expect(after.status).toBe("pending_verification");
    expect(await allocatedTo(pending.id)).toBe(0n);
  });

  test("receivedAt accepts ±hhmm offsets and future instants", async () => {
    const f = await createFixture();
    const basic = await recordPayment(f.staffActor, f.leaseId, {
      ...cash(100),
      receivedAt: "2026-03-01T00:30:00+0800",
    });
    const future = await recordPayment(f.staffActor, f.leaseId, {
      ...cash(100),
      receivedAt: "2027-01-15T10:00:00+08:00",
    });
    const stored = await prisma.payments.findUniqueOrThrow({
      where: { id: basic.id },
    });
    expect(stored.received_at.toISOString()).toBe("2026-02-28T16:30:00.000Z");
    expect(future.status).toBe("pending_verification");
  });

  test("reject needs a reason and a pending payment", async () => {
    const f = await createFixture();
    const payment = await recordPayment(f.staffActor, f.leaseId, cash(1000));
    expect(
      await statusOf(
        rejectPayment(f.managerActor, payment.id, { reason: "  abc  " }),
      ),
    ).toBe(400);
    // 3 characters but 6 UTF-16 units: must be a 400, not a DB CHECK 500.
    expect(
      await statusOf(
        rejectPayment(f.managerActor, payment.id, { reason: "😀😀😀" }),
      ),
    ).toBe(400);
    expect(
      await rejectPayment(f.managerActor, payment.id, {
        reason: "Slip unreadable",
      }),
    ).toEqual({ status: "rejected" });
    expect(
      await statusOf(
        rejectPayment(f.managerActor, payment.id, { reason: "Again please" }),
      ),
    ).toBe(409);
    expect(await statusOf(approvePayment(f.managerActor, payment.id))).toBe(
      409,
    );
  });

  test("void removes only that payment's allocations", async () => {
    const f = await createFixture();
    const first = await recordPayment(f.managerActor, f.leaseId, cash(100000));
    const second = await recordPayment(f.managerActor, f.leaseId, cash(50000));
    const secondBefore = await prisma.payment_allocations.findMany({
      where: { payment_id: second.id },
      orderBy: { invoice_id: "asc" },
    });
    expect(
      await statusOf(voidPayment(f.managerActor, first.id, { reason: "no" })),
    ).toBe(400);
    expect(
      await voidPayment(f.managerActor, first.id, { reason: "Cheque bounced" }),
    ).toEqual({ status: "voided" });
    expect(await allocatedTo(first.id)).toBe(0n);
    const secondAfter = await prisma.payment_allocations.findMany({
      where: { payment_id: second.id },
      orderBy: { invoice_id: "asc" },
    });
    expect(secondAfter).toEqual(secondBefore);
    expect(
      await statusOf(
        voidPayment(f.managerActor, first.id, { reason: "Cheque bounced" }),
      ),
    ).toBe(409);
    // Payments are never deleted.
    expect(
      await prisma.payments.count({ where: { lease_id: f.leaseId } }),
    ).toBe(2);
  });

  test("allocation order: due date, then deposit before rent, then period", async () => {
    const f = await createFixture({
      lease: {
        startDate: "2026-01-31",
        endDate: "2026-07-15",
        monthlyRentSen: 150000,
        depositSen: 300000,
      },
    });
    await recordPayment(f.managerActor, f.leaseId, cash(350000));
    const detail = await getLeaseDetail(f.managerActor, f.leaseId);
    expect(
      detail.invoices.map((i) => [i.kind, i.periodIndex, i.paidSen]),
    ).toEqual([
      ["deposit", null, 300000],
      ["rent", 0, 50000],
      ["rent", 1, 0],
      ["rent", 2, 0],
      ["rent", 3, 0],
      ["rent", 4, 0],
      ["rent", 5, 0],
    ]);
    expect(detail.invoices[1]?.status).toBe("overdue");
    expect(detail.invoices[0]?.status).toBe("paid");
    expect(detail.payments[0]?.receivedAt).toBe("2026-01-15T10:00:00+08:00");
  });
});

describe("access", () => {
  test("another organization's manager gets 404; wrong role gets 403", async () => {
    const f = await createFixture();
    const other = await createFixture();
    const payment = await recordPayment(f.staffActor, f.leaseId, cash(1000));
    expect(await statusOf(getLeaseDetail(other.managerActor, f.leaseId))).toBe(
      404,
    );
    expect(
      await statusOf(recordPayment(other.managerActor, f.leaseId, cash(1))),
    ).toBe(404);
    expect(await statusOf(approvePayment(other.managerActor, payment.id))).toBe(
      404,
    );
    expect(
      await statusOf(
        voidPayment(other.managerActor, payment.id, { reason: "whatever" }),
      ),
    ).toBe(404);
    expect(await statusOf(getLeaseDetail(other.tenantActor, f.leaseId))).toBe(
      404,
    );
    expect(await statusOf(getLeaseDetail(f.managerActor, "not-a-uuid"))).toBe(
      404,
    );
    // Visible, but the role may not: 403.
    expect(await statusOf(approvePayment(f.staffActor, payment.id))).toBe(403);
    expect(await statusOf(approvePayment(f.tenantActor, payment.id))).toBe(403);
    expect(
      await statusOf(recordPayment(f.tenantActor, f.leaseId, cash(1))),
    ).toBe(403);
    expect(await statusOf(getLeaseDetail(f.tenantActor, f.leaseId))).toBe(200);
    expect(
      await statusOf(collectionsReport(f.tenantActor, "2026-01", "2026-02")),
    ).toBe(403);
  });

  test("a manager cannot create a lease on another org's unit or tenant", async () => {
    const f = await createFixture();
    const other = await createFixture();
    const terms = {
      startDate: "2030-01-01",
      endDate: "2030-12-31",
      monthlyRentSen: 1000,
      depositSen: 0,
    };
    expect(
      await statusOf(
        createLease(f.managerActor, {
          ...terms,
          unitId: other.spareUnitId,
          tenantId: f.tenantId,
        }),
      ),
    ).toBe(404);
    expect(
      await statusOf(
        createLease(f.managerActor, {
          ...terms,
          unitId: f.spareUnitId,
          tenantId: other.tenantId,
        }),
      ),
    ).toBe(404);
    expect(
      await statusOf(
        createLease(f.staffActor, {
          ...terms,
          unitId: f.spareUnitId,
          tenantId: f.tenantId,
        }),
      ),
    ).toBe(403);
  });
});

describe("leases", () => {
  test("creating a lease stores exactly generateSchedule's invoices", async () => {
    const terms = {
      startDate: "2026-01-31",
      endDate: "2026-07-15",
      monthlyRentSen: 150000,
      depositSen: 300000,
    };
    const f = await createFixture({ lease: terms });
    const invoices = await prisma.invoices.findMany({
      where: { lease_id: f.leaseId },
      orderBy: [{ due_date: "asc" }, { kind: "asc" }, { period_index: "asc" }],
    });
    expect(
      invoices.map((i) => ({
        kind: i.kind,
        periodIndex: i.period_index,
        periodStart: i.period_start && calendarDateFromDb(i.period_start),
        periodEnd: i.period_end && calendarDateFromDb(i.period_end),
        dueDate: calendarDateFromDb(i.due_date),
        amountSen: Number(i.amount_sen),
      })),
    ).toEqual(generateSchedule(terms));
    expect(
      await prisma.audit_log.count({
        where: { entity_id: f.leaseId, action: "lease.created" },
      }),
    ).toBe(1);
  });

  test("overlapping leases are refused, including two at the same moment", async () => {
    const f = await createFixture(); // 2026-01-01..2026-03-31 on unitId
    const base = { tenantId: f.tenantId, monthlyRentSen: 1000, depositSen: 0 };
    expect(
      await statusOf(
        createLease(f.managerActor, {
          ...base,
          unitId: f.unitId,
          startDate: "2026-03-31", // inclusive end touches
          endDate: "2026-06-30",
        }),
      ),
    ).toBe(409);
    expect(
      await statusOf(
        createLease(f.managerActor, {
          ...base,
          unitId: f.unitId,
          startDate: "2026-04-01",
          endDate: "2026-06-30",
        }),
      ),
    ).toBe(200);
    expect(
      await statusOf(
        createLease(f.managerActor, {
          ...base,
          unitId: f.unitId,
          startDate: "2026-02-31",
          endDate: "2026-06-30",
        }),
      ),
    ).toBe(400);
    const concurrent = await Promise.all([
      statusOf(
        createLease(f.managerActor, {
          ...base,
          unitId: f.spareUnitId,
          startDate: "2027-01-01",
          endDate: "2027-12-31",
        }),
      ),
      statusOf(
        createLease(f.managerActor, {
          ...base,
          unitId: f.spareUnitId,
          startDate: "2027-06-01",
          endDate: "2028-05-31",
        }),
      ),
    ]);
    expect(concurrent.sort()).toEqual([200, 409]);
    expect(
      await prisma.leases.count({ where: { unit_id: f.spareUnitId } }),
    ).toBe(1);
  });
});

describe("collections report", () => {
  test("groups by Malaysia month, includes empty months, counts approved only", async () => {
    const f = await createFixture();
    await recordPayment(
      f.managerActor,
      f.leaseId,
      cash(30000, "2026-01-31T10:00:00+08:00"),
    );
    // 2026-03-01 00:30 in Malaysia is still February in UTC.
    await recordPayment(
      f.managerActor,
      f.leaseId,
      cash(20000, "2026-02-28T16:30:00Z"),
    );
    await recordPayment(
      f.staffActor,
      f.leaseId,
      cash(5000, "2026-02-10T10:00:00+08:00"),
    );
    const voided = await recordPayment(
      f.managerActor,
      f.leaseId,
      cash(7000, "2026-02-11T10:00:00+08:00"),
    );
    await voidPayment(f.managerActor, voided.id, { reason: "Recorded twice" });
    expect(await collectionsReport(f.staffActor, "2026-01", "2026-03")).toEqual(
      [
        { month: "2026-01", collectedSen: 30000 },
        { month: "2026-02", collectedSen: 0 },
        { month: "2026-03", collectedSen: 20000 },
      ],
    );
    expect(await collectionsReport(f.staffActor, "2025-12", "2025-12")).toEqual(
      [{ month: "2025-12", collectedSen: 0 }],
    );
  });

  test("invalid ranges are 400", async () => {
    const f = await createFixture();
    for (const [from, to] of [
      ["2026-13", "2026-12"],
      ["2026-1", "2026-02"],
      ["2026-03", "2026-01"],
      [null, "2026-01"],
      ["1900-01", "2026-01"], // over the 1200-month cap
      ["0000-01", "0000-02"], // no year 0 in Postgres
    ]) {
      expect(await statusOf(collectionsReport(f.managerActor, from, to))).toBe(
        400,
      );
    }
  });
});

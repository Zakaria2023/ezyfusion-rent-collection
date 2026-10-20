import { beforeAll, describe, expect, it, vi } from "vitest";
import { POST as postLeaseRoute } from "@/app/api/leases/route";
import { GET as getLeaseRoute } from "@/app/api/leases/[leaseId]/route";
import { POST as postBillRoute } from "@/app/api/leases/[leaseId]/gateway-bills/route";
import { POST as postPaymentRoute } from "@/app/api/leases/[leaseId]/payments/route";
import { POST as approveRoute } from "@/app/api/payments/[paymentId]/approve/route";
import { POST as rejectRoute } from "@/app/api/payments/[paymentId]/reject/route";
import { POST as voidRoute } from "@/app/api/payments/[paymentId]/void/route";
import { GET as reportRoute } from "@/app/api/reports/collections/route";
import { POST as webhookRoute } from "@/app/api/webhooks/gateway/route";
import { GET as slipRoute } from "@/app/(staff)/slips/[paymentId]/route";
import { generateSchedule } from "@/lib/billing";
import { todayInMalaysia } from "@/lib/dates";
import { prisma } from "@/lib/server/prisma";
import { recordPayment } from "@/lib/server/services/payments";
import {
  buildWorld,
  createUnit,
  L1_APPROVED_RECEIVED_AT,
  L1_APPROVED_SEN,
  L1_PENDING_SEN,
  L1_TERMS,
  LB_APPROVED_SEN,
  uploadSlipAsAdmin,
  type WorldWithRevoked,
} from "./helpers/auth-users";

// Access control of the HTTP API (docs/TASK.md sections 6 and 7), calling the
// route handlers directly with `Authorization: Bearer <real access token>`.
//   401 no valid login · 404 record in another org / another tenant's record
//   403 visible record, action not allowed for the role · then 400 / 409 / 422
// Every refusal also asserts that nothing changed in either organization.

// No request scope in Vitest: the cookie fallback (used when there is no
// Authorization header) sees an empty cookie jar, i.e. a browser without a
// session.
vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: () => undefined }),
}));

type Call = { status: number; body: unknown };

type SendOptions = {
  method: "GET" | "POST";
  path: string;
  /** The Authorization header value; undefined sends no header. */
  auth?: string;
  /** An object is sent as JSON; a string is sent as-is (malformed JSON tests). */
  body?: unknown;
};

type Run = (req: Request) => Promise<Response>;

type AuthVariant = { name: string; header: () => string | undefined };

type Endpoint = {
  name: string;
  call: (auth: string | undefined) => Promise<Call>;
};

const RECENT = "2026-10-01T09:00:00+08:00";
const OFFSET_ISO =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const UNKNOWN_UUID = "00000000-0000-4000-8000-000000000000";

let w: WorldWithRevoked;

const bearer = (token: string) => `Bearer ${token}`;

const send = async (run: Run, options: SendOptions): Promise<Call> => {
  const headers = new Headers();
  if (options.auth !== undefined) {
    headers.set("authorization", options.auth);
  }
  let body: string | undefined;
  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
    body =
      typeof options.body === "string"
        ? options.body
        : JSON.stringify(options.body);
  }
  const req = new Request(`http://localhost${options.path}`, {
    method: options.method,
    headers,
    body,
  });
  const res = await run(req);
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Not JSON: keep the text, the assertion will show it.
  }
  return { status: res.status, body: parsed };
};

const leaseCtx = (leaseId: string) => ({
  params: Promise.resolve({ leaseId }),
});
const paymentCtx = (paymentId: string) => ({
  params: Promise.resolve({ paymentId }),
});
const enc = encodeURIComponent;

const api = {
  getLease: (auth: string | undefined, leaseId: string) =>
    send((req) => getLeaseRoute(req, leaseCtx(leaseId)), {
      method: "GET",
      path: `/api/leases/${enc(leaseId)}`,
      auth,
    }),
  createLease: (auth: string | undefined, body: unknown) =>
    send((req) => postLeaseRoute(req, {}), {
      method: "POST",
      path: "/api/leases",
      auth,
      body,
    }),
  recordPayment: (auth: string | undefined, leaseId: string, body: unknown) =>
    send((req) => postPaymentRoute(req, leaseCtx(leaseId)), {
      method: "POST",
      path: `/api/leases/${enc(leaseId)}/payments`,
      auth,
      body,
    }),
  approve: (auth: string | undefined, paymentId: string) =>
    send((req) => approveRoute(req, paymentCtx(paymentId)), {
      method: "POST",
      path: `/api/payments/${enc(paymentId)}/approve`,
      auth,
    }),
  reject: (auth: string | undefined, paymentId: string, body?: unknown) =>
    send((req) => rejectRoute(req, paymentCtx(paymentId)), {
      method: "POST",
      path: `/api/payments/${enc(paymentId)}/reject`,
      auth,
      body,
    }),
  void: (auth: string | undefined, paymentId: string, body?: unknown) =>
    send((req) => voidRoute(req, paymentCtx(paymentId)), {
      method: "POST",
      path: `/api/payments/${enc(paymentId)}/void`,
      auth,
      body,
    }),
  createBill: (auth: string | undefined, leaseId: string) =>
    send((req) => postBillRoute(req, leaseCtx(leaseId)), {
      method: "POST",
      path: `/api/leases/${enc(leaseId)}/gateway-bills`,
      auth,
    }),
  report: (auth: string | undefined, query: string) =>
    send((req) => reportRoute(req, {}), {
      method: "GET",
      path: `/api/reports/collections${query}`,
      auth,
    }),
};

const jsonReplacer = (_key: string, value: unknown) =>
  typeof value === "bigint" ? value.toString() : value;

/** Everything a refused request could have changed, in both organizations. */
const snapshot = async (): Promise<string> => {
  const where = { org_id: { in: [w.orgA, w.orgB] } };
  const byId = { id: "asc" } as const;
  const state = await Promise.all([
    prisma.leases.findMany({ where, orderBy: byId }),
    prisma.invoices.findMany({ where, orderBy: byId }),
    prisma.payments.findMany({ where, orderBy: byId }),
    prisma.payment_allocations.findMany({ where, orderBy: byId }),
    prisma.gateway_bills.findMany({ where, orderBy: byId }),
    prisma.audit_log.count({ where }),
    prisma.tenants.findMany({ where, orderBy: byId }),
    prisma.memberships.findMany({ where, orderBy: byId }),
  ]);
  return JSON.stringify(state, jsonReplacer);
};

/** The call is refused with `status`, an { error } body, and no DB change. */
const expectRefused = async (
  call: () => Promise<Call>,
  status: number,
): Promise<void> => {
  const before = await snapshot();
  const res = await call();
  expect(res, JSON.stringify(res.body)).toMatchObject({ status });
  expect(res.body).toEqual({ error: expect.any(String) });
  expect(await snapshot()).toBe(before);
};

const tokens = () => ({
  managerA: bearer(w.users.managerA.token),
  staffA: bearer(w.users.staffA.token),
  tenantA1: bearer(w.users.tenantA1.token),
  tenantA2: bearer(w.users.tenantA2.token),
  managerB: bearer(w.users.managerB.token),
  tenantB1: bearer(w.users.tenantB1.token),
});

const cash = (amountSen: number, receivedAt = RECENT) => ({
  amountSen,
  method: "cash",
  receivedAt,
});

const freshPending = async (amountSen = 1000): Promise<string> =>
  (
    await recordPayment(w.actors.staffA, w.leases.l1, {
      amountSen,
      method: "cash",
      receivedAt: RECENT,
    })
  ).id;

const freshApproved = async (amountSen = 1000): Promise<string> =>
  (
    await recordPayment(w.actors.managerA, w.leases.l1, {
      amountSen,
      method: "cash",
      receivedAt: RECENT,
    })
  ).id;

const validLeaseBody = (unitId: string, tenantId: string) => ({
  unitId,
  tenantId,
  startDate: "2031-01-01",
  endDate: "2031-03-31",
  monthlyRentSen: 100000,
  depositSen: 0,
});

const leaseCount = (unitId: string) =>
  prisma.leases.count({ where: { unit_id: unitId } });

// A real token with its payload rewritten to claim to be manager A; the
// signature no longer matches, so Auth must reject it.
const tamperedToken = (): string => {
  const [header, , signature] = w.users.tenantA1.token.split(".");
  const payload = Buffer.from(
    JSON.stringify({
      sub: w.users.managerA.id,
      role: "authenticated",
      aud: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 3600,
      user_metadata: { role: "manager" },
    }),
  ).toString("base64url");
  return `${header}.${payload}.${signature}`;
};

const unsignedToken = (): string => {
  const part = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "none", typ: "JWT" })}.${part({
    sub: w.users.managerA.id,
    role: "authenticated",
    aud: "authenticated",
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}.`;
};

beforeAll(async () => {
  w = await buildWorld({ revokedUser: true });
}, 120000);

describe("401: no valid login, on every endpoint", () => {
  const variants: AuthVariant[] = [
    { name: "no Authorization header", header: () => undefined },
    { name: "garbage bearer token", header: () => "Bearer not-a-jwt" },
    { name: "empty bearer", header: () => "Bearer " },
    { name: "wrong scheme", header: () => `Basic ${w.users.managerA.token}` },
    { name: "token without scheme", header: () => w.users.managerA.token },
    {
      name: "two tokens",
      header: () => `Bearer ${w.users.managerA.token} extra`,
    },
    { name: "tampered payload", header: () => bearer(tamperedToken()) },
    { name: "alg none", header: () => bearer(unsignedToken()) },
    {
      name: "signed-out session",
      header: () => bearer(w.revokedToken ?? "missing"),
    },
    {
      name: "user_metadata says manager, no membership",
      header: () => bearer(w.users.metaManager.token),
    },
  ];

  const endpoints: Endpoint[] = [
    { name: "GET lease", call: (a) => api.getLease(a, w.leases.l1) },
    {
      name: "POST leases",
      call: (a) =>
        api.createLease(a, validLeaseBody(w.units.aFuture, w.tenants.a1)),
    },
    {
      name: "POST payments",
      call: (a) => api.recordPayment(a, w.leases.l1, cash(1000)),
    },
    { name: "approve", call: (a) => api.approve(a, w.payments.l1Pending) },
    {
      name: "reject",
      call: (a) => api.reject(a, w.payments.l1Pending, { reason: "not legit" }),
    },
    {
      name: "void",
      call: (a) => api.void(a, w.payments.l1Approved, { reason: "not legit" }),
    },
    { name: "gateway bill", call: (a) => api.createBill(a, w.leases.l1) },
    { name: "report", call: (a) => api.report(a, "?from=2026-01&to=2026-03") },
  ];

  for (const variant of variants) {
    it(`${variant.name} -> 401 everywhere, nothing changes`, async () => {
      for (const endpoint of endpoints) {
        const before = await snapshot();
        const res = await endpoint.call(variant.header());
        expect(
          { endpoint: endpoint.name, status: res.status, body: res.body },
          endpoint.name,
        ).toEqual({
          endpoint: endpoint.name,
          status: 401,
          body: { error: expect.any(String) },
        });
        expect(await snapshot()).toBe(before);
      }
    });
  }

  it("401 comes before 404: unauthenticated request for a non-existent lease", async () => {
    await expectRefused(() => api.getLease(undefined, UNKNOWN_UUID), 401);
    await expectRefused(() => api.getLease(undefined, "not-a-uuid"), 401);
  });

  it("a user token does not authenticate the gateway webhook", async () => {
    const before = await snapshot();
    const res = await send((req) => webhookRoute(req, {}), {
      method: "POST",
      path: "/api/webhooks/gateway",
      auth: bearer(w.users.managerA.token),
      body: `id=${w.bills.l1}&paid=true&paid_amount=1&transaction_status=completed`,
    });
    expect(res.status).toBe(401);
    expect(await snapshot()).toBe(before);
  });
});

describe("GET /api/leases/:leaseId", () => {
  it("manager A gets the brief's shape: invoices in allocation order, instants with offset", async () => {
    const res = await api.getLease(tokens().managerA, w.leases.l1);
    expect(res.status).toBe(200);
    const body = res.body as {
      lease: Record<string, unknown>;
      invoices: Record<string, unknown>[];
      payments: Record<string, unknown>[];
    };
    expect(Object.keys(body).sort()).toEqual(["invoices", "lease", "payments"]);
    expect(body.lease).toEqual({
      id: w.leases.l1,
      unitId: w.units.a1,
      tenantId: w.tenants.a1,
      ...L1_TERMS,
    });

    const schedule = generateSchedule(L1_TERMS);
    expect(body.invoices).toHaveLength(schedule.length);
    // Deposit and period 0 share a due date: deposit first, then by index.
    expect(
      body.invoices.map((i) => [i.kind, i.periodIndex, i.dueDate, i.amountSen]),
    ).toEqual(
      schedule.map((s) => [s.kind, s.periodIndex, s.dueDate, s.amountSen]),
    );
    for (const invoice of body.invoices) {
      expect(Object.keys(invoice).sort()).toEqual(
        [
          "amountSen",
          "dueDate",
          "id",
          "kind",
          "paidSen",
          "periodEnd",
          "periodIndex",
          "periodStart",
          "status",
        ].sort(),
      );
      expect(typeof invoice.amountSen).toBe("number");
      expect(typeof invoice.paidSen).toBe("number");
    }
    // The approved 300000 went to the deposit (first in allocation order).
    expect(body.invoices[0]).toMatchObject({
      kind: "deposit",
      paidSen: L1_APPROVED_SEN,
      status: "paid",
    });
    expect(body.invoices[1]).toMatchObject({ paidSen: 0, status: "overdue" });

    const dbPayments = await prisma.payments.findMany({
      where: { lease_id: w.leases.l1 },
      select: { id: true },
    });
    expect(body.payments.map((p) => p.id).sort()).toEqual(
      dbPayments.map((p) => p.id).sort(),
    );
    for (const payment of body.payments) {
      expect(Object.keys(payment).sort()).toEqual(
        [
          "amountSen",
          "id",
          "method",
          "receivedAt",
          "status",
          "unappliedSen",
        ].sort(),
      );
      expect(payment.receivedAt).toMatch(OFFSET_ISO);
    }
    const approved = body.payments.find((p) => p.id === w.payments.l1Approved);
    expect(approved).toMatchObject({
      amountSen: L1_APPROVED_SEN,
      unappliedSen: 0,
      method: "cash",
      status: "approved",
    });
    // Same instant as recorded (00:30 MYT = 16:30Z the day before).
    expect(Date.parse(String(approved?.receivedAt))).toBe(
      Date.parse(L1_APPROVED_RECEIVED_AT),
    );
    expect(
      body.payments.find((p) => p.id === w.payments.l1Pending),
    ).toMatchObject({
      amountSen: L1_PENDING_SEN,
      status: "pending_verification",
    });
  });

  it("staff A and the lease's own tenant see the same lease", async () => {
    const t = tokens();
    const manager = await api.getLease(t.managerA, w.leases.l1);
    const staff = await api.getLease(t.staffA, w.leases.l1);
    const tenant = await api.getLease(t.tenantA1, w.leases.l1);
    expect(staff).toEqual(manager);
    expect(tenant).toEqual(manager);
  });

  it("a tenant with two leases sees both, each with its own data", async () => {
    const res = await api.getLease(tokens().tenantA1, w.leases.future);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      lease: { id: w.leases.future, tenantId: w.tenants.a1 },
      payments: [],
    });
  });

  it("another tenant of the same org, and anyone in org B -> 404", async () => {
    const t = tokens();
    await expectRefused(() => api.getLease(t.tenantA2, w.leases.l1), 404);
    await expectRefused(() => api.getLease(t.managerB, w.leases.l1), 404);
    await expectRefused(() => api.getLease(t.tenantB1, w.leases.l1), 404);
    await expectRefused(() => api.getLease(t.managerA, w.leases.lb), 404);
    await expectRefused(() => api.getLease(t.staffA, w.leases.lb), 404);
    await expectRefused(() => api.getLease(t.tenantA1, w.leases.l2), 404);
  });

  it("an id that is not a UUID, or does not exist -> 404 (not 400/500)", async () => {
    const t = tokens();
    for (const id of [
      "not-a-uuid",
      "' or 1=1 --",
      UNKNOWN_UUID,
      w.payments.l1Approved,
      w.leases.l1.toUpperCase().replace(/-/g, ""),
    ]) {
      await expectRefused(() => api.getLease(t.managerA, id), 404);
    }
  });
});

describe("POST /api/leases", () => {
  it("manager A -> 201 { id }, stored in org A with exactly the schedule's invoices", async () => {
    const unitId = await createUnit(w.orgA, `new-${w.tag}`);
    const body = { ...validLeaseBody(unitId, w.tenants.a2), orgId: w.orgB };
    const res = await api.createLease(tokens().managerA, body);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: expect.any(String) });
    const id = (res.body as { id: string }).id;
    const lease = await prisma.leases.findUniqueOrThrow({ where: { id } });
    // orgId in the body is ignored: the org is the manager's.
    expect(lease.org_id).toBe(w.orgA);
    expect(lease.created_by).toBe(w.users.managerA.id);
    expect(await prisma.invoices.count({ where: { lease_id: id } })).toBe(
      generateSchedule(body).length,
    );
    expect(
      await prisma.audit_log.count({
        where: { entity_id: id, action: "lease.created", org_id: w.orgA },
      }),
    ).toBe(1);
  });

  it("staff and tenants -> 403 (checked before the body: invalid body is still 403)", async () => {
    const t = tokens();
    const body = validLeaseBody(w.units.aFuture, w.tenants.a1);
    await expectRefused(() => api.createLease(t.staffA, body), 403);
    await expectRefused(() => api.createLease(t.tenantA1, body), 403);
    await expectRefused(() => api.createLease(t.tenantB1, body), 403);
    await expectRefused(() => api.createLease(t.staffA, {}), 403);
    await expectRefused(() => api.createLease(t.tenantA1, "{oops"), 403);
  });

  it("another org's unit or tenant in the body -> 404, nothing created", async () => {
    const t = tokens();
    const unitB = await createUnit(w.orgB, `xb-${w.tag}`);
    const unitA = await createUnit(w.orgA, `xa-${w.tag}`);
    await expectRefused(
      () => api.createLease(t.managerA, validLeaseBody(unitB, w.tenants.a1)),
      404,
    );
    await expectRefused(
      () => api.createLease(t.managerA, validLeaseBody(unitA, w.tenants.b1)),
      404,
    );
    await expectRefused(
      () => api.createLease(t.managerB, validLeaseBody(unitA, w.tenants.a1)),
      404,
    );
    await expectRefused(
      () => api.createLease(t.managerB, validLeaseBody(unitB, w.tenants.a1)),
      404,
    );
    await expectRefused(
      () =>
        api.createLease(t.managerA, validLeaseBody(UNKNOWN_UUID, w.tenants.a1)),
      404,
    );
    expect(await leaseCount(unitA)).toBe(0);
    expect(await leaseCount(unitB)).toBe(0);
  });

  it("overlap with an existing lease on the unit -> 409 (both ends inclusive)", async () => {
    const t = tokens();
    const base = validLeaseBody(w.units.a1, w.tenants.a2);
    // L1 runs 2026-01-31 .. 2026-12-31.
    await expectRefused(
      () =>
        api.createLease(t.managerA, {
          ...base,
          startDate: "2026-12-31",
          endDate: "2027-02-28",
        }),
      409,
    );
    await expectRefused(
      () =>
        api.createLease(t.managerA, {
          ...base,
          startDate: "2025-06-01",
          endDate: "2026-01-31",
        }),
      409,
    );
    const adjacent = await api.createLease(t.managerA, {
      ...base,
      startDate: "2027-01-01",
      endDate: "2027-01-31",
    });
    expect(adjacent.status).toBe(201);
  });

  it("invalid input -> 400, nothing created", async () => {
    const t = tokens();
    const unitId = await createUnit(w.orgA, `bad-${w.tag}`);
    const base = validLeaseBody(unitId, w.tenants.a1);
    const invalid: unknown[] = [
      "{not json",
      {},
      { ...base, monthlyRentSen: undefined },
      { ...base, depositSen: undefined },
      { ...base, monthlyRentSen: 1000.5 },
      { ...base, monthlyRentSen: "100000" },
      { ...base, monthlyRentSen: 0 },
      { ...base, monthlyRentSen: -1 },
      { ...base, depositSen: -1 },
      { ...base, depositSen: 0.1 },
      { ...base, startDate: "2031-02-30" },
      { ...base, startDate: "2031-1-01" },
      { ...base, startDate: "01/01/2031" },
      { ...base, endDate: "2030-12-31" },
      { ...base, startDate: null },
    ];
    for (const body of invalid) {
      await expectRefused(() => api.createLease(t.managerA, body), 400);
    }
    expect(await leaseCount(unitId)).toBe(0);
  });

  it("a malformed unit or tenant id is refused (400 or 404), nothing created", async () => {
    const t = tokens();
    for (const body of [
      validLeaseBody("not-a-uuid", w.tenants.a1),
      validLeaseBody(w.units.aFuture, "x"),
    ]) {
      const before = await snapshot();
      const res = await api.createLease(t.managerA, body);
      expect([400, 404]).toContain(res.status);
      expect(await snapshot()).toBe(before);
    }
  });
});

describe("POST /api/leases/:leaseId/payments", () => {
  it("staff -> 201 pending_verification; manager -> 201 approved", async () => {
    const t = tokens();
    const staff = await api.recordPayment(t.staffA, w.leases.l1, cash(1000));
    expect(staff).toEqual({
      status: 201,
      body: { id: expect.any(String), status: "pending_verification" },
    });
    const manager = await api.recordPayment(
      t.managerA,
      w.leases.l1,
      cash(1000),
    );
    expect(manager).toEqual({
      status: 201,
      body: { id: expect.any(String), status: "approved" },
    });
    const staffRow = await prisma.payments.findUniqueOrThrow({
      where: { id: (staff.body as { id: string }).id },
    });
    expect(staffRow).toMatchObject({
      org_id: w.orgA,
      lease_id: w.leases.l1,
      recorded_by: w.users.staffA.id,
      status: "pending_verification",
    });
  });

  it("ids and status in the body are ignored: the path's lease and the role decide", async () => {
    const res = await api.recordPayment(tokens().staffA, w.leases.l1, {
      ...cash(1000),
      status: "approved",
      orgId: w.orgB,
      org_id: w.orgB,
      leaseId: w.leases.lb,
      recordedBy: w.users.managerA.id,
    });
    expect(res.status).toBe(201);
    const row = await prisma.payments.findUniqueOrThrow({
      where: { id: (res.body as { id: string }).id },
    });
    expect(row).toMatchObject({
      org_id: w.orgA,
      lease_id: w.leases.l1,
      status: "pending_verification",
      recorded_by: w.users.staffA.id,
    });
  });

  it("the lease's tenant can see it but cannot record -> 403, even with a bad body", async () => {
    const t = tokens();
    await expectRefused(
      () => api.recordPayment(t.tenantA1, w.leases.l1, cash(1000)),
      403,
    );
    await expectRefused(
      () => api.recordPayment(t.tenantA1, w.leases.l1, { amountSen: "x" }),
      403,
    );
  });

  it("not visible -> 404 (other tenant, other org, unknown or bad id), before input checks", async () => {
    const t = tokens();
    await expectRefused(
      () => api.recordPayment(t.tenantA2, w.leases.l1, cash(1000)),
      404,
    );
    await expectRefused(
      () => api.recordPayment(t.managerB, w.leases.l1, cash(1000)),
      404,
    );
    await expectRefused(
      () => api.recordPayment(t.managerB, w.leases.l1, { bad: true }),
      404,
    );
    await expectRefused(
      () => api.recordPayment(t.tenantB1, w.leases.l1, cash(1000)),
      404,
    );
    await expectRefused(
      () => api.recordPayment(t.staffA, w.leases.lb, cash(1000)),
      404,
    );
    await expectRefused(
      () => api.recordPayment(t.managerA, "not-a-uuid", cash(1000)),
      404,
    );
    await expectRefused(
      () => api.recordPayment(t.managerA, UNKNOWN_UUID, cash(1000)),
      404,
    );
  });

  it("over the cap -> 422", async () => {
    const t = tokens();
    const [invoiced, allocated, pending] = await Promise.all([
      prisma.invoices.aggregate({
        where: { lease_id: w.leases.l1 },
        _sum: { amount_sen: true },
      }),
      prisma.payment_allocations.aggregate({
        where: { invoices: { lease_id: w.leases.l1 } },
        _sum: { amount_sen: true },
      }),
      prisma.payments.aggregate({
        where: { lease_id: w.leases.l1, status: "pending_verification" },
        _sum: { amount_sen: true },
      }),
    ]);
    const cap =
      Number(invoiced._sum.amount_sen ?? 0n) -
      Number(allocated._sum.amount_sen ?? 0n) -
      Number(pending._sum.amount_sen ?? 0n);
    await expectRefused(
      () => api.recordPayment(t.staffA, w.leases.l1, cash(cap + 1)),
      422,
    );
    await expectRefused(
      () => api.recordPayment(t.managerA, w.leases.l1, cash(cap + 1)),
      422,
    );
  });

  it("invalid input -> 400", async () => {
    const t = tokens();
    const ownSlip = await uploadSlipAsAdmin(`${w.orgA}/${w.leases.l1}`);
    const otherOrgSlip = await uploadSlipAsAdmin(`${w.orgB}/${w.leases.lb}`);
    const invalid: unknown[] = [
      "{not json",
      {},
      { ...cash(1000), amountSen: 0 },
      { ...cash(1000), amountSen: -100 },
      { ...cash(1000), amountSen: 10.5 },
      { ...cash(1000), amountSen: "1000" },
      { ...cash(1000), method: "online" },
      { ...cash(1000), method: "cheque" },
      // receivedAt must carry an offset (ambiguous otherwise), and be real.
      cash(1000, "2026-10-01T09:00:00"),
      cash(1000, "2026-10-01"),
      cash(1000, "yesterday"),
      cash(1000, "2099-01-01T00:00:00+08:00"),
      { amountSen: 1000, method: "cash" },
      // A cash payment has no slip.
      { ...cash(1000), slipPath: ownSlip },
      // A bank transfer needs a slip in its own org's folder that exists.
      { ...cash(1000), method: "bank_transfer" },
      { ...cash(1000), method: "bank_transfer", slipPath: "" },
      { ...cash(1000), method: "bank_transfer", slipPath: otherOrgSlip },
      {
        ...cash(1000),
        method: "bank_transfer",
        slipPath: `${w.orgA}/missing-${w.tag}.pdf`,
      },
      {
        ...cash(1000),
        method: "bank_transfer",
        slipPath: `${w.orgA}/../${otherOrgSlip}`,
      },
      {
        ...cash(1000),
        method: "bank_transfer",
        slipPath: `/${ownSlip}`,
      },
    ];
    for (const body of invalid) {
      await expectRefused(
        () => api.recordPayment(t.staffA, w.leases.l1, body),
        400,
      );
    }
  });

  it("bank transfer with a slip in the org's folder -> 201; the same slip twice -> 400", async () => {
    const t = tokens();
    const slip = await uploadSlipAsAdmin(`${w.orgA}/${w.leases.l1}`);
    const body = { ...cash(1000), method: "bank_transfer", slipPath: slip };
    const first = await api.recordPayment(t.staffA, w.leases.l1, body);
    expect(first).toEqual({
      status: 201,
      body: { id: expect.any(String), status: "pending_verification" },
    });
    await expectRefused(
      () => api.recordPayment(t.staffA, w.leases.l1, body),
      400,
    );
  });
});

describe("approve / reject / void", () => {
  it("staff -> 403, tenant of the lease -> 403, other tenant / org B -> 404", async () => {
    const t = tokens();
    const pending = await freshPending();
    const approved = await freshApproved();
    const reason = { reason: "Duplicate entry" };
    for (const auth of [t.staffA, t.tenantA1]) {
      await expectRefused(() => api.approve(auth, pending), 403);
      await expectRefused(() => api.reject(auth, pending, reason), 403);
      await expectRefused(() => api.reject(auth, pending, {}), 403);
      await expectRefused(() => api.void(auth, approved, reason), 403);
    }
    for (const auth of [t.tenantA2, t.managerB, t.tenantB1]) {
      await expectRefused(() => api.approve(auth, pending), 404);
      await expectRefused(() => api.reject(auth, pending, reason), 404);
      await expectRefused(() => api.reject(auth, pending, {}), 404);
      await expectRefused(() => api.void(auth, approved, reason), 404);
    }
    // Manager A on org B's payment, and ids that are not payments.
    for (const id of [
      w.payments.lbApproved,
      "not-a-uuid",
      UNKNOWN_UUID,
      w.leases.l1,
    ]) {
      await expectRefused(() => api.approve(t.managerA, id), 404);
      await expectRefused(() => api.reject(t.managerA, id, reason), 404);
      await expectRefused(() => api.void(t.managerA, id, reason), 404);
    }
  });

  it("approve: manager -> 200 { status }, a second time -> 409", async () => {
    const t = tokens();
    const pending = await freshPending(1234);
    expect(await api.approve(t.managerA, pending)).toEqual({
      status: 200,
      body: { status: "approved" },
    });
    const row = await prisma.payments.findUniqueOrThrow({
      where: { id: pending },
    });
    expect(row).toMatchObject({
      status: "approved",
      decided_by: w.users.managerA.id,
    });
    await expectRefused(() => api.approve(t.managerA, pending), 409);
    await expectRefused(
      () => api.approve(t.managerA, w.payments.l1Approved),
      409,
    );
  });

  it("reject: reason required (>= 5 chars after trimming) -> 400; then 200; then 409", async () => {
    const t = tokens();
    const pending = await freshPending();
    for (const body of [
      undefined,
      "{oops",
      {},
      { reason: "" },
      { reason: "abcd" },
      { reason: "   abcd   " },
      { reason: 12345 },
    ]) {
      await expectRefused(() => api.reject(t.managerA, pending, body), 400);
    }
    expect(
      await api.reject(t.managerA, pending, { reason: "Slip is unreadable" }),
    ).toEqual({ status: 200, body: { status: "rejected" } });
    await expectRefused(
      () => api.reject(t.managerA, pending, { reason: "again please" }),
      409,
    );
    await expectRefused(() => api.approve(t.managerA, pending), 409);
    await expectRefused(
      () => api.void(t.managerA, pending, { reason: "void rejected" }),
      409,
    );
  });

  it("void: a pending payment -> 409; reason required -> 400; approved -> 200, allocations removed", async () => {
    const t = tokens();
    await expectRefused(
      () =>
        api.void(t.managerA, w.payments.l1Pending, { reason: "not approved" }),
      409,
    );
    const approved = await freshApproved(2000);
    expect(
      await prisma.payment_allocations.count({
        where: { payment_id: approved },
      }),
    ).toBeGreaterThan(0);
    for (const body of [undefined, {}, { reason: "no" }]) {
      await expectRefused(() => api.void(t.managerA, approved, body), 400);
    }
    expect(
      await api.void(t.managerA, approved, { reason: "Entered twice" }),
    ).toEqual({ status: 200, body: { status: "voided" } });
    expect(
      await prisma.payment_allocations.count({
        where: { payment_id: approved },
      }),
    ).toBe(0);
    await expectRefused(
      () => api.void(t.managerA, approved, { reason: "Entered twice" }),
      409,
    );
  });
});

describe("POST /api/leases/:leaseId/gateway-bills", () => {
  it("the lease's tenant -> 201 { billId, amountSen } for what is due today (MYT)", async () => {
    const t = tokens();
    const detail = await api.getLease(t.managerA, w.leases.l1);
    const today = todayInMalaysia();
    const invoices = (
      detail.body as {
        invoices: { dueDate: string; amountSen: number; paidSen: number }[];
      }
    ).invoices;
    const due = invoices
      .filter((i) => i.dueDate <= today)
      .reduce((sum, i) => sum + Math.max(i.amountSen - i.paidSen, 0), 0);
    const res = await api.createBill(t.tenantA1, w.leases.l1);
    expect(res).toEqual({
      status: 201,
      body: {
        billId: expect.stringMatching(/^bill_[0-9a-f]{32}$/),
        amountSen: due,
      },
    });
    const bill = await prisma.gateway_bills.findUniqueOrThrow({
      where: { id: (res.body as { billId: string }).billId },
    });
    expect(bill).toMatchObject({
      org_id: w.orgA,
      lease_id: w.leases.l1,
      status: "pending",
    });
  });

  it("nothing due yet -> 422", async () => {
    await expectRefused(
      () => api.createBill(tokens().tenantA1, w.leases.future),
      422,
    );
  });

  it("staff / manager of the org -> 403; other tenant, org B, bad ids -> 404", async () => {
    const t = tokens();
    await expectRefused(() => api.createBill(t.staffA, w.leases.l1), 403);
    await expectRefused(() => api.createBill(t.managerA, w.leases.l1), 403);
    await expectRefused(() => api.createBill(t.tenantA2, w.leases.l1), 404);
    await expectRefused(() => api.createBill(t.managerB, w.leases.l1), 404);
    await expectRefused(() => api.createBill(t.tenantB1, w.leases.l1), 404);
    await expectRefused(() => api.createBill(t.tenantA1, w.leases.lb), 404);
    await expectRefused(() => api.createBill(t.tenantA1, "not-a-uuid"), 404);
    await expectRefused(() => api.createBill(t.tenantA1, UNKNOWN_UUID), 404);
  });
});

describe("GET /api/reports/collections", () => {
  it("staff and manager -> 200, one entry per month in order, own org only, MYT months", async () => {
    const t = tokens();
    const expected = [
      { month: "2026-01", collectedSen: 0 }, // L1's pending payment does not count
      { month: "2026-02", collectedSen: 0 },
      // 2026-03-01 00:30 MYT is 2026-02-28 16:30 UTC: March, not February.
      { month: "2026-03", collectedSen: L1_APPROVED_SEN },
      { month: "2026-04", collectedSen: 0 },
    ];
    const query = "?from=2026-01&to=2026-04";
    expect(await api.report(t.managerA, query)).toEqual({
      status: 200,
      body: expected,
    });
    expect(await api.report(t.staffA, query)).toEqual({
      status: 200,
      body: expected,
    });
    expect(await api.report(t.managerB, "?from=2026-03&to=2026-03")).toEqual({
      status: 200,
      body: [{ month: "2026-03", collectedSen: LB_APPROVED_SEN }],
    });
    const yearEnd = await api.report(t.managerA, "?from=2025-12&to=2026-01");
    expect(yearEnd).toEqual({
      status: 200,
      body: [
        { month: "2025-12", collectedSen: 0 },
        { month: "2026-01", collectedSen: 0 },
      ],
    });
  });

  it("tenants -> 403 (before input validation)", async () => {
    const t = tokens();
    await expectRefused(
      () => api.report(t.tenantA1, "?from=2026-01&to=2026-03"),
      403,
    );
    await expectRefused(() => api.report(t.tenantB1, "?from=bad&to=x"), 403);
  });

  it("invalid range -> 400", async () => {
    const t = tokens();
    for (const query of [
      "?from=2026-04&to=2026-01",
      "?from=2026-13&to=2026-12",
      "?from=2026-00&to=2026-01",
      "?from=2026-1&to=2026-02",
      "?from=202601&to=202602",
      "?from=2026-01-01&to=2026-02-01",
      "?from=2026-01",
      "?to=2026-01",
      "",
      "?from=&to=",
      "?from=abcd-ef&to=2026-01",
    ]) {
      await expectRefused(() => api.report(t.managerA, query), 400);
    }
  });
});

describe("GET /slips/:paymentId (signed slip URL)", () => {
  const getSlip = (auth: string | undefined, paymentId: string) =>
    send((req) => slipRoute(req, paymentCtx(paymentId)), {
      method: "GET",
      path: `/slips/${enc(paymentId)}`,
      auth,
    });

  let slipPayment = "";

  beforeAll(async () => {
    const slipPath = await uploadSlipAsAdmin(`${w.orgA}/${w.leases.l1}`);
    slipPayment = (
      await recordPayment(w.actors.staffA, w.leases.l1, {
        amountSen: 1000,
        method: "bank_transfer",
        receivedAt: RECENT,
        slipPath,
      })
    ).id;
  });

  it("staff and manager of the org -> 302 to a short-lived signed URL", async () => {
    const t = tokens();
    for (const auth of [t.staffA, t.managerA]) {
      const res = await slipRoute(
        new Request(`http://localhost/slips/${slipPayment}`, {
          headers: { authorization: auth },
        }),
        paymentCtx(slipPayment),
      );
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toMatch(
        /\/storage\/v1\/object\/sign\/payment-slips\/.+\?token=/,
      );
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("no login -> 401; tenant of the lease -> 403; other tenant / org B -> 404", async () => {
    const t = tokens();
    await expectRefused(() => getSlip(undefined, slipPayment), 401);
    await expectRefused(() => getSlip("Bearer nope", slipPayment), 401);
    await expectRefused(() => getSlip(t.tenantA1, slipPayment), 403);
    await expectRefused(() => getSlip(t.tenantA2, slipPayment), 404);
    await expectRefused(() => getSlip(t.managerB, slipPayment), 404);
    await expectRefused(() => getSlip(t.tenantB1, slipPayment), 404);
    await expectRefused(() => getSlip(t.managerA, "not-a-uuid"), 404);
    // A cash payment has no slip.
    await expectRefused(() => getSlip(t.managerA, w.payments.l1Approved), 404);
  });
});

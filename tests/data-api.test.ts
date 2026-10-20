import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/server/prisma";
import {
  adminClient,
  anonClient,
  buildWorld,
  pdfBytes,
  uploadSlipAsAdmin,
  type World,
} from "./helpers/auth-users";

// The Supabase Data API (PostgREST) and Storage, called the way the graders
// do: supabase-js with the publishable key, as anon and with each user's
// access token (docs/TASK.md section 6, "Data API" and "Storage"). Expected
// rows are computed with Prisma (the owner, no RLS) from the brief's table,
// so every assertion is an exact set comparison.

type Table =
  | "organizations"
  | "memberships"
  | "units"
  | "tenants"
  | "leases"
  | "invoices"
  | "payments"
  | "payment_allocations"
  | "gateway_bills"
  | "audit_log";

type Visible = Record<Table, string[]>;

type IdRow = { id: string };

type WriteCase = {
  table: Table;
  insert: () => Record<string, unknown>;
  update: () => Record<string, unknown>;
  targetId: () => string;
};

type Actor = { name: string; client: () => SupabaseClient };

const TABLES: Table[] = [
  "organizations",
  "memberships",
  "units",
  "tenants",
  "leases",
  "invoices",
  "payments",
  "payment_allocations",
  "gateway_bills",
  "audit_log",
];

const BUCKET = "payment-slips";

let w: World;

const ids = (rows: IdRow[]) => rows.map((row) => row.id).sort();

/** Rows the brief lets a member (staff or manager) of `orgId` read. */
const orgRows = async (orgId: string, manager: boolean): Promise<Visible> => {
  const where = { org_id: orgId };
  const select = { id: true } as const;
  return {
    organizations: [orgId],
    memberships: ids(await prisma.memberships.findMany({ where, select })),
    units: ids(await prisma.units.findMany({ where, select })),
    tenants: ids(await prisma.tenants.findMany({ where, select })),
    leases: ids(await prisma.leases.findMany({ where, select })),
    invoices: ids(await prisma.invoices.findMany({ where, select })),
    payments: ids(await prisma.payments.findMany({ where, select })),
    payment_allocations: ids(
      await prisma.payment_allocations.findMany({ where, select }),
    ),
    gateway_bills: ids(await prisma.gateway_bills.findMany({ where, select })),
    audit_log: manager
      ? ids(await prisma.audit_log.findMany({ where, select }))
      : [],
  };
};

/** Rows the brief lets a tenant read: own row, own leases and their children. */
const tenantRows = async (
  tenantId: string,
  orgId: string,
): Promise<Visible> => {
  const leases = await prisma.leases.findMany({
    where: { tenant_id: tenantId },
    select: { id: true, unit_id: true },
  });
  const leaseIds = leases.map((lease) => lease.id);
  const byLease = { lease_id: { in: leaseIds } };
  const select = { id: true } as const;
  return {
    organizations: [orgId],
    memberships: [],
    units: [...new Set(leases.map((lease) => lease.unit_id))].sort(),
    tenants: [tenantId],
    leases: [...leaseIds].sort(),
    invoices: ids(await prisma.invoices.findMany({ where: byLease, select })),
    payments: ids(await prisma.payments.findMany({ where: byLease, select })),
    payment_allocations: ids(
      await prisma.payment_allocations.findMany({
        where: { payments: byLease },
        select,
      }),
    ),
    gateway_bills: ids(
      await prisma.gateway_bills.findMany({ where: byLease, select }),
    ),
    audit_log: [],
  };
};

const nothing = (): Visible => ({
  organizations: [],
  memberships: [],
  units: [],
  tenants: [],
  leases: [],
  invoices: [],
  payments: [],
  payment_allocations: [],
  gateway_bills: [],
  audit_log: [],
});

/** What the Data API actually returns to this client, table by table. */
const visibleThrough = async (client: SupabaseClient): Promise<Visible> => {
  const result = nothing();
  for (const table of TABLES) {
    const { data, error } = await client.from(table).select("id");
    expect(error, `${table}: ${error?.message}`).toBeNull();
    result[table] = ids((data ?? []) as IdRow[]);
  }
  return result;
};

const jsonReplacer = (_key: string, value: unknown) =>
  typeof value === "bigint" ? value.toString() : value;

/** Every row of both organizations, for "nothing changed" checks. */
const snapshot = async (): Promise<string> => {
  const where = { org_id: { in: [w.orgA, w.orgB] } };
  const byId = { id: "asc" } as const;
  const state = await Promise.all([
    prisma.organizations.findMany({
      where: { id: { in: [w.orgA, w.orgB] } },
      orderBy: byId,
    }),
    prisma.memberships.findMany({ where, orderBy: byId }),
    prisma.units.findMany({ where, orderBy: byId }),
    prisma.tenants.findMany({ where, orderBy: byId }),
    prisma.leases.findMany({ where, orderBy: byId }),
    prisma.invoices.findMany({ where, orderBy: byId }),
    prisma.payments.findMany({ where, orderBy: byId }),
    prisma.payment_allocations.findMany({ where, orderBy: byId }),
    prisma.gateway_bills.findMany({ where, orderBy: byId }),
    prisma.audit_log.findMany({ where, orderBy: byId }),
  ]);
  return JSON.stringify(state, jsonReplacer);
};

const firstId = async (
  rows: Promise<IdRow | null>,
  label: string,
): Promise<string> => {
  const row = await rows;
  if (!row) {
    throw new Error(`Fixture row missing: ${label}`);
  }
  return row.id;
};

beforeAll(async () => {
  w = await buildWorld();
}, 120000);

describe("Data API reads (RLS)", () => {
  it("anon reads nothing from any table", async () => {
    const anon = anonClient();
    for (const table of TABLES) {
      const { data, error } = await anon.from(table).select("*");
      expect(
        error !== null || (data ?? []).length === 0,
        `${table} leaked to anon`,
      ).toBe(true);
    }
  });

  it("tenant A1 sees exactly own row, own leases and their children; no memberships or audit_log", async () => {
    const actual = await visibleThrough(w.users.tenantA1.client);
    const expected = await tenantRows(w.tenants.a1, w.orgA);
    expect(actual).toEqual(expected);
    expect(actual.leases).toEqual([w.leases.future, w.leases.l1].sort());
    expect(actual.payments.length).toBeGreaterThan(0);
    expect(actual.payment_allocations.length).toBeGreaterThan(0);
    expect(actual.gateway_bills).toEqual([w.bills.l1]);
  });

  it("tenant A2 and tenant B1 see only their own lease", async () => {
    expect(await visibleThrough(w.users.tenantA2.client)).toEqual(
      await tenantRows(w.tenants.a2, w.orgA),
    );
    expect(await visibleThrough(w.users.tenantB1.client)).toEqual(
      await tenantRows(w.tenants.b1, w.orgB),
    );
  });

  it("filtering for someone else's row returns nothing (not an error that leaks existence)", async () => {
    const client = w.users.tenantA1.client;
    for (const [table, id] of [
      ["leases", w.leases.l2],
      ["leases", w.leases.lb],
      ["tenants", w.tenants.a2],
      ["payments", w.payments.lbApproved],
      ["gateway_bills", w.bills.lb],
      ["organizations", w.orgB],
    ] as const) {
      const { data, error } = await client.from(table).select("*").eq("id", id);
      expect(error).toBeNull();
      expect(data, `${table} ${id}`).toEqual([]);
    }
    // Embedding does not bypass RLS either.
    const embedded = await client
      .from("units")
      .select("id, leases(id, tenants(id, full_name))");
    expect(embedded.error).toBeNull();
    const leaseIds = (embedded.data ?? []).flatMap((unit) =>
      (unit.leases as IdRow[]).map((lease) => lease.id),
    );
    expect(leaseIds.sort()).toEqual([w.leases.future, w.leases.l1].sort());
  });

  it("staff A sees org A's rows only, and no audit_log", async () => {
    const actual = await visibleThrough(w.users.staffA.client);
    expect(actual).toEqual(await orgRows(w.orgA, false));
    expect(actual.audit_log).toEqual([]);
    expect(actual.leases).toContain(w.leases.l2);
    expect(actual.leases).not.toContain(w.leases.lb);
  });

  it("manager A sees org A's rows including audit_log; manager B sees org B's only", async () => {
    const managerA = await visibleThrough(w.users.managerA.client);
    expect(managerA).toEqual(await orgRows(w.orgA, true));
    expect(managerA.audit_log.length).toBeGreaterThan(0);
    expect(await visibleThrough(w.users.managerB.client)).toEqual(
      await orgRows(w.orgB, true),
    );
  });

  it("user_metadata claiming manager of org A grants nothing", async () => {
    expect(await visibleThrough(w.users.metaManager.client)).toEqual(nothing());
  });
});

describe("Data API: tenants.phone is the only writable column", () => {
  it("tenant A1 updates own phone (1 row) and nothing else", async () => {
    const client = w.users.tenantA1.client;
    const phone = "+60 12-345 6789";
    const updated = await client
      .from("tenants")
      .update({ phone })
      .eq("id", w.tenants.a1)
      .select("id, phone");
    expect(updated.error).toBeNull();
    expect(updated.data).toEqual([{ id: w.tenants.a1, phone }]);
    const row = await prisma.tenants.findUniqueOrThrow({
      where: { id: w.tenants.a1 },
    });
    expect(row.phone).toBe(phone);
  });

  it("tenant A1 cannot update full_name, email, user_id or org_id (column privilege)", async () => {
    const before = await snapshot();
    const client = w.users.tenantA1.client;
    for (const patch of [
      { full_name: "Hacker" },
      { email: "evil@example.test" },
      { user_id: w.users.managerA.id },
      { org_id: w.orgB },
      { phone: "+60 11-111 1111", full_name: "Hacker" },
    ]) {
      const { error } = await client
        .from("tenants")
        .update(patch)
        .eq("id", w.tenants.a1);
      expect(error?.code, JSON.stringify(patch)).toBe("42501");
    }
    expect(await snapshot()).toBe(before);
  });

  it("nobody else can change a tenant's phone: other tenant, staff, manager, other org (0 rows)", async () => {
    const before = await snapshot();
    for (const user of [
      w.users.tenantA2,
      w.users.staffA,
      w.users.managerA,
      w.users.managerB,
      w.users.tenantB1,
      w.users.metaManager,
    ]) {
      const { data, error } = await user.client
        .from("tenants")
        .update({ phone: "+60 19-999 9999" })
        .eq("id", w.tenants.a1)
        .select("id");
      expect(error === null ? data : [], user.email).toEqual([]);
    }
    // An unfiltered update by tenant A2 touches only A2's own row.
    const all = await w.users.tenantA2.client
      .from("tenants")
      .update({ phone: "+60 18-888 8888" })
      .not("id", "is", null)
      .select("id");
    expect(all.error).toBeNull();
    expect(all.data).toEqual([{ id: w.tenants.a2 }]);
    const a1 = await prisma.tenants.findUniqueOrThrow({
      where: { id: w.tenants.a1 },
    });
    expect(a1.phone).toBe("+60 12-345 6789");
    // Restore A2 so the snapshot comparison covers everything else.
    await prisma.tenants.update({
      where: { id: w.tenants.a2 },
      data: { phone: "+60 12-000 0000" },
    });
    expect(await snapshot()).toBe(before);
  });

  it("an invalid phone is rejected by the database CHECK", async () => {
    const { error } = await w.users.tenantA1.client
      .from("tenants")
      .update({ phone: "<script>" })
      .eq("id", w.tenants.a1);
    expect(error?.code).toBe("23514");
  });

  it("anon cannot update a phone", async () => {
    const before = await snapshot();
    const { data, error } = await anonClient()
      .from("tenants")
      .update({ phone: "+60 17-777 7777" })
      .eq("id", w.tenants.a1)
      .select("id");
    expect(error !== null || (data ?? []).length === 0).toBe(true);
    expect(await snapshot()).toBe(before);
  });
});

describe("Data API: every other insert / update / delete fails for everyone", () => {
  const writeCases = (): WriteCase[] => [
    {
      table: "organizations",
      insert: () => ({ name: `Hacked ${w.tag}` }),
      update: () => ({ name: "Hacked" }),
      targetId: () => w.orgA,
    },
    {
      table: "memberships",
      // Self-promotion to manager of org A.
      insert: () => ({
        user_id: w.users.tenantA1.id,
        org_id: w.orgA,
        role: "manager",
      }),
      update: () => ({ role: "manager", org_id: w.orgB }),
      targetId: () => membershipStaffA,
    },
    {
      table: "units",
      insert: () => ({ org_id: w.orgA, name: `Hacked ${w.tag}` }),
      update: () => ({ name: "Hacked" }),
      targetId: () => w.units.a1,
    },
    {
      table: "tenants",
      insert: () => ({
        org_id: w.orgA,
        user_id: w.users.metaManager.id,
        full_name: "Intruder",
        email: "intruder@example.test",
      }),
      update: () => ({ full_name: "Hacked" }),
      targetId: () => w.tenants.a1,
    },
    {
      table: "leases",
      insert: () => ({
        org_id: w.orgA,
        unit_id: w.units.a1,
        tenant_id: w.tenants.a1,
        start_date: "2035-01-01",
        end_date: "2035-12-31",
        monthly_rent_sen: 1,
        deposit_sen: 0,
      }),
      update: () => ({ monthly_rent_sen: 1 }),
      targetId: () => w.leases.l1,
    },
    {
      table: "invoices",
      insert: () => ({
        org_id: w.orgA,
        lease_id: w.leases.l1,
        kind: "rent",
        period_index: 99,
        period_start: "2035-01-01",
        period_end: "2035-01-31",
        due_date: "2035-01-01",
        amount_sen: 1,
      }),
      update: () => ({ amount_sen: 1 }),
      targetId: () => invoiceL1,
    },
    {
      table: "payments",
      insert: () => ({
        org_id: w.orgA,
        lease_id: w.leases.l1,
        amount_sen: 100,
        method: "cash",
        status: "approved",
        received_at: new Date().toISOString(),
      }),
      update: () => ({ status: "approved" }),
      targetId: () => w.payments.l1Pending,
    },
    {
      table: "payment_allocations",
      insert: () => ({
        org_id: w.orgA,
        payment_id: w.payments.l1Pending,
        invoice_id: invoiceL1,
        amount_sen: 100,
      }),
      update: () => ({ amount_sen: 1 }),
      targetId: () => allocationL1,
    },
    {
      table: "gateway_bills",
      insert: () => ({
        org_id: w.orgA,
        lease_id: w.leases.l1,
        amount_sen: 1,
      }),
      update: () => ({ status: "paid", paid_at: new Date().toISOString() }),
      targetId: () => w.bills.l1,
    },
    {
      table: "audit_log",
      insert: () => ({ org_id: w.orgA, action: "forged" }),
      update: () => ({ action: "tampered" }),
      targetId: () => auditA,
    },
  ];

  const actors: Actor[] = [
    { name: "anon", client: () => anonClient() },
    { name: "tenant A1", client: () => w.users.tenantA1.client },
    { name: "staff A", client: () => w.users.staffA.client },
    { name: "manager A", client: () => w.users.managerA.client },
    { name: "manager B", client: () => w.users.managerB.client },
    // "audit_log is append-only for every role, including the service role":
    // the secret key cannot write tables through the Data API either.
    { name: "service role", client: () => adminClient() },
  ];

  let membershipStaffA = "";
  let invoiceL1 = "";
  let allocationL1 = "";
  let auditA = "";

  beforeAll(async () => {
    membershipStaffA = await firstId(
      prisma.memberships.findFirst({
        where: { user_id: w.users.staffA.id },
        select: { id: true },
      }),
      "staff membership",
    );
    invoiceL1 = await firstId(
      prisma.invoices.findFirst({
        where: { lease_id: w.leases.l1 },
        select: { id: true },
      }),
      "invoice",
    );
    allocationL1 = await firstId(
      prisma.payment_allocations.findFirst({
        where: { payment_id: w.payments.l1Approved },
        select: { id: true },
      }),
      "allocation",
    );
    auditA = await firstId(
      prisma.audit_log.findFirst({
        where: { org_id: w.orgA },
        select: { id: true },
      }),
      "audit row",
    );
  });

  for (const actor of actors) {
    it(`${actor.name}: insert, update and delete are refused on every table`, async () => {
      const before = await snapshot();
      const client = actor.client();
      for (const write of writeCases()) {
        const label = `${actor.name} ${write.table}`;
        const inserted = await client
          .from(write.table)
          .insert(write.insert())
          .select("id");
        // 42501 = permission denied: refused by the GRANTs themselves, not by
        // a constraint or a typo in the payload.
        expect(inserted.error?.code, `${label} insert`).toBe("42501");

        const updated = await client
          .from(write.table)
          .update(write.update())
          .eq("id", write.targetId())
          .select("id");
        expect(updated.error?.code, `${label} update`).toBe("42501");

        const deleted = await client
          .from(write.table)
          .delete()
          .eq("id", write.targetId())
          .select("id");
        expect(deleted.error?.code, `${label} delete`).toBe("42501");
      }
      expect(await snapshot()).toBe(before);
      expect(
        await prisma.organizations.count({
          where: { name: `Hacked ${w.tag}` },
        }),
      ).toBe(0);
      expect(
        await prisma.memberships.count({
          where: { user_id: w.users.tenantA1.id },
        }),
      ).toBe(0);
    });
  }

  it("rpc: no function is callable through /rest/v1/rpc", async () => {
    const callers = [
      anonClient(),
      w.users.tenantA1.client,
      w.users.managerA.client,
    ];
    for (const client of callers) {
      for (const fn of [
        "anything",
        "member_org_id",
        "manager_org_id",
        "tenant_org_id",
        "tenant_lease_ids",
        "payments_slip_exists",
      ]) {
        const { error } = await client.rpc(fn);
        expect(error, fn).not.toBeNull();
      }
      const privateCall = await client.schema("private").rpc("member_org_id");
      expect(privateCall.error).not.toBeNull();
    }
  });
});

describe("database privileges (catch-all for objects added later)", () => {
  it("RLS is enabled on every table in public", async () => {
    const open = await prisma.$queryRaw<{ relname: string }[]>`
      SELECT c.relname FROM pg_class c
       WHERE c.relnamespace = 'public'::regnamespace
         AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity`;
    expect(open).toEqual([]);
  });

  it("anon has no privilege on any table, view or function in public", async () => {
    const relations = await prisma.$queryRaw<{ relname: string }[]>`
      SELECT c.relname FROM pg_class c
       WHERE c.relnamespace = 'public'::regnamespace
         AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
         AND has_table_privilege('anon', c.oid,
               'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')`;
    expect(relations).toEqual([]);
    const functions = await prisma.$queryRaw<{ fn: string }[]>`
      SELECT p.oid::regprocedure::text AS fn FROM pg_proc p
       WHERE p.pronamespace = 'public'::regnamespace
         AND (has_function_privilege('anon', p.oid, 'EXECUTE')
              OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))`;
    expect(functions).toEqual([]);
  });

  it("authenticated may only SELECT, plus UPDATE of tenants.phone; service_role may not write", async () => {
    const tableWrites = await prisma.$queryRaw<
      { role: string; relname: string }[]
    >`
      SELECT r.role, c.relname FROM pg_class c
       CROSS JOIN (VALUES ('authenticated'), ('service_role')) AS r(role)
       WHERE c.relnamespace = 'public'::regnamespace
         AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
         AND has_table_privilege(r.role, c.oid,
               'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')`;
    expect(tableWrites).toEqual([]);
    const columnWrites = await prisma.$queryRaw<
      { role: string; relname: string; attname: string; priv: string }[]
    >`
      SELECT r.role, c.relname, a.attname, p.priv FROM pg_class c
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
       CROSS JOIN (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(role)
       CROSS JOIN (VALUES ('INSERT'), ('UPDATE')) AS p(priv)
       WHERE c.relnamespace = 'public'::regnamespace
         AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
         AND has_column_privilege(r.role, c.oid, a.attnum, p.priv)
       ORDER BY 1, 2, 3, 4`;
    expect(columnWrites).toEqual([
      {
        role: "authenticated",
        relname: "tenants",
        attname: "phone",
        priv: "UPDATE",
      },
    ]);
  });
});

describe("Storage: payment-slips", () => {
  const storage = (client: SupabaseClient) => client.storage.from(BUCKET);

  let slipA = "";

  beforeAll(async () => {
    slipA = await uploadSlipAsAdmin(`${w.orgA}/${w.leases.l1}`);
  });

  const objectExists = async (path: string): Promise<boolean> =>
    (
      await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*)::bigint AS n FROM storage.objects
       WHERE bucket_id = ${BUCKET} AND name = ${path}`
    )[0]?.n === 1n;

  it("the bucket is private", async () => {
    const { data, error } = await adminClient().storage.getBucket(BUCKET);
    expect(error).toBeNull();
    expect(data?.public).toBe(false);
    const publicUrl = storage(anonClient()).getPublicUrl(slipA).data.publicUrl;
    expect((await fetch(publicUrl)).ok).toBe(false);
  });

  it("staff A uploads into org A's folder and reads it through a short-lived signed URL", async () => {
    const path = `${w.orgA}/${w.leases.l1}/${randomUUID()}.pdf`;
    const bucket = storage(w.users.staffA.client);
    const upload = await bucket.upload(path, pdfBytes(), {
      contentType: "application/pdf",
    });
    expect(upload.error).toBeNull();
    expect(await objectExists(path)).toBe(true);

    const signed = await bucket.createSignedUrl(path, 60);
    expect(signed.error).toBeNull();
    const res = await fetch(String(signed.data?.signedUrl));
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(pdfBytes());

    const listed = await bucket.list(`${w.orgA}/${w.leases.l1}`);
    expect(listed.error).toBeNull();
    expect((listed.data ?? []).map((o) => o.name)).toContain(
      path.split("/").at(-1),
    );
  });

  it("manager A can read org A's slips", async () => {
    const signed = await storage(w.users.managerA.client).createSignedUrl(
      slipA,
      60,
    );
    expect(signed.error).toBeNull();
  });

  it("staff A cannot upload outside org A's folder, or a non-slip file type", async () => {
    const bucket = storage(w.users.staffA.client);
    const pdf = { contentType: "application/pdf" };
    for (const path of [
      `${w.orgB}/${randomUUID()}.pdf`,
      `${randomUUID()}.pdf`,
      `${w.orgA.toUpperCase()}/${randomUUID()}.pdf`,
    ]) {
      const { error } = await bucket.upload(path, pdfBytes(), pdf);
      expect(error, path).not.toBeNull();
      expect(await objectExists(path)).toBe(false);
    }
    const text = await bucket.upload(
      `${w.orgA}/${randomUUID()}.txt`,
      new TextEncoder().encode("hello"),
      { contentType: "text/plain" },
    );
    expect(text.error).not.toBeNull();
  });

  it("staff A cannot overwrite or delete a slip", async () => {
    const bucket = storage(w.users.staffA.client);
    const overwrite = await bucket.upload(slipA, pdfBytes(), {
      contentType: "application/pdf",
      upsert: true,
    });
    expect(overwrite.error).not.toBeNull();
    await bucket.remove([slipA]);
    expect(await objectExists(slipA)).toBe(true);
  });

  it("tenants, org B, a metadata-only 'manager' and anon cannot upload, list, download or sign", async () => {
    const outsiders = [
      { name: "tenant A1", client: w.users.tenantA1.client, org: w.orgA },
      { name: "tenant B1", client: w.users.tenantB1.client, org: w.orgA },
      { name: "manager B", client: w.users.managerB.client, org: w.orgA },
      { name: "meta", client: w.users.metaManager.client, org: w.orgA },
      { name: "anon", client: anonClient(), org: w.orgA },
    ];
    for (const outsider of outsiders) {
      const bucket = storage(outsider.client);
      const path = `${outsider.org}/${randomUUID()}.pdf`;
      const upload = await bucket.upload(path, pdfBytes(), {
        contentType: "application/pdf",
      });
      expect(upload.error, `${outsider.name} upload`).not.toBeNull();
      expect(await objectExists(path)).toBe(false);

      const download = await bucket.download(slipA);
      expect(download.error, `${outsider.name} download`).not.toBeNull();

      const signed = await bucket.createSignedUrl(slipA, 60);
      expect(signed.error, `${outsider.name} sign`).not.toBeNull();

      for (const prefix of [w.orgA, `${w.orgA}/${w.leases.l1}`, ""]) {
        const listed = await bucket.list(prefix);
        expect(
          listed.error !== null || (listed.data ?? []).length === 0,
          `${outsider.name} list '${prefix}'`,
        ).toBe(true);
      }
    }
    // Manager B can still use their own folder.
    const own = await storage(w.users.managerB.client).upload(
      `${w.orgB}/${randomUUID()}.pdf`,
      pdfBytes(),
      { contentType: "application/pdf" },
    );
    expect(own.error).toBeNull();
  });
});

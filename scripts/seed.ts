import "./load-env";
import { prisma } from "@/lib/server/prisma";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import type { Actor } from "@/lib/server/auth";
import { createLease } from "@/lib/server/services/leases";
import {
  approvePayment,
  recordPayment,
  recordPaymentWithSlip,
} from "@/lib/server/services/payments";

// `npm run seed`: creates exactly the brief's demo data (docs/TASK.md §2) on a
// freshly reset database. Accounts, organizations, memberships, tenants and
// units have no app service, so they are written directly (admin Auth API +
// Prisma). Leases and payments go ONLY through the app's services
// (createLease, recordPayment, recordPaymentWithSlip, approvePayment) with a
// real Actor, so invoices, allocations and audit rows are the app's own.
//
// Runs under `tsx --conditions=react-server` so the `server-only` imports in
// src/lib/server resolve to their empty server build instead of throwing.

type AccountSpec = {
  email: string;
  org: OrgKey;
  role: "manager" | "staff" | "tenant";
  fullName?: string;
};

type OrgKey = "northwind" | "beta";

type LeaseSpec = {
  org: OrgKey;
  unit: string;
  tenantEmail: string;
  startDate: string;
  endDate: string;
  monthlyRentSen: number;
  depositSen: number;
};

type ExistingUserRow = { email: string };

const PASSWORD = "Rentals2026!";

const ORG_NAMES: Record<OrgKey, string> = {
  northwind: "Northwind Properties",
  beta: "Beta Realty",
};

const ACCOUNTS: AccountSpec[] = [
  { email: "manager@northwind.test", org: "northwind", role: "manager" },
  { email: "staff@northwind.test", org: "northwind", role: "staff" },
  {
    email: "aisyah@northwind.test",
    org: "northwind",
    role: "tenant",
    fullName: "Aisyah Rahman",
  },
  {
    email: "ben@northwind.test",
    org: "northwind",
    role: "tenant",
    fullName: "Ben Lim",
  },
  {
    email: "probe@northwind.test",
    org: "northwind",
    role: "tenant",
    fullName: "Probe Tenant",
  },
  { email: "manager@beta.test", org: "beta", role: "manager" },
  {
    email: "chen@beta.test",
    org: "beta",
    role: "tenant",
    fullName: "Chen Wei",
  },
];

const UNITS: { org: OrgKey; name: string }[] = [
  { org: "northwind", name: "A-12-3" },
  { org: "northwind", name: "B-05-1" },
  { org: "northwind", name: "C-01-7" },
  { org: "northwind", name: "D-03-2" },
  { org: "beta", name: "KL-1" },
];

const LEASES: LeaseSpec[] = [
  {
    org: "northwind",
    unit: "A-12-3",
    tenantEmail: "aisyah@northwind.test",
    startDate: "2026-01-31",
    endDate: "2026-07-15",
    monthlyRentSen: 150000,
    depositSen: 300000,
  },
  {
    org: "northwind",
    unit: "B-05-1",
    tenantEmail: "ben@northwind.test",
    startDate: "2026-01-01",
    endDate: "2026-04-15",
    monthlyRentSen: 100029,
    depositSen: 0,
  },
  {
    org: "northwind",
    unit: "C-01-7",
    tenantEmail: "probe@northwind.test",
    startDate: "2026-02-28",
    endDate: "2027-02-27",
    monthlyRentSen: 200000,
    depositSen: 400000,
  },
  {
    org: "beta",
    unit: "KL-1",
    tenantEmail: "chen@beta.test",
    startDate: "2026-03-15",
    endDate: "2027-03-14",
    monthlyRentSen: 220000,
    depositSen: 440000,
  },
];

const lookup = <V>(map: Map<string, V>, key: string): V => {
  const value = map.get(key);
  if (value === undefined) {
    throw new Error(`Seed bug: no entry for "${key}"`);
  }
  return value;
};

// A minimal but well-formed one-page PDF (correct xref offsets), so the slip
// passes uploadSlip's magic-byte check and opens in a viewer.
const slipPdf = (): File => {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    "<< /Length 58 >>\nstream\nBT /F1 14 Tf 20 70 Td (Bank transfer slip RM 2,000.00) Tj ET\nendstream",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new File([body], "bank-transfer-slip.pdf", {
    type: "application/pdf",
  });
};

const assertFreshDatabase = async (): Promise<void> => {
  const emails = ACCOUNTS.map((account) => account.email);
  const existingUsers = await prisma.$queryRaw<ExistingUserRow[]>`
    SELECT email FROM auth.users WHERE email = ANY(${emails}::text[])`;
  const orgCount = await prisma.organizations.count();
  if (existingUsers.length > 0 || orgCount > 0) {
    const found = existingUsers.map((row) => row.email).join(", ");
    throw new Error(
      `The database already has data (${found || `${orgCount} organization(s)`}). ` +
        "The seed only runs on a freshly reset database: run `npx supabase db reset` first, then `npm run seed`.",
    );
  }
};

const createAuthUser = async (email: string): Promise<string> => {
  const { data, error } = await supabaseAdmin().auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(
      `Could not create auth user ${email}: ${error?.message ?? "no user"}`,
    );
  }
  return data.user.id;
};

const memberActor = async (
  userId: string,
  email: string,
): Promise<Extract<Actor, { kind: "member" }>> => {
  // Built from the membership row just written, exactly as getActor would.
  const membership = await prisma.memberships.findUniqueOrThrow({
    where: { user_id: userId },
    select: { org_id: true, role: true },
  });
  if (membership.role !== "manager" && membership.role !== "staff") {
    throw new Error(`Unexpected membership role: ${membership.role}`);
  }
  return {
    kind: "member",
    userId,
    email,
    orgId: membership.org_id,
    role: membership.role,
  };
};

const seed = async (): Promise<void> => {
  await assertFreshDatabase();

  // 1. Auth accounts (admin API, email already confirmed).
  const userIds = new Map<string, string>();
  for (const account of ACCOUNTS) {
    userIds.set(account.email, await createAuthUser(account.email));
  }

  // 2. Organizations, memberships, tenants, units: one transaction.
  const { orgIds, tenantIds, unitIds } = await prisma.$transaction(
    async (tx) => {
      const orgs = new Map<string, string>();
      for (const [key, name] of Object.entries(ORG_NAMES)) {
        const org = await tx.organizations.create({
          data: { name },
          select: { id: true },
        });
        orgs.set(key, org.id);
      }
      const tenants = new Map<string, string>();
      for (const account of ACCOUNTS) {
        const userId = lookup(userIds, account.email);
        const orgId = lookup(orgs, account.org);
        if (account.role === "tenant") {
          const tenant = await tx.tenants.create({
            data: {
              org_id: orgId,
              user_id: userId,
              full_name: account.fullName ?? account.email,
              email: account.email,
              phone: null,
            },
            select: { id: true },
          });
          tenants.set(account.email, tenant.id);
        } else {
          await tx.memberships.create({
            data: { user_id: userId, org_id: orgId, role: account.role },
          });
        }
      }
      const units = new Map<string, string>();
      for (const unit of UNITS) {
        const row = await tx.units.create({
          data: { org_id: lookup(orgs, unit.org), name: unit.name },
          select: { id: true },
        });
        units.set(unit.name, row.id);
      }
      return { orgIds: orgs, tenantIds: tenants, unitIds: units };
    },
  );

  const managers = new Map<string, Extract<Actor, { kind: "member" }>>([
    [
      "northwind",
      await memberActor(
        lookup(userIds, "manager@northwind.test"),
        "manager@northwind.test",
      ),
    ],
    [
      "beta",
      await memberActor(
        lookup(userIds, "manager@beta.test"),
        "manager@beta.test",
      ),
    ],
  ]);
  const staff = await memberActor(
    lookup(userIds, "staff@northwind.test"),
    "staff@northwind.test",
  );

  // 3. Leases through the app's lease service (schedule + audit row).
  const leaseIds = new Map<string, string>();
  for (const lease of LEASES) {
    const { id } = await createLease(lookup(managers, lease.org), {
      unitId: lookup(unitIds, lease.unit),
      tenantId: lookup(tenantIds, lease.tenantEmail),
      startDate: lease.startDate,
      endDate: lease.endDate,
      monthlyRentSen: lease.monthlyRentSen,
      depositSen: lease.depositSen,
    });
    leaseIds.set(lease.tenantEmail, id);
  }

  // 4. Aisyah's payments through the app's payment services.
  const aisyahLease = lookup(leaseIds, "aisyah@northwind.test");
  const northwindManager = lookup(managers, "northwind");
  const cash = await recordPayment(northwindManager, aisyahLease, {
    amountSen: 300000,
    method: "cash",
    receivedAt: "2026-01-31T10:00:00+08:00",
  });
  if (cash.status !== "approved") {
    throw new Error(`Cash payment should be approved, got ${cash.status}`);
  }
  // Staff: uploads the slip to <org_id>/<lease_id>/… then records; the
  // service removes the file again if recording fails.
  const transfer = await recordPaymentWithSlip(
    staff,
    aisyahLease,
    {
      amountSen: 200000,
      method: "bank_transfer",
      receivedAt: "2026-03-01T00:30:00+08:00",
    },
    slipPdf(),
  );
  if (transfer.status !== "pending_verification") {
    throw new Error(
      `Staff transfer should be pending_verification, got ${transfer.status}`,
    );
  }
  const approved = await approvePayment(northwindManager, transfer.id);

  console.log("Seed complete.\n");
  console.log(`Password for every account: ${PASSWORD}\n`);
  console.table(
    ACCOUNTS.map((account) => ({
      email: account.email,
      role: account.role,
      organization: ORG_NAMES[account.org],
    })),
  );
  console.table(
    LEASES.map((lease) => ({
      organization: ORG_NAMES[lease.org],
      unit: lease.unit,
      tenant: lease.tenantEmail,
      leaseId: lookup(leaseIds, lease.tenantEmail),
    })),
  );
  console.log(
    `Organizations: Northwind ${lookup(orgIds, "northwind")}, Beta ${lookup(orgIds, "beta")}`,
  );
  console.log(
    `Aisyah's payments: cash ${cash.id} (${cash.status}), bank transfer ${transfer.id} (${approved.status})`,
  );
};

const main = async (): Promise<void> => {
  try {
    await seed();
  } catch (error) {
    console.error(
      `Seed failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
};

void main();

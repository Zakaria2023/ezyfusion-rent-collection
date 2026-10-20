import { randomUUID } from "node:crypto";
import type { Actor } from "@/lib/server/auth";
import { prisma } from "@/lib/server/prisma";
import { createLease } from "@/lib/server/services/leases";

// Integration-test fixtures against the local database. Each call creates a
// fresh organization (unique name), so tests never see each other's rows and
// need no cleanup (payments and audit_log are append-only by design anyway).
//
// Actors are hand-made: services take an Actor, so no auth.users row, session
// or JWT is needed. The tenant row has user_id NULL for the same reason
// (tenants.user_id must reference a real auth user).

export type MemberActor = Extract<Actor, { kind: "member" }>;
export type TenantActor = Extract<Actor, { kind: "tenant" }>;

export type LeaseTerms = {
  startDate: string;
  endDate: string;
  monthlyRentSen: number;
  depositSen: number;
};

export type Fixture = {
  orgId: string;
  managerActor: MemberActor;
  staffActor: MemberActor;
  tenantActor: TenantActor;
  unitId: string;
  /** A second unit in the same org, with no lease. */
  spareUnitId: string;
  tenantId: string;
  leaseId: string;
};

export type FixtureOptions = { lease?: Partial<LeaseTerms> };

/** RM 1,000.00 x 3 months, no deposit: 300000 sen invoiced, 3 rent invoices. */
export const DEFAULT_LEASE: LeaseTerms = {
  startDate: "2026-01-01",
  endDate: "2026-03-31",
  monthlyRentSen: 100000,
  depositSen: 0,
};

export const memberActor = (
  orgId: string,
  role: "manager" | "staff",
): MemberActor => ({
  kind: "member",
  userId: randomUUID(),
  email: null,
  orgId,
  role,
});

export const createFixture = async (
  options: FixtureOptions = {},
): Promise<Fixture> => {
  const suffix = randomUUID().slice(0, 8);
  const org = await prisma.organizations.create({
    data: { name: `Test Org ${suffix}` },
  });
  const [unit, spareUnit] = await Promise.all([
    prisma.units.create({ data: { org_id: org.id, name: `U-${suffix}` } }),
    prisma.units.create({ data: { org_id: org.id, name: `S-${suffix}` } }),
  ]);
  const tenant = await prisma.tenants.create({
    data: {
      org_id: org.id,
      full_name: `Tenant ${suffix}`,
      email: `tenant-${suffix}@example.test`,
    },
  });
  const managerActor = memberActor(org.id, "manager");
  const staffActor = memberActor(org.id, "staff");
  const tenantActor: TenantActor = {
    kind: "tenant",
    userId: randomUUID(),
    email: null,
    orgId: org.id,
    tenantId: tenant.id,
  };
  const { id: leaseId } = await createLease(managerActor, {
    unitId: unit.id,
    tenantId: tenant.id,
    ...DEFAULT_LEASE,
    ...options.lease,
  });
  return {
    orgId: org.id,
    managerActor,
    staffActor,
    tenantActor,
    unitId: unit.id,
    spareUnitId: spareUnit.id,
    tenantId: tenant.id,
    leaseId,
  };
};

import "server-only";
import type { ManagerActor } from "@/lib/server/access";
import { prisma } from "@/lib/server/prisma";

type Option = { id: string; label: string };

type LeaseFormOptions = { units: Option[]; tenants: Option[] };

/**
 * Units and tenants for the new-lease form, from the manager's own
 * organization only (Prisma bypasses RLS, so the org filter is the guard).
 * createLease re-checks both ids against the org: the form is not trusted.
 */
export const leaseFormOptions = async (
  actor: ManagerActor,
): Promise<LeaseFormOptions> => {
  const [units, tenants] = await Promise.all([
    prisma.units.findMany({
      where: { org_id: actor.orgId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.tenants.findMany({
      where: { org_id: actor.orgId },
      orderBy: { full_name: "asc" },
      select: { id: true, full_name: true, email: true },
    }),
  ]);
  return {
    units: units.map((unit) => ({ id: unit.id, label: unit.name })),
    tenants: tenants.map((tenant) => ({
      id: tenant.id,
      label: `${tenant.full_name} (${tenant.email})`,
    })),
  };
};

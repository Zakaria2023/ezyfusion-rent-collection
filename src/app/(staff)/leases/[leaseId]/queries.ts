import "server-only";
import type { MemberActor } from "@/lib/server/access";
import { prisma } from "@/lib/server/prisma";

type LeaseLabels = {
  unitName: string;
  tenantName: string;
  tenantEmail: string;
};

/**
 * Unit and tenant names for the lease page header. Scoped by the actor's
 * organization in the query itself (Prisma bypasses RLS), so it can never
 * label a lease from another organization.
 */
export const leaseLabels = async (
  actor: MemberActor,
  leaseId: string,
): Promise<LeaseLabels | null> => {
  const lease = await prisma.leases.findFirst({
    where: { id: leaseId, org_id: actor.orgId },
    select: {
      units: { select: { name: true } },
      tenants: { select: { full_name: true, email: true } },
    },
  });
  return lease
    ? {
        unitName: lease.units.name,
        tenantName: lease.tenants.full_name,
        tenantEmail: lease.tenants.email,
      }
    : null;
};

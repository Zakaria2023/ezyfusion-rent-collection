import "server-only";
import type { leases, payments } from "@/generated/prisma/client";
import type { Actor } from "./auth";
import { forbidden, notFound } from "./http";
import { prisma } from "./prisma";
import type { Tx } from "./allocation";

// Record visibility (-> 404) and role checks (-> 403), shared by every service.
// Prisma bypasses RLS, so these ARE the authorization for server code. No
// next/headers here: seed scripts and tests call services with a hand-made Actor.

type Db = Tx | typeof prisma;
export type MemberActor = Extract<Actor, { kind: "member" }>;
export type ManagerActor = MemberActor & { role: "manager" };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: unknown): value is string =>
  typeof value === "string" && UUID_PATTERN.test(value);

// The org filter is part of the query, so a record in another organization is
// indistinguishable from one that does not exist.
const leaseScope = (actor: Actor) =>
  actor.kind === "tenant"
    ? { org_id: actor.orgId, tenant_id: actor.tenantId }
    : { org_id: actor.orgId };

/** The lease if the actor may see it, else null (bad id, other org, other tenant). */
export const findVisibleLease = async (
  actor: Actor,
  leaseId: string,
  tx: Db = prisma,
): Promise<leases | null> => {
  if (!isUuid(leaseId)) {
    return null;
  }
  return tx.leases.findFirst({ where: { id: leaseId, ...leaseScope(actor) } });
};

export const requireVisibleLease = async (
  actor: Actor,
  leaseId: string,
  tx: Db = prisma,
): Promise<leases> => {
  const lease = await findVisibleLease(actor, leaseId, tx);
  if (!lease) {
    throw notFound();
  }
  return lease;
};

/** The payment if the actor may see it (tenant: only payments on their own leases). */
export const findVisiblePayment = async (
  actor: Actor,
  paymentId: string,
  tx: Db = prisma,
): Promise<payments | null> => {
  if (!isUuid(paymentId)) {
    return null;
  }
  return tx.payments.findFirst({
    where: {
      id: paymentId,
      org_id: actor.orgId,
      ...(actor.kind === "tenant"
        ? { leases: { tenant_id: actor.tenantId } }
        : {}),
    },
  });
};

export const requireVisiblePayment = async (
  actor: Actor,
  paymentId: string,
  tx: Db = prisma,
): Promise<payments> => {
  const payment = await findVisiblePayment(actor, paymentId, tx);
  if (!payment) {
    throw notFound();
  }
  return payment;
};

// Assertion signatures need an explicit type annotation on an arrow function.
export const requireMember: (actor: Actor) => asserts actor is MemberActor = (
  actor,
) => {
  if (actor.kind !== "member") {
    throw forbidden();
  }
};

export const requireManager: (actor: Actor) => asserts actor is ManagerActor = (
  actor,
) => {
  if (actor.kind !== "member" || actor.role !== "manager") {
    throw forbidden();
  }
};

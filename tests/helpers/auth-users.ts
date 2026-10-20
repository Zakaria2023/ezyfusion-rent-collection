import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Actor } from "@/lib/server/auth";
import { prisma } from "@/lib/server/prisma";
import { createGatewayBill } from "@/lib/server/services/gateway";
import { createLease } from "@/lib/server/services/leases";
import { recordPayment } from "@/lib/server/services/payments";

// Real Supabase Auth users for the access-control tests (HTTP routes, Data API,
// Storage). Self-contained: it does not read the seed, so it survives a
// `db reset` between runs. Every run creates fresh organizations and users with
// unique emails, so assertions can be exact ("org A has exactly these rows").
//
// Two organizations:
//   org A: manager, staff, tenant A1 (lease L1 and a future lease LF),
//          tenant A2 (lease L2)
//   org B: manager, tenant B1 (lease LB)
// plus a user whose user_metadata claims to be a manager of org A but who has
// no membership and no tenant row.

type ServiceActor = Actor;

export type TestUser = {
  id: string;
  email: string;
  /** A real access token from Supabase Auth. */
  token: string;
  /** supabase-js with the publishable key, signed in as this user. */
  client: SupabaseClient;
};

export type World = {
  tag: string;
  orgA: string;
  orgB: string;
  units: { a1: string; a2: string; aFuture: string; b1: string };
  tenants: { a1: string; a2: string; b1: string };
  users: {
    managerA: TestUser;
    staffA: TestUser;
    tenantA1: TestUser;
    tenantA2: TestUser;
    managerB: TestUser;
    tenantB1: TestUser;
    /** user_metadata says manager of org A; no membership, no tenant row. */
    metaManager: TestUser;
  };
  actors: {
    managerA: ServiceActor;
    staffA: ServiceActor;
    tenantA1: ServiceActor;
    managerB: ServiceActor;
    tenantB1: ServiceActor;
  };
  leases: { l1: string; l2: string; future: string; lb: string };
  payments: { l1Approved: string; l1Pending: string; lbApproved: string };
  bills: { l1: string; lb: string };
};

export type WorldOptions = {
  /** Sign in one extra user and then revoke the session (logout everywhere). */
  revokedUser?: boolean;
};

export type WorldWithRevoked = World & { revokedToken: string | null };

const PASSWORD = `Pw-${randomUUID()}`;

/** L1 approved payment: 00:30 MYT on 1 March = 28 Feb 16:30 UTC. */
export const L1_APPROVED_RECEIVED_AT = "2026-03-01T00:30:00+08:00";
export const L1_APPROVED_SEN = 300000;
export const L1_PENDING_SEN = 50000;
export const LB_APPROVED_RECEIVED_AT = "2026-03-15T12:00:00+08:00";
export const LB_APPROVED_SEN = 440000;

export const L1_TERMS = {
  startDate: "2026-01-31",
  endDate: "2026-12-31",
  monthlyRentSen: 150000,
  depositSen: 300000,
};

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable ${name} (see .env.example)`);
  }
  return value;
};

const supabaseUrl = () => requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const publishableKey = () => requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");

const clientOptions = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};

/** supabase-js with the SECRET key (service_role). Test setup only. */
export const adminClient = (): SupabaseClient =>
  createClient(supabaseUrl(), requireEnv("SUPABASE_SECRET_KEY"), clientOptions);

/** supabase-js with the publishable key and no session: the anon role. */
export const anonClient = (): SupabaseClient =>
  createClient(supabaseUrl(), publishableKey(), clientOptions);

const isRateLimited = (status: number | undefined, message: string) =>
  status === 429 || /rate limit/i.test(message);

// Password sign-in, falling back to a magic-link token verified server-side
// when the local Auth rate limit (30 sign-ins / 5 min / IP) is reached: the
// OTP verification has its own bucket. Either way the token is a real session.
const signIn = async (
  admin: SupabaseClient,
  email: string,
): Promise<{ token: string; client: SupabaseClient }> => {
  const client = anonClient();
  const password = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (password.data.session) {
    return { token: password.data.session.access_token, client };
  }
  const error = password.error;
  if (!error || !isRateLimited(error.status, error.message)) {
    throw new Error(`Sign-in failed for ${email}: ${error?.message}`);
  }
  const link = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (link.error) {
    throw new Error(`generateLink failed: ${link.error.message}`);
  }
  const otp = await client.auth.verifyOtp({
    token_hash: link.data.properties.hashed_token,
    type: "magiclink",
  });
  if (!otp.data.session) {
    throw new Error(`OTP sign-in failed for ${email}: ${otp.error?.message}`);
  }
  return { token: otp.data.session.access_token, client };
};

export const createAuthUser = async (
  admin: SupabaseClient,
  label: string,
  tag: string,
  userMetadata: Record<string, unknown> = {},
): Promise<TestUser> => {
  const email = `t-${label}-${tag}@example.test`;
  const created = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: userMetadata,
  });
  if (created.error || !created.data.user) {
    throw new Error(`createUser failed: ${created.error?.message}`);
  }
  const { token, client } = await signIn(admin, email);
  return { id: created.data.user.id, email, token, client };
};

const member = (
  user: TestUser,
  orgId: string,
  role: "manager" | "staff",
): ServiceActor => ({
  kind: "member",
  userId: user.id,
  email: user.email,
  orgId,
  role,
});

const tenantActor = (
  user: TestUser,
  orgId: string,
  tenantId: string,
): ServiceActor => ({
  kind: "tenant",
  userId: user.id,
  email: user.email,
  orgId,
  tenantId,
});

export const createUnit = async (orgId: string, name: string) =>
  (await prisma.units.create({ data: { org_id: orgId, name } })).id;

export const buildWorld = async (
  options: WorldOptions = {},
): Promise<WorldWithRevoked> => {
  const tag = randomUUID().slice(0, 8);
  const admin = adminClient();

  const [orgA, orgB] = await Promise.all([
    prisma.organizations.create({ data: { name: `Access A ${tag}` } }),
    prisma.organizations.create({ data: { name: `Access B ${tag}` } }),
  ]);

  // Sequential: keeps the Auth server's sign-in bucket predictable.
  const managerA = await createAuthUser(admin, "mgr-a", tag);
  const staffA = await createAuthUser(admin, "staff-a", tag);
  const tenantA1 = await createAuthUser(admin, "ten-a1", tag);
  const tenantA2 = await createAuthUser(admin, "ten-a2", tag);
  const managerB = await createAuthUser(admin, "mgr-b", tag);
  const tenantB1 = await createAuthUser(admin, "ten-b1", tag);
  const metaManager = await createAuthUser(admin, "meta", tag, {
    role: "manager",
    org_id: orgA.id,
    orgId: orgA.id,
  });

  await prisma.memberships.createMany({
    data: [
      { user_id: managerA.id, org_id: orgA.id, role: "manager" },
      { user_id: staffA.id, org_id: orgA.id, role: "staff" },
      { user_id: managerB.id, org_id: orgB.id, role: "manager" },
    ],
  });

  const tenantRow = async (orgId: string, user: TestUser, name: string) =>
    (
      await prisma.tenants.create({
        data: {
          org_id: orgId,
          user_id: user.id,
          full_name: name,
          email: user.email,
          phone: "+60 12-000 0000",
        },
      })
    ).id;
  const tA1 = await tenantRow(orgA.id, tenantA1, `Tenant A1 ${tag}`);
  const tA2 = await tenantRow(orgA.id, tenantA2, `Tenant A2 ${tag}`);
  const tB1 = await tenantRow(orgB.id, tenantB1, `Tenant B1 ${tag}`);

  const units = {
    a1: await createUnit(orgA.id, `A1-${tag}`),
    a2: await createUnit(orgA.id, `A2-${tag}`),
    aFuture: await createUnit(orgA.id, `AF-${tag}`),
    b1: await createUnit(orgB.id, `B1-${tag}`),
  };

  const actors = {
    managerA: member(managerA, orgA.id, "manager"),
    staffA: member(staffA, orgA.id, "staff"),
    tenantA1: tenantActor(tenantA1, orgA.id, tA1),
    managerB: member(managerB, orgB.id, "manager"),
    tenantB1: tenantActor(tenantB1, orgB.id, tB1),
  };

  const l1 = await createLease(actors.managerA, {
    unitId: units.a1,
    tenantId: tA1,
    ...L1_TERMS,
  });
  const l2 = await createLease(actors.managerA, {
    unitId: units.a2,
    tenantId: tA2,
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    monthlyRentSen: 100000,
    depositSen: 0,
  });
  // Nothing is due on this one yet: gateway bill -> 422.
  const future = await createLease(actors.managerA, {
    unitId: units.aFuture,
    tenantId: tA1,
    startDate: "2030-01-01",
    endDate: "2030-06-30",
    monthlyRentSen: 120000,
    depositSen: 0,
  });
  const lb = await createLease(actors.managerB, {
    unitId: units.b1,
    tenantId: tB1,
    startDate: "2026-03-15",
    endDate: "2027-03-14",
    monthlyRentSen: 220000,
    depositSen: 440000,
  });

  const l1Approved = await recordPayment(actors.managerA, l1.id, {
    amountSen: L1_APPROVED_SEN,
    method: "cash",
    receivedAt: L1_APPROVED_RECEIVED_AT,
  });
  const l1Pending = await recordPayment(actors.staffA, l1.id, {
    amountSen: L1_PENDING_SEN,
    method: "cash",
    receivedAt: "2026-01-31T10:00:00+08:00",
  });
  const lbApproved = await recordPayment(actors.managerB, lb.id, {
    amountSen: LB_APPROVED_SEN,
    method: "cash",
    receivedAt: LB_APPROVED_RECEIVED_AT,
  });
  const billL1 = await createGatewayBill(actors.tenantA1, l1.id);
  const billLb = await createGatewayBill(actors.tenantB1, lb.id);

  let revokedToken: string | null = null;
  if (options.revokedUser) {
    const revoked = await createAuthUser(admin, "revoked", tag);
    await prisma.memberships.create({
      data: { user_id: revoked.id, org_id: orgA.id, role: "manager" },
    });
    revokedToken = revoked.token;
    // Global sign-out deletes the session the token belongs to.
    const { error } = await revoked.client.auth.signOut({ scope: "global" });
    if (error) {
      throw new Error(`signOut failed: ${error.message}`);
    }
  }

  return {
    tag,
    orgA: orgA.id,
    orgB: orgB.id,
    units,
    tenants: { a1: tA1, a2: tA2, b1: tB1 },
    users: {
      managerA,
      staffA,
      tenantA1,
      tenantA2,
      managerB,
      tenantB1,
      metaManager,
    },
    actors,
    leases: { l1: l1.id, l2: l2.id, future: future.id, lb: lb.id },
    payments: {
      l1Approved: l1Approved.id,
      l1Pending: l1Pending.id,
      lbApproved: lbApproved.id,
    },
    bills: { l1: billL1.billId, lb: billLb.billId },
    revokedToken,
  };
};

/** A minimal valid PDF body (the bucket only accepts JPEG, PNG and PDF). */
export const pdfBytes = (): Uint8Array =>
  new TextEncoder().encode("%PDF-1.4\n% access-control test slip\n%%EOF\n");

/** Uploads a slip with the secret key (as the server does) and returns its path. */
export const uploadSlipAsAdmin = async (folder: string): Promise<string> => {
  const path = `${folder}/${randomUUID()}.pdf`;
  const { error } = await adminClient()
    .storage.from("payment-slips")
    .upload(path, pdfBytes(), { contentType: "application/pdf" });
  if (error) {
    throw new Error(`Slip upload failed: ${error.message}`);
  }
  return path;
};

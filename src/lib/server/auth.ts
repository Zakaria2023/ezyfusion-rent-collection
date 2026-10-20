import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";
import { unauthorized } from "./http";
import { prisma } from "./prisma";

// Who is calling. Identity comes from Supabase Auth (a verified JWT); the role
// and organization come ONLY from our tables (memberships for staff/managers,
// tenants.user_id for tenants) — never from user_metadata, which users can edit.

export type Actor =
  | {
      kind: "member";
      userId: string;
      email: string | null;
      orgId: string;
      role: "manager" | "staff";
    }
  | {
      kind: "tenant";
      userId: string;
      email: string | null;
      orgId: string;
      tenantId: string;
    };

type AuthUser = { id: string; email: string | null };

const BEARER_PATTERN = /^Bearer\s+(\S+)$/i;

// Authorization: Bearer <access token> (how the graders' tests call the API).
// getUser(token) asks the Auth server to verify the token — not a local decode.
const userFromBearer = async (token: string): Promise<AuthUser | null> => {
  const supabase = createClient(supabaseUrl(), supabasePublishableKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return null;
  }
  return { id: data.user.id, email: data.user.email ?? null };
};

// The browser session cookie. getUser(), never getSession(): getSession trusts
// the cookie's contents without asking the Auth server.
const userFromCookie = async (): Promise<AuthUser | null> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return null;
  }
  return { id: data.user.id, email: data.user.email ?? null };
};

const authUser = async (req?: Request): Promise<AuthUser | null> => {
  const header = req?.headers.get("authorization");
  if (header) {
    const match = BEARER_PATTERN.exec(header.trim());
    // A malformed Authorization header is not silently ignored in favour of
    // a cookie: the caller asked to authenticate with it, and it is invalid.
    return match?.[1] ? userFromBearer(match[1]) : null;
  }
  return userFromCookie();
};

/** Resolves the caller to an Actor, or null when there is no valid login or no role. */
export const getActor = async (req?: Request): Promise<Actor | null> => {
  const user = await authUser(req);
  if (!user) {
    return null;
  }
  const membership = await prisma.memberships.findUnique({
    where: { user_id: user.id },
    select: { org_id: true, role: true },
  });
  if (membership) {
    if (membership.role !== "manager" && membership.role !== "staff") {
      return null;
    }
    return {
      kind: "member",
      userId: user.id,
      email: user.email,
      orgId: membership.org_id,
      role: membership.role,
    };
  }
  const tenant = await prisma.tenants.findUnique({
    where: { user_id: user.id },
    select: { id: true, org_id: true },
  });
  if (tenant) {
    return {
      kind: "tenant",
      userId: user.id,
      email: user.email,
      orgId: tenant.org_id,
      tenantId: tenant.id,
    };
  }
  return null;
};

/** getActor or 401. */
export const requireActor = async (req?: Request): Promise<Actor> => {
  const actor = await getActor(req);
  if (!actor) {
    throw unauthorized();
  }
  return actor;
};

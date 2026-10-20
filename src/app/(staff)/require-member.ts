import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { MemberActor } from "@/lib/server/access";
import { getActor } from "@/lib/server/auth";

/** getActor() once per request: the layout and the page share the lookup. */
export const currentActor = cache(() => getActor());

/**
 * Page guard for the staff area: signed out -> /login, tenant -> /portal.
 * Each page calls it itself; the layout's redirect does not protect a page.
 */
export const requireMemberPage = async (): Promise<MemberActor> => {
  const actor = await currentActor();
  if (!actor) {
    redirect("/login");
  }
  if (actor.kind === "tenant") {
    redirect("/portal");
  }
  return actor;
};

import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppHeader, type NavItem } from "@/components/layout/app-header";
import { getActor } from "@/lib/server/auth";

type TenantLayoutProps = { children: ReactNode };

const TENANT_NAV: readonly NavItem[] = [{ href: "/portal", label: "My lease" }];

// Tenants only. The role comes from tenants.user_id via getActor (never from
// user_metadata). This guards the pages; the data itself is guarded again by
// RLS (portal reads) and by the services behind each Server Action.
const TenantLayout = async ({ children }: TenantLayoutProps) => {
  const actor = await getActor();
  if (!actor) {
    redirect("/login");
  }
  if (actor.kind === "member") {
    redirect("/dashboard");
  }

  return (
    <>
      <AppHeader
        nav={TENANT_NAV}
        email={actor.email ?? ""}
        homeHref="/portal"
      />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-4">
        {children}
      </main>
    </>
  );
};

export default TenantLayout;

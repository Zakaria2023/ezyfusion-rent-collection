import { AppShell, type NavItem } from "@/components/layout/app-shell";
import { requireMemberPage } from "./require-member";

export const dynamic = "force-dynamic";

const MEMBER_NAV: readonly NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/leases", label: "Leases", icon: "leases" },
];

const MANAGER_NAV: readonly NavItem[] = [
  ...MEMBER_NAV,
  { href: "/leases/new", label: "New lease", icon: "new-lease" },
];

// Chrome for staff and managers. This redirect is UX only: every page and
// Server Action below re-checks the actor itself (a layout is not a guard).
const StaffLayout = async ({ children }: LayoutProps<"/">) => {
  const actor = await requireMemberPage();

  return (
    <AppShell
      nav={actor.role === "manager" ? MANAGER_NAV : MEMBER_NAV}
      email={actor.email ?? ""}
      role={actor.role}
      homeHref="/dashboard"
    >
      {children}
    </AppShell>
  );
};

export default StaffLayout;

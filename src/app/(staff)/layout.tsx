import { AppHeader, type NavItem } from "@/components/layout/app-header";
import { requireMemberPage } from "./require-member";

export const dynamic = "force-dynamic";

const MEMBER_NAV: readonly NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/leases", label: "Leases" },
];

const MANAGER_NAV: readonly NavItem[] = [
  ...MEMBER_NAV,
  { href: "/leases/new", label: "New lease" },
];

// Chrome for staff and managers. This redirect is UX only: every page and
// Server Action below re-checks the actor itself (a layout is not a guard).
const StaffLayout = async ({ children }: LayoutProps<"/">) => {
  const actor = await requireMemberPage();

  return (
    <>
      <AppHeader
        nav={actor.role === "manager" ? MANAGER_NAV : MEMBER_NAV}
        email={actor.email ?? ""}
        homeHref="/dashboard"
      />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8">
        {children}
      </main>
    </>
  );
};

export default StaffLayout;

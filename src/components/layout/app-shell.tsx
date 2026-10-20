import type { ReactNode } from "react";
import type { NavItem } from "./app-nav";
import { MobileNav } from "./mobile-nav";
import type { ShellRole } from "./role-pill";
import { SidebarContent } from "./sidebar-content";

type AppShellProps = {
  nav: readonly NavItem[];
  email: string;
  role: ShellRole;
  homeHref: string;
  children: ReactNode;
};

// Fixed sidebar on md+, top bar + drawer below. Content fills the width to
// the right of the sidebar, left-aligned.
export const AppShell = ({
  nav,
  email,
  role,
  homeHref,
  children,
}: AppShellProps) => (
  <div className="flex flex-1 flex-col">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:block">
      <SidebarContent nav={nav} email={email} role={role} homeHref={homeHref} />
    </aside>
    <div className="flex min-w-0 flex-1 flex-col bg-linear-to-b from-secondary/50 via-background to-background md:pl-64">
      <MobileNav nav={nav} email={email} role={role} homeHref={homeHref} />
      <main className="flex w-full min-w-0 flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        {children}
      </main>
    </div>
  </div>
);

export type { NavItem };

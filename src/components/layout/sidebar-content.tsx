import { Building2 } from "lucide-react";
import Link from "next/link";
import { AppNav, type NavItem } from "./app-nav";
import { IconChip } from "./icon-chip";
import { RolePill, type ShellRole } from "./role-pill";
import { SignOutButton } from "./sign-out-button";

type SidebarContentProps = {
  nav: readonly NavItem[];
  email: string;
  role: ShellRole;
  homeHref: string;
  onNavigate?: () => void;
};

// Shared by the fixed desktop sidebar and the mobile drawer.
export const SidebarContent = ({
  nav,
  email,
  role,
  homeHref,
  onNavigate,
}: SidebarContentProps) => (
  <div className="flex h-full flex-col">
    <div className="flex h-16 shrink-0 items-center border-b border-sidebar-border px-5">
      <Link
        href={homeHref}
        onClick={onNavigate}
        className="flex items-center gap-3 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-sidebar-ring/50"
      >
        <IconChip icon={Building2} tone="brand" size="sm" />
        <span className="font-semibold tracking-tight">Rent Collection</span>
      </Link>
    </div>
    <div className="flex-1 overflow-y-auto px-3 py-5">
      <p className="px-3 pb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Menu
      </p>
      <AppNav items={nav} onNavigate={onNavigate} />
    </div>
    <div className="flex shrink-0 flex-col gap-3 border-t border-sidebar-border p-4">
      <div className="flex flex-col gap-1.5 rounded-xl bg-background/60 p-3 ring-1 ring-sidebar-border">
        <span className="truncate text-sm font-medium" title={email}>
          {email}
        </span>
        <RolePill role={role} />
      </div>
      <SignOutButton />
    </div>
  </div>
);

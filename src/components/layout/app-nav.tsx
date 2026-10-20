"use client";

import {
  FileText,
  Home,
  LayoutDashboard,
  type LucideIcon,
  PlusCircle,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useAppNav } from "./use-app-nav";

// Icons are named, not passed as components: nav items come from server
// layouts and a component reference cannot cross into a client component.
export type NavIcon = "dashboard" | "leases" | "new-lease" | "home";

export type NavItem = { href: string; label: string; icon: NavIcon };

type AppNavProps = {
  items: readonly NavItem[];
  onNavigate?: () => void;
};

const ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  leases: FileText,
  "new-lease": PlusCircle,
  home: Home,
};

export const AppNav = ({ items, onNavigate }: AppNavProps) => {
  const { activeHref } = useAppNav(items);

  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = item.href === activeHref;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors outline-none hover:bg-sidebar-accent/60 hover:text-sidebar-foreground focus-visible:ring-3 focus-visible:ring-sidebar-ring/50",
              active &&
                "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <span
              className={cn(
                "absolute inset-y-1.5 left-0 w-1 rounded-r-full bg-primary opacity-0 transition-opacity",
                active && "opacity-100",
              )}
              aria-hidden
            />
            <Icon
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-sidebar-foreground",
                active && "text-primary group-hover:text-primary",
              )}
              aria-hidden
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
};

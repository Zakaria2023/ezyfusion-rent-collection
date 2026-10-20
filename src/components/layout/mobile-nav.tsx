"use client";

import { Building2, Menu } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import type { NavItem } from "./app-nav";
import { IconChip } from "./icon-chip";
import { RolePill, type ShellRole } from "./role-pill";
import { SidebarContent } from "./sidebar-content";
import { useMobileNav } from "./use-mobile-nav";

type MobileNavProps = {
  nav: readonly NavItem[];
  email: string;
  role: ShellRole;
  homeHref: string;
};

// Below md: a slim top bar; the menu button opens the sidebar as a drawer.
export const MobileNav = ({ nav, email, role, homeHref }: MobileNavProps) => {
  const { open, onOpenChange, close } = useMobileNav();

  return (
    <div className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur supports-backdrop-filter:bg-background/60 md:hidden">
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label="Open navigation menu"
            />
          }
        >
          <Menu />
        </SheetTrigger>
        <SheetContent title="Navigation">
          <SidebarContent
            nav={nav}
            email={email}
            role={role}
            homeHref={homeHref}
            onNavigate={close}
          />
        </SheetContent>
      </Sheet>
      <Link href={homeHref} className="flex items-center gap-2">
        <IconChip icon={Building2} tone="brand" size="sm" />
        <span className="font-semibold tracking-tight">Rent Collection</span>
      </Link>
      <div className="ml-auto">
        <RolePill role={role} />
      </div>
    </div>
  );
};

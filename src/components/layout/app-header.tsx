import { Building2 } from "lucide-react";
import Link from "next/link";
import { AppNav, type NavItem } from "./app-nav";
import { SignOutButton } from "./sign-out-button";

type AppHeaderProps = {
  nav: readonly NavItem[];
  email: string;
  homeHref?: string;
};

export const AppHeader = ({ nav, email, homeHref = "/" }: AppHeaderProps) => (
  <header className="border-b bg-background">
    <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4">
      <Link
        href={homeHref}
        className="flex items-center gap-2 font-semibold tracking-tight"
      >
        <Building2 className="size-5" aria-hidden />
        Rent Collection
      </Link>
      <AppNav items={nav} />
      <div className="ml-auto flex items-center gap-3">
        <span className="hidden text-sm text-muted-foreground sm:inline">
          {email}
        </span>
        <SignOutButton />
      </div>
    </div>
  </header>
);

export type { NavItem };

"use client";

import { usePathname } from "next/navigation";

type NavLink = { href: string };

const matches = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

// The most specific matching item wins, so /leases/new highlights "New lease"
// and not also "Leases".
export const useAppNav = (items: readonly NavLink[]) => {
  const pathname = usePathname();
  const activeHref = items
    .filter((item) => matches(pathname, item.href))
    .reduce<string | null>(
      (best, item) =>
        best === null || item.href.length > best.length ? item.href : best,
      null,
    );
  return { activeHref };
};

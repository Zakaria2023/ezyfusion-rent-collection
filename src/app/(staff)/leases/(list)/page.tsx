import { FileText, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { LeasePagination } from "@/components/leases/lease-pagination";
import { LeaseSearch } from "@/components/leases/lease-search";
import { LeasesTable } from "@/components/leases/leases-table";
import { buttonVariants } from "@/components/ui/button";
import { listLeases } from "@/lib/server/services/leases";
import { requireMemberPage } from "../../require-member";

export const metadata: Metadata = { title: "Leases" };

export const dynamic = "force-dynamic";

const MAX_QUERY_LENGTH = 100;

// searchParams values are untrusted strings (or arrays when repeated).
const firstParam = (value: string | string[] | undefined): string =>
  (Array.isArray(value) ? value[0] : value) ?? "";

const parsePage = (value: string): number => {
  const page = /^\d{1,6}$/.test(value) ? Number(value) : 1;
  return page > 0 ? page : 1;
};

const LeasesPage = async ({ searchParams }: PageProps<"/leases">) => {
  const actor = await requireMemberPage();
  const params = await searchParams;
  const q = firstParam(params.q).trim().slice(0, MAX_QUERY_LENGTH);
  const page = parsePage(firstParam(params.page));
  const { rows, total, pageSize } = await listLeases(actor, { q, page });

  return (
    <>
      <PageHeader
        title="Leases"
        description="Every lease in your organization."
        actions={
          actor.role === "manager" ? (
            <Link href="/leases/new" className={buttonVariants()}>
              <Plus data-icon="inline-start" />
              New lease
            </Link>
          ) : null
        }
      />
      <LeaseSearch key={q} q={q} />
      {rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={q ? "No leases match your search" : "No leases yet"}
          description={
            q
              ? `Nothing matches "${q}"${page > 1 ? ` on page ${page}` : ""}. Try a unit name like A-12-3 or part of a tenant's name.`
              : "Leases your organization creates will appear here."
          }
          action={
            q || page > 1 ? (
              <Link
                href="/leases"
                className={buttonVariants({ variant: "outline" })}
              >
                Clear search
              </Link>
            ) : null
          }
        />
      ) : (
        <>
          <LeasesTable rows={rows} />
          <LeasePagination
            page={page}
            pageSize={pageSize}
            total={total}
            q={q}
          />
        </>
      )}
    </>
  );
};

export default LeasesPage;

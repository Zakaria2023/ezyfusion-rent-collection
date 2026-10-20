import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type LeasePaginationProps = {
  page: number;
  pageSize: number;
  total: number;
  q: string;
};

const pageHref = (page: number, q: string) => {
  const params = new URLSearchParams();
  if (q) {
    params.set("q", q);
  }
  if (page > 1) {
    params.set("page", String(page));
  }
  const query = params.toString();
  return query ? `/leases?${query}` : "/leases";
};

export const LeasePagination = ({
  page,
  pageSize,
  total,
  q,
}: LeasePaginationProps) => {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const firstRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRow = Math.min(total, page * pageSize);

  return (
    <nav
      className="flex items-center justify-between gap-4 text-sm text-muted-foreground"
      aria-label="Pagination"
    >
      <span>
        {firstRow}–{lastRow} of {total} · page {page} of {pageCount}
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link
            href={pageHref(page - 1, q)}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <ChevronLeft data-icon="inline-start" />
            Previous
          </Link>
        ) : null}
        {page < pageCount ? (
          <Link
            href={pageHref(page + 1, q)}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Next
            <ChevronRight data-icon="inline-end" />
          </Link>
        ) : null}
      </div>
    </nav>
  );
};

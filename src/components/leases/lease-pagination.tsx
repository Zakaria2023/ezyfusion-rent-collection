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

const PAGE_BUTTON = buttonVariants({ variant: "outline", size: "sm" });

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
      className="flex flex-col gap-3 border-t bg-muted/30 px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between"
      aria-label="Pagination"
    >
      <span>
        Showing{" "}
        <span className="font-medium text-foreground tabular-nums">
          {firstRow}–{lastRow}
        </span>{" "}
        of <span className="font-medium text-foreground">{total}</span>
      </span>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={pageHref(page - 1, q)} className={PAGE_BUTTON}>
            <ChevronLeft data-icon="inline-start" />
            Previous
          </Link>
        ) : (
          <span className={cn(PAGE_BUTTON, "opacity-50")} aria-disabled>
            <ChevronLeft data-icon="inline-start" />
            Previous
          </span>
        )}
        <span className="px-2 text-xs tabular-nums">
          Page {page} of {pageCount}
        </span>
        {page < pageCount ? (
          <Link href={pageHref(page + 1, q)} className={PAGE_BUTTON}>
            Next
            <ChevronRight data-icon="inline-end" />
          </Link>
        ) : (
          <span className={cn(PAGE_BUTTON, "opacity-50")} aria-disabled>
            Next
            <ChevronRight data-icon="inline-end" />
          </span>
        )}
      </div>
    </nav>
  );
};

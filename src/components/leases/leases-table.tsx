import { ChevronRight } from "lucide-react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCalendarDate } from "@/lib/dates";
import { formatSen } from "@/lib/money";

type LeaseRow = {
  id: string;
  unitName: string;
  tenantName: string;
  startDate: string;
  endDate: string;
  monthlyRentSen: number;
  depositSen: number;
};

type LeasesTableProps = { rows: readonly LeaseRow[] };

// 'Aisyah binti Rahman' -> 'AB'. Display only.
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");

export const LeasesTable = ({ rows }: LeasesTableProps) => (
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Unit</TableHead>
        <TableHead>Tenant</TableHead>
        <TableHead>Term (inclusive)</TableHead>
        <TableHead className="text-right">Monthly rent</TableHead>
        <TableHead className="text-right">Deposit</TableHead>
        <TableHead className="w-12">
          <span className="sr-only">Open</span>
        </TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {rows.map((lease) => (
        <TableRow key={lease.id} className="group">
          <TableCell>
            <Link
              href={`/leases/${lease.id}`}
              className="inline-flex rounded-md bg-primary/10 px-2.5 py-1 font-semibold text-primary ring-1 ring-primary/15 transition-colors outline-none hover:bg-primary/15 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {lease.unitName}
            </Link>
          </TableCell>
          <TableCell>
            <div className="flex items-center gap-3">
              <span
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-indigo-100 to-teal-100 text-xs font-semibold text-indigo-700 dark:from-indigo-500/25 dark:to-teal-500/25 dark:text-indigo-200"
                aria-hidden
              >
                {initials(lease.tenantName)}
              </span>
              <span className="font-medium">{lease.tenantName}</span>
            </div>
          </TableCell>
          <TableCell className="text-muted-foreground">
            {formatCalendarDate(lease.startDate)} –{" "}
            {formatCalendarDate(lease.endDate)}
          </TableCell>
          <TableCell className="text-right font-medium tabular-nums">
            {formatSen(lease.monthlyRentSen)}
          </TableCell>
          <TableCell className="text-right text-muted-foreground tabular-nums">
            {lease.depositSen > 0 ? formatSen(lease.depositSen) : "—"}
          </TableCell>
          <TableCell className="text-right">
            <Link
              href={`/leases/${lease.id}`}
              aria-label={`Open lease for ${lease.unitName}, ${lease.tenantName}`}
              className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors outline-none group-hover:bg-secondary group-hover:text-secondary-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
);

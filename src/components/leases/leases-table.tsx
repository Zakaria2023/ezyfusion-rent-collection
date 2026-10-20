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

export const LeasesTable = ({ rows }: LeasesTableProps) => (
  <div className="rounded-lg border">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Unit</TableHead>
          <TableHead>Tenant</TableHead>
          <TableHead>Start</TableHead>
          <TableHead>End</TableHead>
          <TableHead className="text-right">Monthly rent</TableHead>
          <TableHead className="text-right">Deposit</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((lease) => (
          <TableRow key={lease.id}>
            <TableCell className="font-medium">
              <Link
                href={`/leases/${lease.id}`}
                className="underline-offset-4 hover:underline"
              >
                {lease.unitName}
              </Link>
            </TableCell>
            <TableCell>{lease.tenantName}</TableCell>
            <TableCell>{formatCalendarDate(lease.startDate)}</TableCell>
            <TableCell>{formatCalendarDate(lease.endDate)}</TableCell>
            <TableCell className="text-right tabular-nums">
              {formatSen(lease.monthlyRentSen)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {lease.depositSen > 0 ? formatSen(lease.depositSen) : "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
);

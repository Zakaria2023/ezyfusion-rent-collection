import { InvoiceStatusBadge } from "@/components/layout/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { InvoiceStatus } from "@/lib/billing";
import { formatCalendarDate } from "@/lib/dates";
import { formatSen } from "@/lib/money";

type InvoiceRow = {
  id: string;
  kind: "deposit" | "rent";
  periodIndex: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  dueDate: string;
  amountSen: number;
  paidSen: number;
  status: InvoiceStatus;
};

type InvoicesTableProps = { invoices: readonly InvoiceRow[] };

type InvoicePeriodProps = { invoice: InvoiceRow };

const InvoicePeriod = ({ invoice }: InvoicePeriodProps) => {
  if (
    invoice.kind === "deposit" ||
    invoice.periodIndex === null ||
    invoice.periodStart === null ||
    invoice.periodEnd === null
  ) {
    return (
      <span className="inline-flex rounded-md bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700 dark:bg-teal-500/15 dark:text-teal-300">
        Deposit
      </span>
    );
  }
  return (
    <div className="flex flex-col">
      <span className="font-medium">Period {invoice.periodIndex + 1}</span>
      <span className="text-xs text-muted-foreground">
        {formatCalendarDate(invoice.periodStart)} –{" "}
        {formatCalendarDate(invoice.periodEnd)}
      </span>
    </div>
  );
};

export const InvoicesTable = ({ invoices }: InvoicesTableProps) => {
  // Integer sen throughout; these are display totals, the DB is the source.
  const totalSen = invoices.reduce((sum, i) => sum + i.amountSen, 0);
  const paidSen = invoices.reduce((sum, i) => sum + i.paidSen, 0);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Period</TableHead>
          <TableHead>Due date</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead className="text-right">Paid</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invoices.map((invoice) => (
          <TableRow key={invoice.id}>
            <TableCell>
              <InvoicePeriod invoice={invoice} />
            </TableCell>
            <TableCell>{formatCalendarDate(invoice.dueDate)}</TableCell>
            <TableCell className="text-right font-medium tabular-nums">
              {formatSen(invoice.amountSen)}
            </TableCell>
            <TableCell className="text-right text-muted-foreground tabular-nums">
              {formatSen(invoice.paidSen)}
            </TableCell>
            <TableCell>
              <InvoiceStatusBadge status={invoice.status} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter className="bg-primary/5">
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={2}>
            <span className="font-semibold">Total</span>
            <span className="text-muted-foreground">
              {" "}
              · balance {formatSen(totalSen - paidSen)}
            </span>
          </TableCell>
          <TableCell className="text-right font-semibold tabular-nums">
            {formatSen(totalSen)}
          </TableCell>
          <TableCell className="text-right font-semibold tabular-nums">
            {formatSen(paidSen)}
          </TableCell>
          <TableCell />
        </TableRow>
      </TableFooter>
    </Table>
  );
};

import { CalendarRange } from "lucide-react";
import { EmptyState } from "@/components/layout/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCalendarDate } from "@/lib/dates";
import { formatSen } from "@/lib/money";
import type { SchedulePreview as Preview } from "./use-lease-form";

type SchedulePreviewProps = { preview: Preview };

// Rendering a 100-year lease row by row helps nobody; the total still covers all.
const MAX_ROWS = 60;

export const SchedulePreview = ({ preview }: SchedulePreviewProps) => {
  if (preview.state === "incomplete") {
    return (
      <EmptyState
        icon={CalendarRange}
        title="Invoice preview"
        description={preview.message}
      />
    );
  }
  if (preview.state === "invalid") {
    return (
      <p
        className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive"
        role="alert"
      >
        Cannot build the schedule: {preview.message}
      </p>
    );
  }

  const shown = preview.invoices.slice(0, MAX_ROWS);
  const hidden = preview.invoices.length - shown.length;

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Invoice</TableHead>
            <TableHead>Period</TableHead>
            <TableHead>Due</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((invoice) => (
            <TableRow key={`${invoice.kind}-${invoice.periodIndex ?? "d"}`}>
              <TableCell className="font-medium">
                {invoice.periodIndex === null
                  ? "Deposit"
                  : `Period ${invoice.periodIndex + 1}`}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {invoice.periodStart && invoice.periodEnd
                  ? `${formatCalendarDate(invoice.periodStart)} – ${formatCalendarDate(invoice.periodEnd)}`
                  : "—"}
              </TableCell>
              <TableCell>{formatCalendarDate(invoice.dueDate)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatSen(invoice.amountSen)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={3}>
              {preview.invoices.length} invoices
              {hidden > 0 ? ` (${hidden} more not shown)` : ""}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatSen(preview.totalSen)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
};

import { AlertTriangle, CalendarRange } from "lucide-react";
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
        bare
        icon={CalendarRange}
        title="Nothing to preview yet"
        description={preview.message}
      />
    );
  }
  if (preview.state === "invalid") {
    return (
      <div className="p-5">
        <p
          className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-300"
          role="alert"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>Cannot build the schedule: {preview.message}</span>
        </p>
      </div>
    );
  }

  const shown = preview.invoices.slice(0, MAX_ROWS);
  const hidden = preview.invoices.length - shown.length;

  return (
    <div className="max-h-160 overflow-y-auto">
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
                {invoice.periodIndex === null ? (
                  <span className="inline-flex rounded-md bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700 dark:bg-teal-500/15 dark:text-teal-300">
                    Deposit
                  </span>
                ) : (
                  `Period ${invoice.periodIndex + 1}`
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {invoice.periodStart && invoice.periodEnd
                  ? `${formatCalendarDate(invoice.periodStart)} – ${formatCalendarDate(invoice.periodEnd)}`
                  : "—"}
              </TableCell>
              <TableCell>{formatCalendarDate(invoice.dueDate)}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {formatSen(invoice.amountSen)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter className="bg-primary/5">
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={3}>
              <span className="font-semibold">Total</span>
              <span className="text-muted-foreground">
                {" "}
                · {preview.invoices.length} invoices
                {hidden > 0 ? ` (${hidden} more not shown)` : ""}
              </span>
            </TableCell>
            <TableCell className="text-right text-base font-semibold tabular-nums">
              {formatSen(preview.totalSen)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
};

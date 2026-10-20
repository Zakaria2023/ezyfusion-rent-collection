import { Receipt, Wallet } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/layout/empty-state";
import {
  InvoiceStatusBadge,
  PaymentStatusBadge,
} from "@/components/layout/status-badge";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCalendarDate, formatMalaysiaDateTime } from "@/lib/dates";
import type { GatewayBillStatus } from "@/lib/enums";
import { formatSen } from "@/lib/money";
import { PayNowButton } from "./pay-now-button";
import { type PortalLease, paymentMethodLabel } from "./portal-data";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

type LeaseCardProps = { lease: PortalLease; onChanged: () => void };

const BILL_STATUS_STYLES: Record<
  GatewayBillStatus,
  { label: string; variant: BadgeVariant }
> = {
  pending: { label: "Awaiting gateway", variant: "secondary" },
  paid: { label: "Paid", variant: "default" },
  failed: { label: "Failed", variant: "destructive" },
};

// Presentational: every value (statuses, amount due now) was computed by
// usePortalData after mount, with Malaysia's date.
export const LeaseCard = ({ lease, onChanged }: LeaseCardProps) => (
  <Card>
    <CardHeader>
      <CardTitle>{lease.unitName}</CardTitle>
      <CardDescription>
        {formatCalendarDate(lease.startDate)} –{" "}
        {formatCalendarDate(lease.endDate)} · Rent{" "}
        {formatSen(lease.monthlyRentSen)} / month · Deposit{" "}
        {formatSen(lease.depositSen)}
      </CardDescription>
      <CardAction>
        <PayNowButton
          leaseId={lease.id}
          amountDueNowSen={lease.amountDueNowSen}
          onCreated={onChanged}
        />
      </CardAction>
    </CardHeader>
    <CardContent className="flex flex-col gap-6">
      <div className="rounded-lg bg-muted/50 p-4">
        <p className="text-sm text-muted-foreground">Amount due now</p>
        <p className="text-2xl font-semibold tabular-nums">
          {formatSen(lease.amountDueNowSen)}
        </p>
        <p className="text-xs text-muted-foreground">
          Unpaid invoices due on or before today (Malaysia time).
        </p>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">Invoices</h2>
        {lease.invoices.length === 0 ? (
          <EmptyState icon={Receipt} title="No invoices yet" />
        ) : (
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
              {lease.invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell>{invoice.label}</TableCell>
                  <TableCell>{formatCalendarDate(invoice.dueDate)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatSen(invoice.amountSen)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatSen(invoice.paidSen)}
                  </TableCell>
                  <TableCell>
                    <InvoiceStatusBadge status={invoice.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">Payments</h2>
        {lease.payments.length === 0 ? (
          <EmptyState icon={Wallet} title="No payments yet" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Received (MYT)</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lease.payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell>
                    {formatMalaysiaDateTime(payment.receivedAt)}
                  </TableCell>
                  <TableCell>{paymentMethodLabel(payment.method)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatSen(payment.amountSen)}
                  </TableCell>
                  <TableCell>
                    <PaymentStatusBadge status={payment.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      {lease.bills.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="font-medium">Online payment attempts</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Created (MYT)</TableHead>
                <TableHead>Bill</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lease.bills.map((bill) => (
                <TableRow key={bill.id}>
                  <TableCell>
                    {formatMalaysiaDateTime(bill.createdAt)}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/payments/return?bill_id=${encodeURIComponent(bill.id)}`}
                      className="font-mono text-xs underline-offset-4 hover:underline"
                    >
                      {bill.id}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatSen(bill.amountSen)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={BILL_STATUS_STYLES[bill.status].variant}>
                      {BILL_STATUS_STYLES[bill.status].label}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ) : null}
    </CardContent>
  </Card>
);

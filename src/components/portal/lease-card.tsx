import { Building2, CreditCard, Receipt, Wallet } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/layout/empty-state";
import { SectionCard } from "@/components/layout/section-card";
import {
  BillStatusBadge,
  InvoiceStatusBadge,
  PaymentStatusBadge,
} from "@/components/layout/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCalendarDate, formatMalaysiaDateTime } from "@/lib/dates";
import { formatSen } from "@/lib/money";
import { PayNowButton } from "./pay-now-button";
import { type PortalLease, paymentMethodLabel } from "./portal-data";

type LeaseCardProps = { lease: PortalLease; onChanged: () => void };

type HeroFactProps = { label: string; value: string };

const HeroFact = ({ label, value }: HeroFactProps) => (
  <div className="flex flex-col gap-0.5">
    <dt className="text-xs text-white/80">{label}</dt>
    <dd className="text-sm font-semibold tabular-nums">{value}</dd>
  </div>
);

// Presentational: every value (statuses, amount due now) was computed by
// usePortalData after mount, with Malaysia's date.
export const LeaseCard = ({ lease, onChanged }: LeaseCardProps) => (
  <div className="flex flex-col gap-6">
    <section className="relative overflow-hidden rounded-3xl bg-linear-to-br from-indigo-600 via-violet-600 to-teal-500 p-6 text-white shadow-xl shadow-primary/20 sm:p-8">
      <div
        className="absolute -top-24 -left-24 size-80 rounded-full bg-white/10 blur-3xl"
        aria-hidden
      />
      <div
        className="absolute -right-16 -bottom-32 size-80 rounded-full bg-teal-300/20 blur-3xl"
        aria-hidden
      />
      <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <span
              className="flex size-10 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur"
              aria-hidden
            >
              <Building2 className="size-5" />
            </span>
            <h2 className="text-lg font-semibold tracking-tight">
              {lease.unitName}
            </h2>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-white/85">Amount due now</p>
            <p className="text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">
              {formatSen(lease.amountDueNowSen)}
            </p>
            <p className="text-sm text-white/80">
              {lease.amountDueNowSen > 0
                ? "Unpaid invoices due on or before today (Malaysia time)."
                : "You are all paid up. Thank you!"}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-4 lg:items-end">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-2xl bg-white/15 p-4 ring-1 ring-white/20 backdrop-blur sm:grid-cols-3">
            <HeroFact
              label="Lease term"
              value={`${formatCalendarDate(lease.startDate)} – ${formatCalendarDate(lease.endDate)}`}
            />
            <HeroFact
              label="Monthly rent"
              value={formatSen(lease.monthlyRentSen)}
            />
            <HeroFact label="Deposit" value={formatSen(lease.depositSen)} />
          </dl>
          <PayNowButton
            leaseId={lease.id}
            amountDueNowSen={lease.amountDueNowSen}
            onCreated={onChanged}
            className="h-11 w-full bg-white px-6 text-indigo-700 shadow-lg shadow-indigo-950/20 hover:bg-white/90 sm:w-auto"
          />
        </div>
      </div>
    </section>

    <SectionCard
      icon={Receipt}
      title="Invoices"
      description="Statuses as of today in Malaysia."
      headingLevel="h3"
    >
      {lease.invoices.length === 0 ? (
        <EmptyState bare icon={Receipt} title="No invoices yet" />
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
                <TableCell className="font-medium">{invoice.label}</TableCell>
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
        </Table>
      )}
    </SectionCard>

    <div className="grid items-start gap-6 xl:grid-cols-2">
      <SectionCard
        icon={Wallet}
        tone="emerald"
        title="Payments"
        description="Received times are Malaysia time."
        headingLevel="h3"
      >
        {lease.payments.length === 0 ? (
          <EmptyState bare icon={Wallet} title="No payments yet" />
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
                  <TableCell className="tabular-nums">
                    {formatMalaysiaDateTime(payment.receivedAt)}
                  </TableCell>
                  <TableCell>{paymentMethodLabel(payment.method)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
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
      </SectionCard>

      {lease.bills.length > 0 ? (
        <SectionCard
          icon={CreditCard}
          tone="teal"
          title="Online payment attempts"
          description="Open a bill to see its latest status."
          headingLevel="h3"
        >
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
                  <TableCell className="tabular-nums">
                    {formatMalaysiaDateTime(bill.createdAt)}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/payments/return?bill_id=${encodeURIComponent(bill.id)}`}
                      className="inline-block max-w-40 truncate align-middle font-mono text-xs text-primary underline-offset-4 hover:underline"
                      title={bill.id}
                    >
                      {bill.id}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatSen(bill.amountSen)}
                  </TableCell>
                  <TableCell>
                    <BillStatusBadge status={bill.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>
      ) : null}
    </div>
  </div>
);

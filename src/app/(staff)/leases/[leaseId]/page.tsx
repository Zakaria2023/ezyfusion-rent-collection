import { ArrowLeft, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { InvoicesTable } from "@/components/leases/invoices-table";
import { LeaseSummary } from "@/components/leases/lease-summary";
import { PaymentsTable } from "@/components/payments/payments-table";
import { RecordPaymentForm } from "@/components/payments/record-payment-form";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCalendarDate, toMalaysiaInputValue } from "@/lib/dates";
import { formatSen } from "@/lib/money";
import { HttpError } from "@/lib/server/http";
import { getLeaseDetail, type LeaseDetail } from "@/lib/server/services/leases";
import { requireMemberPage } from "../../require-member";
import { leaseLabels } from "./queries";

export const metadata: Metadata = { title: "Lease" };

export const dynamic = "force-dynamic";

// The service authorizes (other org / unknown id -> HttpError 404).
const loadLease = async (
  ...args: Parameters<typeof getLeaseDetail>
): Promise<LeaseDetail> => {
  try {
    return await getLeaseDetail(...args);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      notFound();
    }
    throw error;
  }
};

const LeasePage = async ({ params }: PageProps<"/leases/[leaseId]">) => {
  const actor = await requireMemberPage();
  const { leaseId } = await params;
  const now = new Date();
  const detail = await loadLease(actor, leaseId, now);
  const labels = await leaseLabels(actor, detail.lease.id);
  if (!labels) {
    notFound();
  }

  // Display-only mirror of the service's cap (integer sen); the service
  // re-computes it under the lease lock and is what actually enforces it.
  const invoicedSen = detail.invoices.reduce((s, i) => s + i.amountSen, 0);
  const paidSen = detail.invoices.reduce((s, i) => s + i.paidSen, 0);
  const pendingSen = detail.payments
    .filter((p) => p.status === "pending_verification")
    .reduce((s, p) => s + p.amountSen, 0);
  const capSen = Math.max(0, invoicedSen - paidSen - pendingSen);
  const isManager = actor.role === "manager";

  return (
    <>
      <Link
        href="/leases"
        className={buttonVariants({
          variant: "ghost",
          size: "sm",
          className: "self-start",
        })}
      >
        <ArrowLeft data-icon="inline-start" />
        All leases
      </Link>
      <PageHeader
        title={`${labels.unitName} · ${labels.tenantName}`}
        description={`${formatCalendarDate(detail.lease.startDate)} – ${formatCalendarDate(detail.lease.endDate)} (inclusive) · ${labels.tenantEmail}`}
      />
      <LeaseSummary
        monthlyRentSen={detail.lease.monthlyRentSen}
        depositSen={detail.lease.depositSen}
        invoicedSen={invoicedSen}
        paidSen={paidSen}
        pendingSen={pendingSen}
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Invoices</h2>
        <InvoicesTable invoices={detail.invoices} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Payments</h2>
        {detail.payments.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="No payments yet"
            description="Payments recorded below, or paid online by the tenant, appear here."
          />
        ) : (
          <PaymentsTable payments={detail.payments} canDecide={isManager} />
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Record a payment</CardTitle>
          <CardDescription>
            Cash or bank transfer received for this lease. At most{" "}
            {formatSen(capSen)} can be recorded now.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RecordPaymentForm
            leaseId={detail.lease.id}
            defaultReceivedAt={toMalaysiaInputValue(now)}
            capLabel={formatSen(capSen)}
            isManager={isManager}
          />
        </CardContent>
      </Card>
    </>
  );
};

export default LeasePage;

import { ArrowLeft, HandCoins, Receipt, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/layout/empty-state";
import { SectionCard } from "@/components/layout/section-card";
import { InvoicesTable } from "@/components/leases/invoices-table";
import { LeaseSummary } from "@/components/leases/lease-summary";
import { PaymentsTable } from "@/components/payments/payments-table";
import { RecordPaymentForm } from "@/components/payments/record-payment-form";
import { buttonVariants } from "@/components/ui/button";
import { toMalaysiaInputValue } from "@/lib/dates";
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
          className: "-ml-2 self-start text-muted-foreground",
        })}
      >
        <ArrowLeft data-icon="inline-start" />
        All leases
      </Link>
      <LeaseSummary
        unitName={labels.unitName}
        tenantName={labels.tenantName}
        tenantEmail={labels.tenantEmail}
        startDate={detail.lease.startDate}
        endDate={detail.lease.endDate}
        monthlyRentSen={detail.lease.monthlyRentSen}
        depositSen={detail.lease.depositSen}
        invoicedSen={invoicedSen}
        paidSen={paidSen}
        pendingSen={pendingSen}
      />

      <div className="grid items-start gap-6 lg:grid-cols-3 2xl:grid-cols-4">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2 2xl:col-span-3">
          <SectionCard
            icon={Receipt}
            title="Invoices"
            description={`${detail.invoices.length} ${detail.invoices.length === 1 ? "invoice" : "invoices"} · due dates in Malaysia time`}
          >
            {detail.invoices.length === 0 ? (
              <EmptyState bare icon={Receipt} title="No invoices" />
            ) : (
              <InvoicesTable invoices={detail.invoices} />
            )}
          </SectionCard>

          <SectionCard
            icon={Wallet}
            tone="emerald"
            title="Payments"
            description={
              isManager
                ? "Approve or reject pending payments; void approved ones."
                : "Cash, bank transfers and online payments for this lease."
            }
          >
            {detail.payments.length === 0 ? (
              <EmptyState
                bare
                icon={Wallet}
                title="No payments yet"
                description="Payments recorded here, or paid online by the tenant, appear in this list."
              />
            ) : (
              <PaymentsTable payments={detail.payments} canDecide={isManager} />
            )}
          </SectionCard>
        </div>

        <SectionCard
          icon={HandCoins}
          tone="teal"
          title="Record a payment"
          description="Cash or bank transfer received for this lease."
          className="lg:sticky lg:top-8"
        >
          <div className="flex flex-col gap-5 p-5">
            <div className="flex items-center justify-between gap-3 rounded-xl bg-secondary/60 px-4 py-3 ring-1 ring-primary/10">
              <span className="text-sm text-secondary-foreground">
                Can be recorded now
              </span>
              <span className="font-semibold text-secondary-foreground tabular-nums">
                {formatSen(capSen)}
              </span>
            </div>
            <RecordPaymentForm
              leaseId={detail.lease.id}
              defaultReceivedAt={toMalaysiaInputValue(now)}
              capLabel={formatSen(capSen)}
              isManager={isManager}
            />
          </div>
        </SectionCard>
      </div>
    </>
  );
};

export default LeasePage;

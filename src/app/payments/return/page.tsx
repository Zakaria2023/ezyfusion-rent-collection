import {
  Building2,
  CheckCircle2,
  Clock,
  type LucideIcon,
  RefreshCw,
  XCircle,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { IconChip, type IconChipTone } from "@/components/layout/icon-chip";
import { BillStatusBadge } from "@/components/layout/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { formatMalaysiaDateTime } from "@/lib/dates";
import { GATEWAY_BILL_STATUSES, type GatewayBillStatus } from "@/lib/enums";
import { formatSen } from "@/lib/money";
import { getActor } from "@/lib/server/auth";
import { getBillForActor } from "@/lib/server/services/gateway";
import { BillStatusPoll } from "./bill-status-poll";

type StatusView = {
  icon: LucideIcon;
  tone: IconChipTone;
  title: string;
  description: string;
};

export const metadata: Metadata = { title: "Payment status" };

// Always read the bill fresh: its status can change at any moment (webhook).
export const dynamic = "force-dynamic";

const BILL_ID_PATTERN = /^bill_[0-9a-f]{32}$/;

const STATUS_VIEWS: Record<GatewayBillStatus, StatusView> = {
  pending: {
    icon: Clock,
    tone: "amber",
    title: "Waiting for the gateway",
    description:
      "We have not received confirmation from the gateway yet — refresh in a moment.",
  },
  paid: {
    icon: CheckCircle2,
    tone: "emerald",
    title: "Payment received",
    description: "The gateway confirmed your payment. Thank you.",
  },
  failed: {
    icon: XCircle,
    tone: "rose",
    title: "Payment failed",
    description:
      "The gateway reported that this payment did not go through. You can try again from your lease.",
  },
};

const isBillStatus = (status: string): status is GatewayBillStatus =>
  GATEWAY_BILL_STATUSES.some((known) => known === status);

// The gateway sends the tenant here as /payments/return?bill_id=...&paid=true.
// This page is READ-ONLY: it shows the bill's real status from the database
// and never settles, fails or otherwise changes anything. The `paid` query
// parameter is ignored entirely — anyone can type ?paid=true, and only the
// signed webhook (POST /api/webhooks/gateway) may settle a bill.
const PaymentReturnPage = async ({
  searchParams,
}: PageProps<"/payments/return">) => {
  const { bill_id: billIdParam } = await searchParams;
  const actor = await getActor();
  if (!actor) {
    redirect("/login");
  }
  const billId = typeof billIdParam === "string" ? billIdParam : "";
  // Same 404 for a malformed id, an unknown bill, and someone else's bill.
  const bill = BILL_ID_PATTERN.test(billId)
    ? await getBillForActor(actor, billId)
    : null;
  if (!bill) {
    notFound();
  }

  const status = isBillStatus(bill.status) ? bill.status : "pending";
  const view = STATUS_VIEWS[status];
  const back =
    actor.kind === "tenant"
      ? { href: "/portal", label: "Back to my lease" }
      : { href: "/dashboard", label: "Back to the dashboard" };
  const refreshHref = `/payments/return?bill_id=${encodeURIComponent(bill.id)}`;

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-linear-to-b from-secondary/60 to-background p-4 sm:p-8">
      <Link
        href={back.href}
        className="flex items-center gap-3 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <IconChip icon={Building2} tone="brand" size="sm" />
        <span className="font-semibold tracking-tight">Rent Collection</span>
      </Link>
      <section className="w-full max-w-md overflow-hidden rounded-3xl border bg-card shadow-xl shadow-primary/5">
        <div className="flex flex-col items-center gap-4 px-6 pt-8 pb-6 text-center">
          <IconChip
            icon={view.icon}
            tone={view.tone}
            size="lg"
            className="rounded-full"
          />
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {view.title}
            </h1>
            <p className="text-sm text-muted-foreground">{view.description}</p>
          </div>
          <BillStatusPoll isPending={bill.status === "pending"} />
        </div>
        <dl className="mx-6 mb-6 flex flex-col divide-y rounded-2xl bg-muted/50 px-4 text-sm ring-1 ring-border">
          <div className="flex items-center justify-between gap-4 py-3">
            <dt className="text-muted-foreground">Amount</dt>
            <dd className="text-base font-semibold tabular-nums">
              {formatSen(bill.amountSen)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-3">
            <dt className="text-muted-foreground">Status</dt>
            <dd>
              <BillStatusBadge status={status} />
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-3">
            <dt className="shrink-0 text-muted-foreground">Bill id</dt>
            <dd className="min-w-0 truncate font-mono text-xs" title={bill.id}>
              {bill.id}
            </dd>
          </div>
          {bill.paidAt ? (
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="text-muted-foreground">Paid at (MYT)</dt>
              <dd className="tabular-nums">
                {formatMalaysiaDateTime(bill.paidAt)}
              </dd>
            </div>
          ) : null}
        </dl>
        <div className="flex flex-col-reverse gap-2 border-t bg-muted/30 px-6 py-4 sm:flex-row sm:justify-end">
          <Link
            href={refreshHref}
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            <RefreshCw data-icon="inline-start" />
            Refresh
          </Link>
          <Link
            href={back.href}
            className={buttonVariants({
              size: "lg",
              className: "shadow-lg shadow-primary/25",
            })}
          >
            {back.label}
          </Link>
        </div>
      </section>
    </main>
  );
};

export default PaymentReturnPage;

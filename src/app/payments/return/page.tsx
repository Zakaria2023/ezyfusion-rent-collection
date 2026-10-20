import { CheckCircle2, Clock, XCircle, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatMalaysiaDateTime } from "@/lib/dates";
import { GATEWAY_BILL_STATUSES, type GatewayBillStatus } from "@/lib/enums";
import { formatSen } from "@/lib/money";
import { getActor } from "@/lib/server/auth";
import { getBillForActor } from "@/lib/server/services/gateway";
import { BillStatusPoll } from "./bill-status-poll";

type StatusView = { icon: LucideIcon; title: string; description: string };

export const metadata: Metadata = { title: "Payment status" };

// Always read the bill fresh: its status can change at any moment (webhook).
export const dynamic = "force-dynamic";

const BILL_ID_PATTERN = /^bill_[0-9a-f]{32}$/;

const STATUS_VIEWS: Record<GatewayBillStatus, StatusView> = {
  pending: {
    icon: Clock,
    title: "Waiting for the gateway",
    description:
      "We have not received confirmation from the gateway yet — refresh in a moment.",
  },
  paid: {
    icon: CheckCircle2,
    title: "Payment received",
    description: "The gateway confirmed your payment. Thank you.",
  },
  failed: {
    icon: XCircle,
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

  const view =
    STATUS_VIEWS[isBillStatus(bill.status) ? bill.status : "pending"];
  const Icon = view.icon;
  const back =
    actor.kind === "tenant"
      ? { href: "/portal", label: "Back to my lease" }
      : { href: "/dashboard", label: "Back to the dashboard" };
  const refreshHref = `/payments/return?bill_id=${encodeURIComponent(bill.id)}`;

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon className="size-5" aria-hidden />
            {view.title}
          </CardTitle>
          <CardDescription>{view.description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <dl className="grid grid-cols-3 gap-2 text-sm">
            <dt className="text-muted-foreground">Amount</dt>
            <dd className="col-span-2 font-medium tabular-nums">
              {formatSen(bill.amountSen)}
            </dd>
            <dt className="text-muted-foreground">Bill id</dt>
            <dd className="col-span-2 truncate font-mono text-xs">{bill.id}</dd>
            {bill.paidAt ? (
              <>
                <dt className="text-muted-foreground">Paid at</dt>
                <dd className="col-span-2">
                  {formatMalaysiaDateTime(bill.paidAt)} (Malaysia time)
                </dd>
              </>
            ) : null}
          </dl>
          <BillStatusPoll isPending={bill.status === "pending"} />
        </CardContent>
        <CardFooter className="gap-2">
          <Link
            href={refreshHref}
            className={buttonVariants({ variant: "outline" })}
          >
            Refresh
          </Link>
          <Link href={back.href} className={buttonVariants()}>
            {back.label}
          </Link>
        </CardFooter>
      </Card>
    </main>
  );
};

export default PaymentReturnPage;

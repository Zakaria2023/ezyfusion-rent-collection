import {
  Banknote,
  ExternalLink,
  Globe,
  Landmark,
  type LucideIcon,
} from "lucide-react";
import { PaymentStatusBadge } from "@/components/layout/status-badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMalaysiaDateTime } from "@/lib/dates";
import type { PaymentMethod, PaymentStatus } from "@/lib/enums";
import { formatSen } from "@/lib/money";
import { ApprovePaymentButton } from "./approve-payment-button";
import { RejectPaymentDialog } from "./reject-payment-dialog";
import { VoidPaymentDialog } from "./void-payment-dialog";

type PaymentRow = {
  id: string;
  amountSen: number;
  unappliedSen: number;
  method: PaymentMethod;
  status: PaymentStatus;
  receivedAt: string;
};

type PaymentsTableProps = {
  payments: readonly PaymentRow[];
  canDecide: boolean;
};

type PaymentActionsProps = { payment: PaymentRow };

const METHODS: Record<PaymentMethod, { label: string; icon: LucideIcon }> = {
  cash: { label: "Cash", icon: Banknote },
  bank_transfer: { label: "Bank transfer", icon: Landmark },
  online: { label: "Online", icon: Globe },
};

// Manager-only buttons. Hiding them is UX; the services refuse anyway.
const PaymentActions = ({ payment }: PaymentActionsProps) => {
  const amountLabel = formatSen(payment.amountSen);
  if (payment.status === "pending_verification") {
    return (
      <div className="flex justify-end gap-2">
        <ApprovePaymentButton paymentId={payment.id} />
        <RejectPaymentDialog paymentId={payment.id} amountLabel={amountLabel} />
      </div>
    );
  }
  if (payment.status === "approved") {
    return (
      <div className="flex justify-end">
        <VoidPaymentDialog paymentId={payment.id} amountLabel={amountLabel} />
      </div>
    );
  }
  return null;
};

export const PaymentsTable = ({ payments, canDecide }: PaymentsTableProps) => (
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Received (MYT)</TableHead>
        <TableHead>Method</TableHead>
        <TableHead className="text-right">Amount</TableHead>
        <TableHead className="text-right">Unapplied</TableHead>
        <TableHead>Status</TableHead>
        <TableHead>Slip</TableHead>
        {canDecide ? (
          <TableHead className="text-right">Actions</TableHead>
        ) : null}
      </TableRow>
    </TableHeader>
    <TableBody>
      {payments.map((payment) => {
        const { label, icon: MethodIcon } = METHODS[payment.method];
        return (
          <TableRow key={payment.id}>
            <TableCell className="tabular-nums">
              {formatMalaysiaDateTime(payment.receivedAt)}
            </TableCell>
            <TableCell>
              <span className="inline-flex items-center gap-2">
                <MethodIcon
                  className="size-4 text-muted-foreground"
                  aria-hidden
                />
                {label}
              </span>
            </TableCell>
            <TableCell className="text-right font-medium tabular-nums">
              {formatSen(payment.amountSen)}
            </TableCell>
            <TableCell className="text-right text-muted-foreground tabular-nums">
              {payment.unappliedSen > 0 ? formatSen(payment.unappliedSen) : "—"}
            </TableCell>
            <TableCell>
              <PaymentStatusBadge status={payment.status} />
            </TableCell>
            <TableCell>
              {payment.method === "bank_transfer" ? (
                <a
                  href={`/slips/${payment.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonVariants({ variant: "ghost", size: "sm" })}
                >
                  View slip
                  <ExternalLink data-icon="inline-end" aria-hidden />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
            {canDecide ? (
              <TableCell>
                <PaymentActions payment={payment} />
              </TableCell>
            ) : null}
          </TableRow>
        );
      })}
    </TableBody>
  </Table>
);

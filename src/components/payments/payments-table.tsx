import { ExternalLink } from "lucide-react";
import { PaymentStatusBadge } from "@/components/layout/status-badge";
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

const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  online: "Online",
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
  <div className="rounded-lg border">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Received (Malaysia time)</TableHead>
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
        {payments.map((payment) => (
          <TableRow key={payment.id}>
            <TableCell>{formatMalaysiaDateTime(payment.receivedAt)}</TableCell>
            <TableCell>{METHOD_LABELS[payment.method]}</TableCell>
            <TableCell className="text-right tabular-nums">
              {formatSen(payment.amountSen)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
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
                  className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
                >
                  View slip
                  <ExternalLink className="size-3.5" aria-hidden />
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
        ))}
      </TableBody>
    </Table>
  </div>
);

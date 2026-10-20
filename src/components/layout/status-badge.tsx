import { Ban } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { GatewayBillStatus } from "@/lib/enums";
import { cn } from "@/lib/utils";

type StatusVariant = "success" | "warning" | "danger" | "neutral" | "muted";

type InvoiceStatus = "paid" | "partially_paid" | "unpaid" | "overdue";

type PaymentStatus =
  "pending_verification" | "approved" | "rejected" | "voided";

type StatusStyle = { label: string; variant: StatusVariant };

type StatusPillProps = { style: StatusStyle };

type InvoiceStatusBadgeProps = { status: InvoiceStatus };

type PaymentStatusBadgeProps = { status: PaymentStatus };

type BillStatusBadgeProps = { status: GatewayBillStatus };

const invoiceStatusStyles: Record<InvoiceStatus, StatusStyle> = {
  paid: { label: "Paid", variant: "success" },
  partially_paid: { label: "Partially paid", variant: "warning" },
  unpaid: { label: "Unpaid", variant: "neutral" },
  overdue: { label: "Overdue", variant: "danger" },
};

const paymentStatusStyles: Record<PaymentStatus, StatusStyle> = {
  pending_verification: { label: "Pending verification", variant: "warning" },
  approved: { label: "Approved", variant: "success" },
  rejected: { label: "Rejected", variant: "danger" },
  voided: { label: "Voided", variant: "muted" },
};

const billStatusStyles: Record<GatewayBillStatus, StatusStyle> = {
  pending: { label: "Awaiting gateway", variant: "warning" },
  paid: { label: "Paid", variant: "success" },
  failed: { label: "Failed", variant: "danger" },
};

// Colour is never the only signal: every badge carries its text label, and
// voided adds an icon and a strike-through.
const StatusPill = ({ style: { label, variant } }: StatusPillProps) => (
  <Badge variant={variant} className="h-6 gap-1.5 px-2.5">
    {variant === "muted" ? (
      <Ban aria-hidden />
    ) : (
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
    )}
    <span className={cn(variant === "muted" && "line-through")}>{label}</span>
  </Badge>
);

export const InvoiceStatusBadge = ({ status }: InvoiceStatusBadgeProps) => (
  <StatusPill style={invoiceStatusStyles[status]} />
);

export const PaymentStatusBadge = ({ status }: PaymentStatusBadgeProps) => (
  <StatusPill style={paymentStatusStyles[status]} />
);

export const BillStatusBadge = ({ status }: BillStatusBadgeProps) => (
  <StatusPill style={billStatusStyles[status]} />
);

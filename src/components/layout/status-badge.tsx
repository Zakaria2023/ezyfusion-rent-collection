import { Badge } from "@/components/ui/badge";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

type InvoiceStatus = "paid" | "partially_paid" | "unpaid" | "overdue";

type PaymentStatus =
  "pending_verification" | "approved" | "rejected" | "voided";

type StatusStyle = { label: string; variant: BadgeVariant };

type InvoiceStatusBadgeProps = { status: InvoiceStatus };

type PaymentStatusBadgeProps = { status: PaymentStatus };

const invoiceStatusStyles: Record<InvoiceStatus, StatusStyle> = {
  paid: { label: "Paid", variant: "default" },
  partially_paid: { label: "Partially paid", variant: "secondary" },
  unpaid: { label: "Unpaid", variant: "outline" },
  overdue: { label: "Overdue", variant: "destructive" },
};

const paymentStatusStyles: Record<PaymentStatus, StatusStyle> = {
  pending_verification: { label: "Pending verification", variant: "secondary" },
  approved: { label: "Approved", variant: "default" },
  rejected: { label: "Rejected", variant: "destructive" },
  voided: { label: "Voided", variant: "outline" },
};

export const InvoiceStatusBadge = ({ status }: InvoiceStatusBadgeProps) => {
  const { label, variant } = invoiceStatusStyles[status];
  return <Badge variant={variant}>{label}</Badge>;
};

export const PaymentStatusBadge = ({ status }: PaymentStatusBadgeProps) => {
  const { label, variant } = paymentStatusStyles[status];
  return <Badge variant={variant}>{label}</Badge>;
};

// Every enum the app uses, mirrored by CHECK constraints in
// supabase/migrations (text + CHECK rather than Postgres enums).

export const MEMBER_ROLES = [
  "manager",
  "staff",
] as const satisfies readonly string[];
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const INVOICE_KINDS = [
  "deposit",
  "rent",
] as const satisfies readonly string[];

export const INVOICE_STATUSES = [
  "paid",
  "partially_paid",
  "unpaid",
  "overdue",
] as const satisfies readonly string[];

export const PAYMENT_METHODS = [
  "cash",
  "bank_transfer",
  "online",
] as const satisfies readonly string[];
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

// Methods staff and managers record by hand; online payments come only from
// the gateway webhook.
export const MANUAL_PAYMENT_METHODS = [
  "cash",
  "bank_transfer",
] as const satisfies readonly PaymentMethod[];
export type ManualPaymentMethod = (typeof MANUAL_PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = [
  "pending_verification",
  "approved",
  "rejected",
  "voided",
] as const satisfies readonly string[];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const GATEWAY_BILL_STATUSES = [
  "pending",
  "paid",
  "failed",
] as const satisfies readonly string[];
export type GatewayBillStatus = (typeof GATEWAY_BILL_STATUSES)[number];

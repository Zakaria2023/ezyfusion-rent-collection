import { z } from "zod";
import { invoiceStatus, type InvoiceStatus } from "@/lib/billing";
import { formatCalendarDate, todayInMalaysia } from "@/lib/dates";
import {
  GATEWAY_BILL_STATUSES,
  INVOICE_KINDS,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  type GatewayBillStatus,
  type PaymentMethod,
  type PaymentStatus,
} from "@/lib/enums";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

// The tenant portal reads straight from the Supabase Data API with the
// tenant's own access token (docs/TASK.md section 6): RLS limits every select
// to the tenant's own rows, so the filters below are for clarity, not
// security. Rows are untyped JSON, so each one is parsed with zod before use.

const sen = z
  .number()
  .int()
  .refine(Number.isSafeInteger, "amount is outside the safe integer range");
const calendarDate = z.iso.date();

const tenantRow = z.object({
  id: z.string(),
  full_name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
});

const leaseRow = z.object({
  id: z.string(),
  unit_id: z.string(),
  start_date: calendarDate,
  end_date: calendarDate,
  monthly_rent_sen: sen,
  deposit_sen: sen,
});

const unitRow = z.object({ id: z.string(), name: z.string() });

const invoiceRow = z.object({
  id: z.string(),
  lease_id: z.string(),
  kind: z.enum(INVOICE_KINDS),
  period_start: calendarDate.nullable(),
  period_end: calendarDate.nullable(),
  due_date: calendarDate,
  amount_sen: sen,
});

const allocationRow = z.object({ invoice_id: z.string(), amount_sen: sen });

const paymentRow = z.object({
  id: z.string(),
  lease_id: z.string(),
  amount_sen: sen,
  method: z.enum(PAYMENT_METHODS),
  status: z.enum(PAYMENT_STATUSES),
  received_at: z.string(),
});

const billRow = z.object({
  id: z.string(),
  lease_id: z.string(),
  amount_sen: sen,
  status: z.enum(GATEWAY_BILL_STATUSES),
  created_at: z.string(),
  paid_at: z.string().nullable(),
});

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  online: "Online",
};

type QueryResult = { data: unknown; error: { message: string } | null };

export type PortalTenant = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
};

export type PortalInvoice = {
  id: string;
  label: string; // "Deposit" or the rent period
  dueDate: string; // 'YYYY-MM-DD'
  amountSen: number;
  paidSen: number;
  status: InvoiceStatus;
};

export type PortalPayment = {
  id: string;
  receivedAt: string; // ISO instant
  method: PaymentMethod;
  amountSen: number;
  status: PaymentStatus;
};

export type PortalBill = {
  id: string;
  amountSen: number;
  status: GatewayBillStatus;
  createdAt: string; // ISO instant
};

export type PortalLease = {
  id: string;
  unitName: string;
  startDate: string;
  endDate: string;
  monthlyRentSen: number;
  depositSen: number;
  invoices: PortalInvoice[];
  payments: PortalPayment[];
  bills: PortalBill[];
  amountDueNowSen: number;
};

export type PortalData = {
  tenant: PortalTenant;
  leases: PortalLease[];
  today: string; // the Malaysia date the statuses were computed for
};

export const paymentMethodLabel = (method: PaymentMethod): string =>
  PAYMENT_METHOD_LABELS[method];

// Throws on a Data API error or a row that does not have the expected shape.
const rows = <T>(result: QueryResult, schema: z.ZodType<T>, what: string) => {
  if (result.error) {
    throw new Error(`Could not load ${what}: ${result.error.message}`);
  }
  const parsed = z.array(schema).safeParse(result.data ?? []);
  if (!parsed.success) {
    throw new Error(`Unexpected ${what} data from the server.`);
  }
  return parsed.data;
};

const groupBy = <T>(items: T[], key: (item: T) => string): Map<string, T[]> => {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const group = groups.get(key(item));
    if (group) {
      group.push(item);
    } else {
      groups.set(key(item), [item]);
    }
  }
  return groups;
};

const invoiceLabel = (invoice: z.infer<typeof invoiceRow>): string =>
  invoice.kind === "deposit" || !invoice.period_start || !invoice.period_end
    ? "Deposit"
    : `${formatCalendarDate(invoice.period_start)} – ${formatCalendarDate(invoice.period_end)}`;

/**
 * Loads everything the portal shows. `now` decides "today" (Malaysia date) for
 * invoice statuses and the amount due now, so call it only in the browser
 * after mount: the server never renders anything time-dependent.
 */
export const fetchPortalData = async (
  now: Date,
): Promise<PortalData | null> => {
  const supabase = createSupabaseBrowserClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    throw new Error("Your session has expired. Sign in again.");
  }

  const [tenant] = rows(
    await supabase
      .from("tenants")
      .select("id, full_name, email, phone")
      .eq("user_id", auth.user.id),
    tenantRow,
    "your profile",
  );
  if (!tenant) {
    return null;
  }

  const leases = rows(
    await supabase
      .from("leases")
      .select(
        "id, unit_id, start_date, end_date, monthly_rent_sen, deposit_sen",
      )
      .eq("tenant_id", tenant.id)
      .order("start_date", { ascending: false }),
    leaseRow,
    "leases",
  );
  const today = todayInMalaysia(now);
  const portalTenant: PortalTenant = {
    id: tenant.id,
    fullName: tenant.full_name,
    email: tenant.email,
    phone: tenant.phone,
  };
  if (leases.length === 0) {
    return { today, tenant: portalTenant, leases: [] };
  }
  const leaseIds = leases.map((lease) => lease.id);
  const unitIds = [...new Set(leases.map((lease) => lease.unit_id))];

  const [unitsResult, invoicesResult, paymentsResult, billsResult] =
    await Promise.all([
      supabase.from("units").select("id, name").in("id", unitIds),
      supabase
        .from("invoices")
        .select(
          "id, lease_id, kind, period_start, period_end, due_date, amount_sen",
        )
        .in("lease_id", leaseIds)
        .order("due_date")
        .order("period_index", { nullsFirst: true }),
      supabase
        .from("payments")
        .select("id, lease_id, amount_sen, method, status, received_at")
        .in("lease_id", leaseIds)
        .order("received_at", { ascending: false }),
      supabase
        .from("gateway_bills")
        .select("id, lease_id, amount_sen, status, created_at, paid_at")
        .in("lease_id", leaseIds)
        .order("created_at", { ascending: false }),
    ]);
  const units = rows(unitsResult, unitRow, "units");
  const invoices = rows(invoicesResult, invoiceRow, "invoices");
  const payments = rows(paymentsResult, paymentRow, "payments");
  const bills = rows(billsResult, billRow, "online payments");

  // Allocations exist only for approved payments (voids delete them), so
  // paid = the sum of an invoice's allocations — the same rule the server uses.
  const allocations = rows(
    await supabase
      .from("payment_allocations")
      .select("invoice_id, amount_sen")
      .in(
        "invoice_id",
        invoices.map((invoice) => invoice.id),
      ),
    allocationRow,
    "payment allocations",
  );
  const paidByInvoice = new Map<string, number>();
  for (const allocation of allocations) {
    paidByInvoice.set(
      allocation.invoice_id,
      (paidByInvoice.get(allocation.invoice_id) ?? 0) + allocation.amount_sen,
    );
  }

  const unitNames = new Map(units.map((unit) => [unit.id, unit.name]));
  const invoicesByLease = groupBy(invoices, (invoice) => invoice.lease_id);
  const paymentsByLease = groupBy(payments, (payment) => payment.lease_id);
  const billsByLease = groupBy(bills, (bill) => bill.lease_id);

  return {
    today,
    tenant: portalTenant,
    leases: leases.map((lease) => {
      const leaseInvoices = (invoicesByLease.get(lease.id) ?? []).map(
        (invoice): PortalInvoice => {
          const paidSen = paidByInvoice.get(invoice.id) ?? 0;
          return {
            id: invoice.id,
            label: invoiceLabel(invoice),
            dueDate: invoice.due_date,
            amountSen: invoice.amount_sen,
            paidSen,
            status: invoiceStatus(
              {
                dueDate: invoice.due_date,
                amountSen: invoice.amount_sen,
                paidSen,
              },
              now,
            ),
          };
        },
      );
      // Same definition as the server's gateway bill amount: the unpaid part
      // of every invoice due on or before today's Malaysia date.
      // 'YYYY-MM-DD' strings compare correctly as text.
      const amountDueNowSen = leaseInvoices
        .filter((invoice) => invoice.dueDate <= today)
        .reduce(
          (sum, invoice) =>
            sum + Math.max(invoice.amountSen - invoice.paidSen, 0),
          0,
        );
      return {
        id: lease.id,
        unitName: unitNames.get(lease.unit_id) ?? "Unit",
        startDate: lease.start_date,
        endDate: lease.end_date,
        monthlyRentSen: lease.monthly_rent_sen,
        depositSen: lease.deposit_sen,
        invoices: leaseInvoices,
        payments: (paymentsByLease.get(lease.id) ?? []).map((payment) => ({
          id: payment.id,
          receivedAt: payment.received_at,
          method: payment.method,
          amountSen: payment.amount_sen,
          status: payment.status,
        })),
        bills: (billsByLease.get(lease.id) ?? []).map((bill) => ({
          id: bill.id,
          amountSen: bill.amount_sen,
          status: bill.status,
          createdAt: bill.created_at,
        })),
        amountDueNowSen,
      };
    }),
  };
};

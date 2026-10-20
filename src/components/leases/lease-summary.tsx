import {
  Building2,
  CalendarRange,
  CheckCircle2,
  Clock,
  type LucideIcon,
  Mail,
  Receipt,
  Scale,
  User,
} from "lucide-react";
import { IconChip, type IconChipTone } from "@/components/layout/icon-chip";
import { formatCalendarDate } from "@/lib/dates";
import { formatSen } from "@/lib/money";

type LeaseSummaryProps = {
  unitName: string;
  tenantName: string;
  tenantEmail: string;
  startDate: string;
  endDate: string;
  monthlyRentSen: number;
  depositSen: number;
  invoicedSen: number;
  paidSen: number;
  pendingSen: number;
};

type StatTileProps = {
  icon: LucideIcon;
  tone: IconChipTone;
  label: string;
  value: string;
};

type MetaProps = { icon: LucideIcon; children: string };

const StatTile = ({ icon, tone, label, value }: StatTileProps) => (
  <div className="flex flex-col gap-2 bg-card px-5 py-4">
    <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
      <IconChip icon={icon} tone={tone} size="sm" />
      {label}
    </dt>
    <dd className="truncate text-lg font-semibold tabular-nums">{value}</dd>
  </div>
);

const Meta = ({ icon: Icon, children }: MetaProps) => (
  <span className="inline-flex items-center gap-1.5">
    <Icon className="size-4 shrink-0" aria-hidden />
    {children}
  </span>
);

// The lease page header: who, where, when, and the money at a glance.
export const LeaseSummary = ({
  unitName,
  tenantName,
  tenantEmail,
  startDate,
  endDate,
  monthlyRentSen,
  depositSen,
  invoicedSen,
  paidSen,
  pendingSen,
}: LeaseSummaryProps) => {
  const outstandingSen = invoicedSen - paidSen;

  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-sm shadow-primary/5">
      <div
        className="h-1.5 bg-linear-to-r from-indigo-600 via-violet-600 to-teal-500"
        aria-hidden
      />
      <div className="flex flex-col gap-6 p-5 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          <IconChip icon={Building2} tone="brand" size="md" />
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-col">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Lease
              </p>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {unitName}
              </h1>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
              <Meta icon={User}>{tenantName}</Meta>
              <Meta icon={Mail}>{tenantEmail}</Meta>
              <Meta icon={CalendarRange}>
                {`${formatCalendarDate(startDate)} – ${formatCalendarDate(endDate)} (inclusive)`}
              </Meta>
            </div>
          </div>
        </div>
        <dl className="grid shrink-0 grid-cols-2 gap-x-8 rounded-xl bg-muted/50 px-4 py-3 ring-1 ring-border">
          <div className="flex flex-col gap-1">
            <dt className="text-xs text-muted-foreground">Monthly rent</dt>
            <dd className="font-semibold tabular-nums">
              {formatSen(monthlyRentSen)}
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-xs text-muted-foreground">Deposit</dt>
            <dd className="font-semibold tabular-nums">
              {depositSen > 0 ? formatSen(depositSen) : "None"}
            </dd>
          </div>
        </dl>
      </div>
      <dl className="grid grid-cols-1 gap-px border-t bg-border sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={Receipt}
          tone="primary"
          label="Invoiced"
          value={formatSen(invoicedSen)}
        />
        <StatTile
          icon={CheckCircle2}
          tone="emerald"
          label="Paid"
          value={formatSen(paidSen)}
        />
        <StatTile
          icon={Scale}
          tone={outstandingSen > 0 ? "rose" : "emerald"}
          label="Outstanding"
          value={formatSen(outstandingSen)}
        />
        <StatTile
          icon={Clock}
          tone="amber"
          label="Pending approval"
          value={formatSen(pendingSen)}
        />
      </dl>
    </section>
  );
};

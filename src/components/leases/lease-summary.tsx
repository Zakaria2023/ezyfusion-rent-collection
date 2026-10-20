import { Card, CardContent } from "@/components/ui/card";
import { formatSen } from "@/lib/money";

type LeaseSummaryProps = {
  monthlyRentSen: number;
  depositSen: number;
  invoicedSen: number;
  paidSen: number;
  pendingSen: number;
};

type StatProps = { label: string; value: string };

const Stat = ({ label, value }: StatProps) => (
  <div className="flex flex-col gap-1">
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className="font-medium tabular-nums">{value}</span>
  </div>
);

export const LeaseSummary = ({
  monthlyRentSen,
  depositSen,
  invoicedSen,
  paidSen,
  pendingSen,
}: LeaseSummaryProps) => (
  <Card>
    <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      <Stat label="Monthly rent" value={formatSen(monthlyRentSen)} />
      <Stat
        label="Deposit"
        value={depositSen > 0 ? formatSen(depositSen) : "None"}
      />
      <Stat label="Invoiced" value={formatSen(invoicedSen)} />
      <Stat label="Paid" value={formatSen(paidSen)} />
      <Stat label="Balance" value={formatSen(invoicedSen - paidSen)} />
      <Stat label="Pending approval" value={formatSen(pendingSen)} />
    </CardContent>
  </Card>
);

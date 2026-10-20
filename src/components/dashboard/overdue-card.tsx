import { AlertTriangle, ArrowRight } from "lucide-react";
import Link from "next/link";
import { StatCard } from "./stat-card";

type OverdueCardProps = { count: number; today: string };

export const OverdueCard = ({ count, today }: OverdueCardProps) => (
  <StatCard
    icon={AlertTriangle}
    tone="rose"
    label="Overdue invoices"
    value={String(count)}
    valueClassName={count > 0 ? "text-rose-600 dark:text-rose-400" : undefined}
    hint={
      <div className="flex flex-col gap-2">
        <span>
          Not fully paid and due before today ({today}, Malaysia time).
        </span>
        <Link
          href="/leases"
          className="inline-flex items-center gap-1 self-start font-medium text-primary underline-offset-4 hover:underline"
        >
          View leases
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    }
  />
);

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { IconChip, type IconChipTone } from "@/components/layout/icon-chip";
import { cn } from "@/lib/utils";

type StatCardProps = {
  icon: LucideIcon;
  tone: IconChipTone;
  label: string;
  value: string;
  hint?: ReactNode;
  valueClassName?: string;
};

export const StatCard = ({
  icon,
  tone,
  label,
  value,
  hint,
  valueClassName,
}: StatCardProps) => (
  <section className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm shadow-primary/5">
    <div className="flex items-start justify-between gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">{label}</h2>
      <IconChip icon={icon} tone={tone} size="md" />
    </div>
    <p
      className={cn(
        "text-3xl font-semibold tracking-tight tabular-nums",
        valueClassName,
      )}
    >
      {value}
    </p>
    {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
  </section>
);

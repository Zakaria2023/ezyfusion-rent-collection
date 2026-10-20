import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { IconChip, type IconChipTone } from "./icon-chip";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  tone?: IconChipTone;
  bare?: boolean; // inside a card already: no border of its own
};

export const EmptyState = ({
  icon,
  title,
  description,
  action,
  tone = "primary",
  bare = false,
}: EmptyStateProps) => (
  <div
    className={cn(
      "flex flex-col items-center justify-center gap-3 px-6 py-12 text-center",
      !bare && "rounded-2xl border border-dashed bg-card/60",
    )}
  >
    <IconChip icon={icon} tone={tone} size="md" className="mb-1" />
    <p className="text-base font-semibold tracking-tight">{title}</p>
    {description ? (
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
    ) : null}
    {action ? <div className="mt-2">{action}</div> : null}
  </div>
);

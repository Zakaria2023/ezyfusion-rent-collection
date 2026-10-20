import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type IconChipTone =
  "brand" | "primary" | "rose" | "emerald" | "amber" | "teal" | "muted";

type IconChipSize = "sm" | "md" | "lg";

type IconChipProps = {
  icon: LucideIcon;
  tone?: IconChipTone;
  size?: IconChipSize;
  className?: string;
};

const TONES: Record<IconChipTone, string> = {
  brand:
    "bg-linear-to-br from-indigo-600 to-teal-500 text-white shadow-lg shadow-primary/30",
  primary: "bg-primary/10 text-primary ring-1 ring-primary/15",
  rose: "bg-rose-50 text-rose-600 ring-1 ring-rose-100 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/25",
  emerald:
    "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/25",
  amber:
    "bg-amber-50 text-amber-600 ring-1 ring-amber-100 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/25",
  teal: "bg-teal-50 text-teal-600 ring-1 ring-teal-100 dark:bg-teal-500/15 dark:text-teal-300 dark:ring-teal-500/25",
  muted: "bg-muted text-muted-foreground ring-1 ring-border",
};

const SIZES: Record<IconChipSize, { box: string; icon: string }> = {
  sm: { box: "size-8 rounded-lg", icon: "size-4" },
  md: { box: "size-10 rounded-xl", icon: "size-5" },
  lg: { box: "size-16 rounded-2xl", icon: "size-8" },
};

export const IconChip = ({
  icon: Icon,
  tone = "primary",
  size = "md",
  className,
}: IconChipProps) => (
  <span
    className={cn(
      "flex shrink-0 items-center justify-center",
      SIZES[size].box,
      TONES[tone],
      className,
    )}
    aria-hidden
  >
    <Icon className={SIZES[size].icon} />
  </span>
);

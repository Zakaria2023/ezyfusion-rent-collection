import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { IconChip, type IconChipTone } from "./icon-chip";

type SectionCardProps = {
  title: string;
  description?: ReactNode;
  icon: LucideIcon;
  tone?: IconChipTone;
  action?: ReactNode;
  headingLevel?: "h2" | "h3";
  className?: string;
  children: ReactNode;
};

// The app's standard card: icon chip + heading strip, content below. Tables
// go straight into children and run edge to edge.
export const SectionCard = ({
  title,
  description,
  icon,
  tone = "primary",
  action,
  headingLevel: Heading = "h2",
  className,
  children,
}: SectionCardProps) => (
  <section
    className={cn(
      "overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-sm shadow-primary/5",
      className,
    )}
  >
    <div className="flex flex-wrap items-center gap-3 border-b px-5 py-4">
      <IconChip icon={icon} tone={tone} size="sm" />
      <div className="flex min-w-0 flex-1 flex-col">
        <Heading className="text-base leading-snug font-semibold tracking-tight">
          {title}
        </Heading>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex items-center gap-2">{action}</div> : null}
    </div>
    {children}
  </section>
);

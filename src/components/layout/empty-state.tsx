import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
};

export const EmptyState = ({
  icon: Icon,
  title,
  description,
  action,
}: EmptyStateProps) => (
  <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center">
    <div className="flex size-10 items-center justify-center rounded-full bg-muted">
      <Icon className="size-5 text-muted-foreground" aria-hidden />
    </div>
    <p className="font-medium">{title}</p>
    {description ? (
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
    ) : null}
    {action ? <div className="mt-2">{action}</div> : null}
  </div>
);

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { IconChip } from "./icon-chip";

type PageHeaderProps = {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: LucideIcon;
};

export const PageHeader = ({
  title,
  description,
  actions,
  icon,
}: PageHeaderProps) => (
  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
    <div className="flex items-center gap-4">
      {icon ? <IconChip icon={icon} tone="brand" size="md" /> : null}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {title}
        </h1>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
    </div>
    {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
  </div>
);

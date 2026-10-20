import { Briefcase, ShieldCheck, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type ShellRole = "manager" | "staff" | "tenant";

type RolePillProps = { role: ShellRole };

const ROLES = {
  manager: { label: "Manager", icon: ShieldCheck },
  staff: { label: "Staff", icon: Briefcase },
  tenant: { label: "Tenant", icon: User },
} as const;

export const RolePill = ({ role }: RolePillProps) => {
  const { label, icon: Icon } = ROLES[role];
  return (
    <Badge variant="info" className="gap-1">
      <Icon aria-hidden />
      {label}
    </Badge>
  );
};

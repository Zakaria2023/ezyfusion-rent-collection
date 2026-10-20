import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type OverdueCardProps = { count: number; today: string };

export const OverdueCard = ({ count, today }: OverdueCardProps) => (
  <Card>
    <CardHeader>
      <CardDescription className="flex items-center gap-2">
        <AlertTriangle className="size-4" aria-hidden />
        Overdue invoices
      </CardDescription>
      <CardTitle
        className={cn(
          "text-4xl font-semibold tabular-nums",
          count > 0 && "text-destructive",
        )}
      >
        {count}
      </CardTitle>
    </CardHeader>
    <CardContent className="text-sm text-muted-foreground">
      Not fully paid and due before today ({today}, Malaysia time).{" "}
      <Link href="/leases" className="underline underline-offset-4">
        View leases
      </Link>
    </CardContent>
  </Card>
);

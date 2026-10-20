import { FileQuestion } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/layout/empty-state";
import { buttonVariants } from "@/components/ui/button";

// Same page for "does not exist" and "belongs to another organization":
// the UI must not reveal that someone else's lease exists.
const LeaseNotFound = () => (
  <EmptyState
    icon={FileQuestion}
    title="Lease not found"
    description="It does not exist, or it is not in your organization."
    action={
      <Link href="/leases" className={buttonVariants({ variant: "outline" })}>
        Back to leases
      </Link>
    }
  />
);

export default LeaseNotFound;

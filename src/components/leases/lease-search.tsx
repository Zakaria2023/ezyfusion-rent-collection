import { Search } from "lucide-react";
import Form from "next/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type LeaseSearchProps = { q: string };

// A GET form: the query lives in the URL (?q=), so search is server-side,
// shareable and survives reloads. next/form navigates client-side, and a new
// search drops ?page because only the form's fields are submitted.
export const LeaseSearch = ({ q }: LeaseSearchProps) => (
  <Form
    action="/leases"
    className="flex w-full gap-2 sm:max-w-md"
    role="search"
  >
    <div className="relative flex-1">
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        name="q"
        type="search"
        defaultValue={q}
        placeholder="Search by unit or tenant"
        aria-label="Search leases by unit or tenant"
        className="h-9 pl-9"
      />
    </div>
    <Button type="submit" variant="secondary" size="lg">
      Search
    </Button>
  </Form>
);

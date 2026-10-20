import { Search } from "lucide-react";
import Form from "next/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type LeaseSearchProps = { q: string };

// A GET form: the query lives in the URL (?q=), so search is server-side,
// shareable and survives reloads. next/form navigates client-side, and a new
// search drops ?page because only the form's fields are submitted.
export const LeaseSearch = ({ q }: LeaseSearchProps) => (
  <Form action="/leases" className="flex w-full max-w-md gap-2" role="search">
    <Input
      name="q"
      type="search"
      defaultValue={q}
      placeholder="Search by unit or tenant"
      aria-label="Search leases by unit or tenant"
    />
    <Button type="submit" variant="outline">
      <Search data-icon="inline-start" />
      Search
    </Button>
  </Form>
);

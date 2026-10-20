import { requireActor } from "@/lib/server/auth";
import { handle, json, readJsonBody } from "@/lib/server/http";
import { createLease } from "@/lib/server/services/leases";

// Managers create a lease and its invoices. 401 no login, 403 not a manager,
// 400 invalid input, 404 unit/tenant not in the manager's org, 409 overlap.
export const POST = handle(async (req) => {
  const actor = await requireActor(req);
  const lease = await createLease(actor, await readJsonBody(req));
  return json(lease, 201);
});

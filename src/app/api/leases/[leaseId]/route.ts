import { requireActor } from "@/lib/server/auth";
import { handle, json } from "@/lib/server/http";
import { getLeaseDetail } from "@/lib/server/services/leases";

type Context = { params: Promise<{ leaseId: string }> };

// Staff, managers and the lease's own tenant. 401 no login, 404 not visible.
export const GET = handle<Context>(async (req, ctx) => {
  const actor = await requireActor(req);
  const { leaseId } = await ctx.params;
  return json(await getLeaseDetail(actor, leaseId));
});

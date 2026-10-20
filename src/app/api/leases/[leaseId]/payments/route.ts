import { requireActor } from "@/lib/server/auth";
import { handle, json, readJsonBody } from "@/lib/server/http";
import { recordPayment } from "@/lib/server/services/payments";

type Context = { params: Promise<{ leaseId: string }> };

// Staff and managers record cash / bank transfer. 401 no login, 404 lease not
// visible, 403 tenant, 400 invalid input, 422 over the cap.
export const POST = handle<Context>(async (req, ctx) => {
  const actor = await requireActor(req);
  const { leaseId } = await ctx.params;
  const payment = await recordPayment(actor, leaseId, await readJsonBody(req));
  return json(payment, 201);
});

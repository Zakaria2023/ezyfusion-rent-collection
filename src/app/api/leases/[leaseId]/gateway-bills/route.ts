import { requireActor } from "@/lib/server/auth";
import { handle, json } from "@/lib/server/http";
import { createGatewayBill } from "@/lib/server/services/gateway";

type Context = { params: Promise<{ leaseId: string }> };

// The lease's own tenant opens a gateway bill for what is due now.
// 401 no login, 404 lease not visible, 403 staff/manager, 422 nothing due.
export const POST = handle<Context>(async (req, ctx) => {
  const actor = await requireActor(req);
  const { leaseId } = await ctx.params;
  const bill = await createGatewayBill(actor, leaseId);
  return json(bill, 201);
});

import { requireActor } from "@/lib/server/auth";
import { handle, json } from "@/lib/server/http";
import { approvePayment } from "@/lib/server/services/payments";

type Context = { params: Promise<{ paymentId: string }> };

// Managers only. 401, 404 not visible, 403 role, 409 not pending, 422 over balance.
export const POST = handle<Context>(async (req, ctx) => {
  const actor = await requireActor(req);
  const { paymentId } = await ctx.params;
  return json(await approvePayment(actor, paymentId));
});

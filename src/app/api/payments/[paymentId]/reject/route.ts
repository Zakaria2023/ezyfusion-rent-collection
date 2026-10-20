import { requireActor } from "@/lib/server/auth";
import { handle, json, readJsonBody } from "@/lib/server/http";
import { rejectPayment } from "@/lib/server/services/payments";

type Context = { params: Promise<{ paymentId: string }> };

// Managers only. 401, 404 not visible, 403 role, 400 reason, 409 not pending.
export const POST = handle<Context>(async (req, ctx) => {
  const actor = await requireActor(req);
  const { paymentId } = await ctx.params;
  return json(await rejectPayment(actor, paymentId, await readJsonBody(req)));
});

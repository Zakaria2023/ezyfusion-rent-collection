import { NextResponse } from "next/server";
import { requireActor } from "@/lib/server/auth";
import { handle, notFound } from "@/lib/server/http";
import { paymentSlipUrl } from "@/lib/server/services/payments";

export const dynamic = "force-dynamic";

/**
 * GET /slips/:paymentId -> 302 to a 60-second signed URL for the slip.
 * A plain link target (opens in a new tab, no popup blocker issues), so the
 * signed URL is minted only when someone actually clicks. paymentSlipUrl
 * authorizes: other org / unknown -> 404, tenant -> 403.
 */
export const GET = handle<RouteContext<"/slips/[paymentId]">>(
  async (req, ctx) => {
    const actor = await requireActor(req);
    const { paymentId } = await ctx.params;
    const url = await paymentSlipUrl(actor, paymentId);
    if (!url) {
      throw notFound();
    }
    const response = NextResponse.redirect(url, 302);
    // The signed URL is a short-lived credential: never cache the redirect.
    response.headers.set("Cache-Control", "no-store");
    return response;
  },
);

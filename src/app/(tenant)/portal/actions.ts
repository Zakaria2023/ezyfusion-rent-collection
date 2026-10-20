"use server";

import { z } from "zod";
import { getActor } from "@/lib/server/auth";
import { HttpError } from "@/lib/server/http";
import { createGatewayBill } from "@/lib/server/services/gateway";

export type PayNowResult =
  | { ok: true; billId: string; amountSen: number }
  | { ok: false; error: string };

const leaseIdSchema = z.guid("Invalid lease.");

// Pay now. Authorization lives in createGatewayBill (the same service as
// POST /api/leases/:leaseId/gateway-bills): the lease must be visible to the
// caller (else 404) and the caller must be its tenant (else 403). The amount
// is computed on the server under the lease lock — nothing from the browser
// but the lease id is trusted.
export const createPayNowBill = async (
  leaseId: unknown,
): Promise<PayNowResult> => {
  const parsed = leaseIdSchema.safeParse(leaseId);
  if (!parsed.success) {
    return { ok: false, error: "Invalid lease." };
  }
  const actor = await getActor();
  if (!actor) {
    return { ok: false, error: "Your session has expired. Sign in again." };
  }
  try {
    const bill = await createGatewayBill(actor, parsed.data);
    return { ok: true, billId: bill.billId, amountSen: bill.amountSen };
  } catch (error) {
    if (error instanceof HttpError) {
      if (error.status === 422) {
        return { ok: false, error: "Nothing is due right now." };
      }
      if (error.status === 404) {
        return { ok: false, error: "Lease not found." };
      }
      if (error.status === 403) {
        return { ok: false, error: "Only the lease's tenant can pay online." };
      }
      return { ok: false, error: error.message };
    }
    console.error(
      "Pay now failed:",
      error instanceof Error ? error.message : "non-Error thrown",
    );
    return { ok: false, error: "Could not start the payment. Try again." };
  }
};

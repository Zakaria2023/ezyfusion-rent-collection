"use server";

import { revalidatePath } from "next/cache";
import { createLease } from "@/lib/server/services/leases";
import {
  actorOrFail,
  fail,
  failFromError,
  isFailure,
  type ActionResult,
} from "../../action-result";
import {
  leaseFormSchema,
  toCreateLeaseBody,
  type LeaseFormInput,
} from "./validation";

type CreateLeaseResult = ActionResult<{ id: string }>;

/**
 * Manager only — enforced by createLease (403 for staff, 404 for a unit or
 * tenant of another organization, 409 when the unit's dates overlap).
 * Returns the id instead of redirecting so the client can toast first.
 */
export const createLeaseAction = async (
  input: LeaseFormInput,
): Promise<CreateLeaseResult> => {
  const actor = await actorOrFail();
  if (isFailure(actor)) {
    return actor;
  }
  const parsed = leaseFormSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid lease.");
  }
  try {
    const { id } = await createLease(actor, toCreateLeaseBody(parsed.data));
    revalidatePath("/leases");
    revalidatePath("/dashboard");
    return { ok: true, id };
  } catch (error) {
    return failFromError(error);
  }
};

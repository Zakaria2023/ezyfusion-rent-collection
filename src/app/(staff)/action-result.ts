import "server-only";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { formatSen } from "@/lib/money";
import { getActor, type Actor } from "@/lib/server/auth";
import { HttpError } from "@/lib/server/http";

// Server Action plumbing for the staff UI. Services throw HttpError (with the
// same 401/403/404/409/422 the HTTP API returns) or ZodError for bad input;
// here they become a typed result the client hook turns into a toast.

export type ActionFailure = { ok: false; error: string };

export type ActionResult<T extends object = object> =
  ({ ok: true } & T) | ActionFailure;

const SESSION_EXPIRED = "Your session has expired. Sign in again.";

export const fail = (error: string): ActionFailure => ({ ok: false, error });

/** The signed-in actor, or a failure result (never trust the page that rendered the form). */
export const actorOrFail = async (): Promise<Actor | ActionFailure> => {
  const actor = await getActor();
  return actor ?? fail(SESSION_EXPIRED);
};

export const isFailure = (value: unknown): value is ActionFailure =>
  typeof value === "object" &&
  value !== null &&
  "ok" in value &&
  value.ok === false;

/** Maps whatever a service threw to a message safe to show in a toast. */
export const failFromError = (error: unknown): ActionFailure => {
  // redirect()/notFound() are control flow, not errors.
  unstable_rethrow(error);
  if (error instanceof HttpError) {
    if (error.status === 401) {
      return fail(SESSION_EXPIRED);
    }
    if (error.status === 403) {
      return fail("Your role is not allowed to do this.");
    }
    if (error.status === 404) {
      return fail("Not found. It may have been removed, or you cannot see it.");
    }
    // Services speak sen ("max 2800000 sen"); people read ringgit.
    return fail(
      error.message.replace(/\b(\d{1,15}) sen\b/g, (_, sen: string) =>
        formatSen(BigInt(sen)),
      ),
    );
  }
  if (error instanceof z.ZodError) {
    return fail(error.issues[0]?.message ?? "Invalid input.");
  }
  console.error(
    "Server action failed:",
    error instanceof Error ? error.message : "non-Error thrown",
  );
  return fail("Something went wrong. Please try again.");
};

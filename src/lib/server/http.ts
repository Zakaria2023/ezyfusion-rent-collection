import "server-only";
import { unstable_rethrow } from "next/navigation";
import { NextResponse } from "next/server";
import { z } from "zod";

// Route-handler plumbing: one error shape ({ error }) and one place that maps
// thrown errors to status codes (docs/TASK.md sections 6 and 7).

type RouteFn<C> = (req: Request, ctx: C) => Promise<Response>;

export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

export const badRequest = (message: string) => new HttpError(400, message);
export const unauthorized = () => new HttpError(401, "Unauthorized");
export const forbidden = () => new HttpError(403, "Forbidden");
export const notFound = () => new HttpError(404, "Not found");
export const conflict = (message: string) => new HttpError(409, message);
export const unprocessable = (message: string) => new HttpError(422, message);

export const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status });

export const jsonError = (status: number, message: string) =>
  NextResponse.json({ error: message }, { status });

// "amountSen: Invalid input: expected number" — names the first failing field,
// never echoes the submitted value.
const describeZodError = (error: z.ZodError): string => {
  const issue = error.issues[0];
  if (!issue) {
    return "Invalid input";
  }
  const path = issue.path.map(String).join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
};

// Wraps a route handler. Generic over the context so routes keep Next's typing,
// e.g. handle<RouteContext<"/api/leases/[leaseId]">>(async (req, ctx) => …).
export const handle =
  <C = unknown>(fn: RouteFn<C>): RouteFn<C> =>
  async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (error) {
      // Let Next's own control-flow errors (redirect, notFound, …) through.
      unstable_rethrow(error);
      if (error instanceof HttpError) {
        return jsonError(error.status, error.message);
      }
      if (error instanceof z.ZodError) {
        return jsonError(400, describeZodError(error));
      }
      // Message only: never log request bodies, tokens or the gateway key.
      console.error(
        "Unhandled route error:",
        error instanceof Error ? error.message : "non-Error thrown",
      );
      return jsonError(500, "Internal error");
    }
  };

export const readJson = async <T>(
  req: Request,
  schema: z.ZodType<T>,
): Promise<T> => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw badRequest("Invalid JSON body");
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    throw badRequest(describeZodError(result.error));
  }
  return result.data;
};

// Reads a JSON body WITHOUT validating it, for routes whose service must run
// its 404/403 checks before input validation (401 → 404 → 403 → 400). Invalid
// JSON becomes `undefined`, which the service's zod schema rejects with 400.
export const readJsonBody = async (req: Request): Promise<unknown> => {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
};

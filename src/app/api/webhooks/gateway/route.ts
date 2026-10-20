import { handle, json, jsonError } from "@/lib/server/http";
import { processGatewayCallback } from "@/lib/server/services/gateway";

// The payment gateway's callback (docs/TASK.md section 5). The body is read
// raw (never formData): the signature covers the exact fields that were sent.
// Errors are logged by handle() as error.message only — never the key or body.
export const POST = handle(async (req) => {
  const key = process.env.GATEWAY_X_SIGNATURE_KEY ?? "";
  if (key.length === 0) {
    return jsonError(500, "Gateway is not configured");
  }
  const rawBody = await req.text();
  const { status, body } = await processGatewayCallback(rawBody, key);
  return json(body, status);
});

import { requireActor } from "@/lib/server/auth";
import { handle, json } from "@/lib/server/http";
import { collectionsReport } from "@/lib/server/services/reports";

// Staff and managers. 401 no login, 403 tenant, 400 invalid range.
export const GET = handle(async (req) => {
  const actor = await requireActor(req);
  const { searchParams } = new URL(req.url);
  return json(
    await collectionsReport(
      actor,
      searchParams.get("from"),
      searchParams.get("to"),
    ),
  );
});

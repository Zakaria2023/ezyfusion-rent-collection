"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { fetchPortalData, type PortalData } from "./portal-data";

type PortalState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: PortalData | null };

// Loads the tenant's portal data from the browser (supabase-js + RLS). The
// first render — on the server and in the browser — is always "loading", and
// "now" is read only inside the effect, so nothing time-dependent is ever
// server-rendered and hydration cannot mismatch whatever the viewer's timezone.
export const usePortalData = () => {
  const [state, setState] = useState<PortalState>({ kind: "loading" });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    fetchPortalData(new Date()).then(
      (data) => {
        if (active) {
          setState({ kind: "ready", data });
        }
      },
      (error: unknown) => {
        if (!active) {
          return;
        }
        const message =
          error instanceof Error ? error.message : "Could not load your lease.";
        setState({ kind: "error", message });
        toast.error(message);
      },
    );
    return () => {
      active = false;
    };
  }, [version]);

  // Re-fetches in the background; the current data stays on screen meanwhile.
  const refresh = useCallback(() => setVersion((current) => current + 1), []);

  return { state, refresh };
};

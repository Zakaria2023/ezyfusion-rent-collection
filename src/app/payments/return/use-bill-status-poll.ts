"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const POLL_INTERVAL_MS = 3000;

// While the bill is pending, re-render the server page every few seconds so
// the status the webhook writes shows up. router.refresh() only re-reads; the
// page itself never changes anything.
export const useBillStatusPoll = (isPending: boolean) => {
  const router = useRouter();

  useEffect(() => {
    if (!isPending) {
      return;
    }
    const timer = window.setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [isPending, router]);
};

"use client";

import { useBillStatusPoll } from "./use-bill-status-poll";

type BillStatusPollProps = { isPending: boolean };

export const BillStatusPoll = ({ isPending }: BillStatusPollProps) => {
  useBillStatusPoll(isPending);
  return isPending ? (
    <p className="text-xs text-muted-foreground">
      Checking again every few seconds…
    </p>
  ) : null;
};

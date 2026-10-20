"use client";

import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSignOut } from "./use-sign-out";

export const SignOutButton = () => {
  const { signOut, isPending } = useSignOut();

  return (
    <Button variant="ghost" size="sm" onClick={signOut} disabled={isPending}>
      <LogOut data-icon="inline-start" />
      {isPending ? "Signing out…" : "Sign out"}
    </Button>
  );
};

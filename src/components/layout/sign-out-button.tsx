"use client";

import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSignOut } from "./use-sign-out";

type SignOutButtonProps = { className?: string };

export const SignOutButton = ({ className }: SignOutButtonProps) => {
  const { signOut, isPending } = useSignOut();

  return (
    <Button
      variant="outline"
      onClick={signOut}
      disabled={isPending}
      className={cn("w-full justify-start", className)}
    >
      <LogOut data-icon="inline-start" />
      {isPending ? "Signing out…" : "Sign out"}
    </Button>
  );
};

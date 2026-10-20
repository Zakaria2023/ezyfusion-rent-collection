"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export const SignOutButton = () => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const signOut = () =>
    startTransition(async () => {
      const { error } = await createSupabaseBrowserClient().auth.signOut();
      if (error) {
        toast.error(`Could not sign out: ${error.message}`);
        return;
      }
      router.replace("/login");
      router.refresh();
    });

  return (
    <Button variant="ghost" size="sm" onClick={signOut} disabled={isPending}>
      <LogOut data-icon="inline-start" />
      {isPending ? "Signing out…" : "Sign out"}
    </Button>
  );
};

import { Building2, ShieldAlert } from "lucide-react";
import { redirect } from "next/navigation";
import { IconChip } from "@/components/layout/icon-chip";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { getActor } from "@/lib/server/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Entry point: route by the role from our own tables (memberships / tenants),
// never from anything the user can edit.
const HomePage = async () => {
  const actor = await getActor();
  if (actor?.kind === "member") {
    redirect("/dashboard");
  }
  if (actor?.kind === "tenant") {
    redirect("/portal");
  }

  // No actor: either signed out, or signed in without any role. Redirecting
  // the latter to /login would loop (the login page sends signed-in users here).
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-linear-to-b from-secondary/60 to-background p-4 sm:p-8">
      <div className="flex items-center gap-3">
        <IconChip icon={Building2} tone="brand" size="sm" />
        <span className="font-semibold tracking-tight">Rent Collection</span>
      </div>
      <section className="flex w-full max-w-sm flex-col items-center gap-4 rounded-3xl border bg-card p-8 text-center shadow-xl shadow-primary/5">
        <IconChip
          icon={ShieldAlert}
          tone="amber"
          size="lg"
          className="rounded-full"
        />
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">No access</h1>
          <p className="text-sm text-muted-foreground">
            {user.email ?? "This account"} is not a member or tenant of any
            organization.
          </p>
        </div>
        <SignOutButton className="mt-2 justify-center" />
      </section>
    </main>
  );
};

export default HomePage;

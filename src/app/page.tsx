import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/layout/sign-out-button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
    <main className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>No access</CardTitle>
          <CardDescription>
            {user.email ?? "This account"} is not a member or tenant of any
            organization.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <SignOutButton />
        </CardFooter>
      </Card>
    </main>
  );
};

export default HomePage;

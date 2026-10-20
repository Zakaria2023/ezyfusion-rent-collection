import { Building2, CalendarClock, ShieldCheck, Wallet } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const FEATURES = [
  {
    icon: Wallet,
    title: "Every ringgit accounted for",
    text: "Cash, bank transfer and online payments allocated to the sen.",
  },
  {
    icon: CalendarClock,
    title: "Malaysia time, always",
    text: "Due dates and overdue rent computed in Kuala Lumpur time.",
  },
  {
    icon: ShieldCheck,
    title: "Private by design",
    text: "Each organization and tenant sees only their own records.",
  },
] as const;

const LoginPage = async () => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    redirect("/");
  }

  return (
    <main className="grid flex-1 lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-linear-to-br from-indigo-600 via-violet-600 to-teal-500 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -top-24 -left-24 size-96 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -right-16 -bottom-32 size-96 rounded-full bg-teal-300/20 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
            <Building2 className="size-5" />
          </span>
          <span className="text-lg font-semibold tracking-tight">
            Rent Collection
          </span>
        </div>

        <div className="relative flex max-w-md flex-col gap-10">
          <div className="flex flex-col gap-4">
            <h1 className="text-4xl leading-tight font-semibold tracking-tight">
              Collect rent without chasing spreadsheets.
            </h1>
            <p className="text-lg text-white/80">
              Leases, invoices and payments for Malaysian property managers, in
              one place.
            </p>
          </div>
          <ul className="flex flex-col gap-5">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/20">
                  <Icon className="size-5" />
                </span>
                <div>
                  <p className="font-medium">{title}</p>
                  <p className="text-sm text-white/75">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-sm text-white/60">
          EzyFusion · Rent collection module
        </p>
      </section>

      <section className="relative flex items-center justify-center bg-linear-to-b from-secondary/60 to-background p-6 sm:p-12">
        <div className="flex w-full max-w-sm flex-col gap-8">
          <div className="flex items-center gap-3 lg:hidden">
            <span className="flex size-10 items-center justify-center rounded-xl bg-linear-to-br from-indigo-600 to-teal-500 text-white shadow-lg shadow-primary/30">
              <Building2 className="size-5" />
            </span>
            <span className="text-lg font-semibold tracking-tight">
              Rent Collection
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <h2 className="text-3xl font-semibold tracking-tight">
              Welcome back
            </h2>
            <p className="text-muted-foreground">
              Sign in to manage leases, invoices and payments.
            </p>
          </div>
          <div className="rounded-2xl border bg-card p-6 shadow-xl shadow-primary/5">
            <LoginForm />
          </div>
        </div>
      </section>
    </main>
  );
};

export default LoginPage;

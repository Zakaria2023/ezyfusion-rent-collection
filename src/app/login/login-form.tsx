"use client";

import { ArrowRight, Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEMO_ACCOUNTS } from "./demo-accounts";
import { useLoginForm } from "./use-login-form";

export const LoginForm = () => {
  const {
    register,
    errors,
    onSubmit,
    isPending,
    showPassword,
    togglePassword,
    fillDemo,
  } = useLoginForm();

  return (
    <div className="flex flex-col gap-6">
      <form className="flex flex-col gap-5" onSubmit={onSubmit} noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.test"
              className="h-11 pl-9"
              aria-invalid={errors.email ? true : undefined}
              {...register("email")}
            />
          </div>
          {errors.email ? (
            <p className="text-sm text-destructive">{errors.email.message}</p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••"
              className="h-11 pr-10 pl-9"
              aria-invalid={errors.password ? true : undefined}
              {...register("password")}
            />
            <button
              type="button"
              onClick={togglePassword}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
            >
              {showPassword ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
          </div>
          {errors.password ? (
            <p className="text-sm text-destructive">
              {errors.password.message}
            </p>
          ) : null}
        </div>
        <Button
          type="submit"
          size="lg"
          className="h-11 w-full shadow-lg shadow-primary/25"
          disabled={isPending}
        >
          {isPending ? (
            <>
              <Loader2 className="animate-spin" data-icon="inline-start" />
              Signing in…
            </>
          ) : (
            <>
              Sign in
              <ArrowRight data-icon="inline-end" />
            </>
          )}
        </Button>
      </form>

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          Demo accounts
          <span className="h-px flex-1 bg-border" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {DEMO_ACCOUNTS.map((account) => (
            <button
              key={account.email}
              type="button"
              onClick={() => fillDemo(account.email)}
              className="flex flex-col items-center gap-0.5 rounded-lg border bg-secondary/50 px-2 py-2 text-xs transition-colors hover:border-primary/40 hover:bg-secondary"
            >
              <span className="font-medium text-secondary-foreground">
                {account.label}
              </span>
              <span className="w-full truncate text-muted-foreground">
                {account.email.split("@")[0]}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { DEMO_PASSWORD } from "./demo-accounts";
import { type LoginInput, loginSchema } from "./validation";

// Sign-in logic for LoginForm: validation, the Supabase call, toasts, the
// redirect, the password-visibility toggle and demo-account prefill. The
// component only renders what this returns.
export const useLoginForm = () => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showPassword, setShowPassword] = useState(false);
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const signIn = (values: LoginInput) =>
    startTransition(async () => {
      const { error } =
        await createSupabaseBrowserClient().auth.signInWithPassword(values);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Signed in.");
      router.replace("/");
      router.refresh();
    });

  const fillDemo = (email: string) => {
    form.setValue("email", email, { shouldValidate: true });
    form.setValue("password", DEMO_PASSWORD, { shouldValidate: true });
  };

  const togglePassword = () => setShowPassword((shown) => !shown);

  return {
    register: form.register,
    errors: form.formState.errors,
    onSubmit: form.handleSubmit(signIn),
    isPending,
    showPassword,
    togglePassword,
    fillDemo,
  };
};

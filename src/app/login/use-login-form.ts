"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { type LoginInput, loginSchema } from "./validation";

// Sign-in logic for LoginForm: validation, the Supabase call, toasts and the
// redirect. The component only renders what this returns.
export const useLoginForm = () => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
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

  return {
    register: form.register,
    errors: form.formState.errors,
    onSubmit: form.handleSubmit(signIn),
    isPending,
  };
};

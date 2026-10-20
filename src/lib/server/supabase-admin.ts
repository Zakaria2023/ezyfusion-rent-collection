import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseUrl } from "@/lib/supabase/config";

// Supabase client with the SECRET key: bypasses RLS and Storage policies.
// Server-only (the import above makes a client-bundle import fail the build);
// used only for slip storage operations, after the caller is authorized.

let adminClient: SupabaseClient | null = null;

const secretKey = (): string => {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "Missing required environment variable: SUPABASE_SECRET_KEY",
    );
  }
  return key;
};

export const supabaseAdmin = (): SupabaseClient => {
  if (!adminClient) {
    adminClient = createClient(supabaseUrl(), secretKey(), {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  return adminClient;
};

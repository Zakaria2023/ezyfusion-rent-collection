import { createBrowserClient } from "@supabase/ssr";
import { supabasePublishableKey, supabaseUrl } from "./config";

export const createSupabaseBrowserClient = () =>
  createBrowserClient(supabaseUrl(), supabasePublishableKey());

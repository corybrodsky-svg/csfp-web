import { createClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./supabaseServerClient";

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function createSupabaseAdminClient() {
  if (!supabaseUrl || !serviceRoleKey) return null;

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

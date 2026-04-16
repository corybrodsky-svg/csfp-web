import { createClient } from "@supabase/supabase-js";

export const supabaseUrl =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
export const supabaseKey =
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export function createSupabaseServerClient() {
  if (!supabaseUrl) {
    throw new Error("Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL");
  }
<<<<<<< HEAD

  if (!supabaseKey) {
    throw new Error("Missing Supabase server key");
  }

  const resolvedUrl = supabaseUrl;
  const resolvedKey = supabaseKey;
=======
>>>>>>> restore-working-login

  if (!supabaseKey) {
    throw new Error("Missing Supabase server key");
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

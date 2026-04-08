import { createClient } from "@supabase/supabase-js";

export const supabaseUrl =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
export const supabaseKey =
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl) {
  throw new Error("Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL");
}

if (!supabaseKey) {
  throw new Error("Missing Supabase server key");
}

export function createSupabaseServerClient() {
  const resolvedUrl = supabaseUrl!;
  const resolvedKey = supabaseKey!;

  return createClient(resolvedUrl, resolvedKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export const supabaseServer = createSupabaseServerClient();

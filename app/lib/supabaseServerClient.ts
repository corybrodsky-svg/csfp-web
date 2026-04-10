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

export const supabaseServer = new Proxy(
  {},
  {
    get(_target, property) {
      const client = createSupabaseServerClient() as unknown as Record<PropertyKey, unknown>;
      const value = client[property];
      return typeof value === "function"
        ? (value as (...args: unknown[]) => unknown).bind(client)
        : value;
    },
  }
) as ReturnType<typeof createSupabaseServerClient>;

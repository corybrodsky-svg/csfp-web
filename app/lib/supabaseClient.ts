import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  "";

const supabaseClientError = !supabaseUrl
  ? "Missing NEXT_PUBLIC_SUPABASE_URL."
  : !supabaseKey
    ? "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY."
    : "";

type BrowserSupabaseClient = SupabaseClient;

function createMissingConfigClient(message: string) {
  return new Proxy({} as BrowserSupabaseClient, {
    get() {
      throw new Error(message);
    },
  });
}

export const supabase: BrowserSupabaseClient = supabaseClientError
  ? createMissingConfigClient(supabaseClientError)
  : createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });

export function getSupabaseBrowserClientError() {
  return supabaseClientError;
}

export function requireSupabaseBrowserClient() {
  if (supabaseClientError) {
    throw new Error(supabaseClientError || "Supabase browser client is not configured.");
  }

  return supabase;
}

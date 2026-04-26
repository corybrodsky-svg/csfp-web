import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function hasHttpUrl(value?: string) {
  return /^https?:\/\//i.test(value || "");
}

export async function GET() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    "";
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "";

  let canInitializeSupabaseClient = false;
  let initializationError = "";

  try {
    if (!hasHttpUrl(url)) {
      throw new Error("Missing or invalid Supabase URL");
    }

    if (!publishableKey) {
      throw new Error("Missing Supabase publishable/anon key");
    }

    createClient(url, publishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    canInitializeSupabaseClient = true;
  } catch (error) {
    initializationError = error instanceof Error ? error.message : "Could not initialize Supabase client";
  }

  return NextResponse.json({
    ok: true,
    nextPublicSupabaseUrlExists: hasHttpUrl(url),
    publishableOrAnonKeyExists: Boolean(publishableKey),
    canInitializeSupabaseClient,
    initializationError: initializationError || null,
  });
}

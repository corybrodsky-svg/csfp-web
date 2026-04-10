import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabaseServerClient";

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function formatSignupError(message?: string | null) {
  const text = asText(message);
  if (!text) return "Could not create account.";

  const lowered = text.toLowerCase();
  if (lowered.includes("already") || lowered.includes("registered")) {
    return "That email is already registered. Use the login page instead.";
  }
  if (lowered.includes("password should be at least")) {
    return text;
  }
  if (
    lowered.includes("failed to fetch") ||
    lowered.includes("fetch failed") ||
    lowered.includes("network") ||
    lowered.includes("timeout") ||
    lowered.includes("econn") ||
    lowered.includes("enotfound")
  ) {
    return "Could not reach the Supabase auth service.";
  }
  if (lowered.includes("missing supabase") || lowered.includes("missing next_public_supabase")) {
    return "Supabase auth is not configured on the server.";
  }

  return text;
}

function getSignupErrorStatus(message?: string | null) {
  const lowered = asText(message).toLowerCase();

  if (
    lowered.includes("already") ||
    lowered.includes("registered") ||
    lowered.includes("password should be at least")
  ) {
    return 400;
  }

  if (
    lowered.includes("failed to fetch") ||
    lowered.includes("fetch failed") ||
    lowered.includes("network") ||
    lowered.includes("timeout") ||
    lowered.includes("econn") ||
    lowered.includes("enotfound")
  ) {
    return 503;
  }

  if (lowered.includes("missing supabase") || lowered.includes("missing next_public_supabase")) {
    return 500;
  }

  return 500;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const fullName = asText(
      body && typeof body === "object" ? (body as { full_name?: unknown }).full_name : ""
    );
    const email = asText(
      body && typeof body === "object" ? (body as { email?: unknown }).email : ""
    ).toLowerCase();
    const password = asText(
      body && typeof body === "object" ? (body as { password?: unknown }).password : ""
    );

    if (!email || !password) {
      return NextResponse.json(
        { ok: false, error: "Email and password are required." },
        { status: 400 }
      );
    }

    let supabase: ReturnType<typeof createSupabaseServerClient>;
    try {
      supabase = createSupabaseServerClient();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not initialize auth client.";
      return NextResponse.json(
        {
          ok: false,
          error: formatSignupError(message),
        },
        { status: getSignupErrorStatus(message) }
      );
    }

    let data:
      | Awaited<ReturnType<typeof supabase.auth.signUp>>["data"]
      | null = null;
    let error:
      | Awaited<ReturnType<typeof supabase.auth.signUp>>["error"]
      | null = null;

    try {
      const result = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName || null,
            role: "viewer",
          },
        },
      });
      data = result.data;
      error = result.error;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not create account.";
      return NextResponse.json(
        {
          ok: false,
          error: formatSignupError(message),
        },
        { status: getSignupErrorStatus(message) }
      );
    }

    if (error) {
      const message = error.message || "Could not create account.";
      return NextResponse.json(
        {
          ok: false,
          error: formatSignupError(message),
        },
        { status: getSignupErrorStatus(message) }
      );
    }

    return NextResponse.json({
      ok: true,
      message: data.session
        ? "Account created. You can sign in now."
        : "Account created. Check your email to verify your address, then sign in to complete your profile.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Could not create account.",
      },
      { status: 500 }
    );
  }
}

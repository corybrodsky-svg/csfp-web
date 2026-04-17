import { NextResponse } from "next/server";
import { setAuthCookies } from "../../../lib/authCookies";
import { createSupabaseServerClient } from "../../../lib/supabaseServerClient";

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function formatLoginError(message?: string | null) {
  const text = asText(message);
  if (!text) return "Could not sign in.";

  const lowered = text.toLowerCase();
  if (lowered.includes("invalid login credentials")) {
    return "Invalid email or password.";
  }
  if (lowered.includes("email not confirmed")) {
    return "Your email is not confirmed yet.";
  }
  if (lowered.includes("email provider is disabled")) {
    return "Supabase email/password auth is disabled for this project.";
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

function getLoginErrorStatus(message?: string | null) {
  const lowered = asText(message).toLowerCase();

  if (lowered.includes("invalid login credentials") || lowered.includes("email not confirmed")) {
    return 401;
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
        { ok: false, error: formatLoginError(message) },
        { status: getLoginErrorStatus(message) }
      );
    }

    let signInResult: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>;
    try {
      signInResult = await supabase.auth.signInWithPassword({
        email,
        password,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not sign in.";
      return NextResponse.json(
        { ok: false, error: formatLoginError(message) },
        { status: getLoginErrorStatus(message) }
      );
    }

    const { data, error } = signInResult;

    if (error || !data.session?.access_token || !data.session.refresh_token) {
      const message = error?.message || "Could not sign in.";
      return NextResponse.json(
        { ok: false, error: formatLoginError(message) },
        { status: error ? getLoginErrorStatus(message) : 500 }
      );
    }

    const response = NextResponse.json({
      ok: true,
      user: {
        id: data.user?.id || null,
        email: data.user?.email || email,
      },
    });

    setAuthCookies(response, {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Could not sign in.",
      },
      { status: 500 }
    );
  }
}

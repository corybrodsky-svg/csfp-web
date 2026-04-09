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

  return text;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const email = asText(body && typeof body === "object" ? (body as { email?: unknown }).email : "");
    const password = asText(
      body && typeof body === "object" ? (body as { password?: unknown }).password : ""
    );

    if (!email || !password) {
      return NextResponse.json(
        { ok: false, error: "Email and password are required." },
        { status: 400 }
      );
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session?.access_token || !data.session.refresh_token) {
      return NextResponse.json(
        {
          ok: false,
          error: formatLoginError(error?.message),
        },
        { status: 401 }
      );
    }

    const response = NextResponse.json({ ok: true });
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

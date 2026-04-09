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

  return text;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const fullName = asText(
      body && typeof body === "object" ? (body as { full_name?: unknown }).full_name : ""
    );
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
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName || null,
          role: "viewer",
        },
      },
    });

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: formatSignupError(error.message),
        },
        { status: 400 }
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

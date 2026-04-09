import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../lib/supabaseAdminClient";

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

    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json(
        {
          ok: false,
          error: "Signup requires SUPABASE_SERVICE_ROLE_KEY on the server.",
        },
        { status: 500 }
      );
    }

    const { error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName || null,
        role: "viewer",
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
      message: "Account created. You can sign in now.",
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

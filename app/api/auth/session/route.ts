import { NextResponse } from "next/server";
import { setAuthCookies } from "../../../lib/authCookies";
import { ensureProfileForUser } from "../../../lib/profileServer";
import { createSupabaseServerClient } from "../../../lib/supabaseServerClient";

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const accessToken = asText(body?.access_token);
    const refreshToken = asText(body?.refresh_token);

    if (!accessToken || !refreshToken) {
      return NextResponse.json(
        { error: "Missing access token or refresh token." },
        { status: 400 }
      );
    }

    const supabase = createSupabaseServerClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(accessToken);

    if (error || !user) {
      return NextResponse.json(
        { error: error?.message || "Could not verify auth session." },
        { status: 401 }
      );
    }

    const response = NextResponse.json({ ok: true, user: { id: user.id, email: user.email } });
    setAuthCookies(response, { accessToken, refreshToken });
    await ensureProfileForUser(user).catch(() => undefined);

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not persist auth session." },
      { status: 500 }
    );
  }
}

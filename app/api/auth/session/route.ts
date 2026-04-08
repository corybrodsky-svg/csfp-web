import { NextResponse } from "next/server";
import { setAuthCookies } from "../../../lib/authCookies";

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export async function POST(request: Request) {
  let body: unknown = null;

  try {
    body = await request.json().catch(() => null);
  } catch {
    body = null;
  }

  const accessToken =
    body && typeof body === "object" ? asText((body as { access_token?: unknown }).access_token) : "";
  const refreshToken =
    body && typeof body === "object" ? asText((body as { refresh_token?: unknown }).refresh_token) : "";

  if (!accessToken || !refreshToken) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing access token or refresh token.",
      },
      { status: 400 }
    );
  }

  try {
    const response = NextResponse.json({ ok: true });
    setAuthCookies(response, {
      accessToken,
      refreshToken,
    });
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Could not persist auth session.",
      },
      { status: 500 }
    );
  }
}

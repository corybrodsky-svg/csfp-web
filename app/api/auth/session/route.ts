import { NextResponse } from "next/server";

export const runtime = "nodejs";

function asText(value: unknown) {
  if (value == null) return "";
  return String(value).trim();
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);

    const accessToken = asText(
      body && typeof body === "object"
        ? (body as { access_token?: unknown; accessToken?: unknown }).access_token ??
            (body as { access_token?: unknown; accessToken?: unknown }).accessToken
        : ""
    );

    const refreshToken = asText(
      body && typeof body === "object"
        ? (body as { refresh_token?: unknown; refreshToken?: unknown }).refresh_token ??
            (body as { refresh_token?: unknown; refreshToken?: unknown }).refreshToken
        : ""
    );

    if (!accessToken || !refreshToken) {
      return NextResponse.json(
        { ok: false, error: "Missing access token or refresh token." },
        { status: 400 }
      );
    }

    const response = NextResponse.json({ ok: true });

    response.cookies.set("cfsp-access-token", accessToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    response.cookies.set("cfsp-refresh-token", refreshToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error) {
    console.error("SESSION ROUTE CRASH:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Session route crashed.",
      },
      { status: 500 }
    );
  }
}
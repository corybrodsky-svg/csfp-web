import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ACCESS_COOKIE = "cfsp-access-token";
const REFRESH_COOKIE = "cfsp-refresh-token";

function asToken(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/auth/session",
    methods: ["GET", "POST"],
  });
}

export async function POST(request: NextRequest) {
  try {
    let body: Record<string, unknown> = {};

    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid or empty JSON body.",
        },
        { status: 400 }
      );
    }

    const accessToken = asToken(body.access_token) || asToken(body.accessToken);
    const refreshToken = asToken(body.refresh_token) || asToken(body.refreshToken);

    if (!accessToken || !refreshToken) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing access token or refresh token.",
        },
        { status: 400 }
      );
    }

    const response = NextResponse.json({ ok: true });

    response.cookies.set(ACCESS_COOKIE, accessToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });

    response.cookies.set(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("/api/auth/session fatal", error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Session route failed",
      },
      { status: 500 }
    );
  }
}

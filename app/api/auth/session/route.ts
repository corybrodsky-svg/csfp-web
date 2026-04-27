import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ACCESS_COOKIE = "cfsp-access-token";
const REFRESH_COOKIE = "cfsp-refresh-token";

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : null;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          ok: false,
          step: "parse_body",
          error: "Invalid or empty JSON body.",
        },
        { status: 400 }
      );
    }

    const session =
      typeof body.session === "object" && body.session !== null
        ? (body.session as Record<string, unknown>)
        : {};

    const accessToken =
      getString(body.access_token) ||
      getString(body.accessToken) ||
      getString(session.access_token) ||
      getString(session.accessToken);

    const refreshToken =
      getString(body.refresh_token) ||
      getString(body.refreshToken) ||
      getString(session.refresh_token) ||
      getString(session.refreshToken);

    if (!accessToken || !refreshToken) {
      return NextResponse.json(
        {
          ok: false,
          step: "missing_tokens",
          error: "Missing access token or refresh token.",
          receivedKeys: Object.keys(body),
        },
        { status: 400 }
      );
    }

    const response = NextResponse.json({ ok: true });

    response.cookies.set(ACCESS_COOKIE, accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    response.cookies.set(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return response;
  } catch (error: unknown) {
    console.error("/api/auth/session failed:", error);

    return NextResponse.json(
      {
        ok: false,
        step: "session_route_failed",
        error: getErrorMessage(error),
      },
      { status: 500 }
    );
  }
}
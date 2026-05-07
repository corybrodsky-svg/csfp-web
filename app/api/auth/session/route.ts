import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ACCESS_COOKIE = "cfsp-access-token";
const REFRESH_COOKIE = "cfsp-refresh-token";

function getString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 ? text : null;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function GET() {
  const response = NextResponse.json({
    ok: true,
    route: "/api/auth/session",
    methods: ["GET", "POST"],
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST(request: Request) {
  try {
    console.error("/api/auth/session POST started");

    let body: Record<string, unknown> = {};

    try {
      body = await request.json();
      console.error("/api/auth/session JSON parsed", {
        keys: Object.keys(body),
      });
    } catch (error: unknown) {
      console.error("/api/auth/session JSON parse failed", error);
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

    console.error("/api/auth/session token extraction", {
      hasAccessToken: Boolean(accessToken),
      hasRefreshToken: Boolean(refreshToken),
      topLevelKeys: Object.keys(body),
      sessionKeys: Object.keys(session),
    });

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
    response.headers.set("Cache-Control", "no-store");

    try {
      console.error("/api/auth/session setting access cookie");
      response.cookies.set(ACCESS_COOKIE, accessToken, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });

      console.error("/api/auth/session setting refresh cookie");
      response.cookies.set(REFRESH_COOKIE, refreshToken, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    } catch (error: unknown) {
      console.error("/api/auth/session failed to set auth cookies", error);
      return NextResponse.json(
        {
          ok: false,
          step: "set_cookies",
          error: getErrorMessage(error),
        },
        { status: 500 }
      );
    }

    console.error("/api/auth/session returning success response");
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

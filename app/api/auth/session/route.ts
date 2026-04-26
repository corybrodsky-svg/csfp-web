import { NextRequest, NextResponse } from "next/server";

const ACCESS_COOKIE = "cfsp-access-token";
const REFRESH_COOKIE = "cfsp-refresh-token";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch((error: unknown) => {
      throw new Error(`Could not parse request JSON: ${errorMessage(error)}`);
    });

    const accessToken = body?.access_token;
    const refreshToken = body?.refresh_token;

    if (!accessToken || !refreshToken) {
      return NextResponse.json(
        {
          ok: false,
          step: "missing_tokens",
          error: "Missing access_token or refresh_token.",
        },
        { status: 400 }
      );
    }

    const response = NextResponse.json({ ok: true });

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    };

    response.cookies.set(ACCESS_COOKIE, accessToken, cookieOptions);
    response.cookies.set(REFRESH_COOKIE, refreshToken, cookieOptions);

    return response;
  } catch (error: unknown) {
    console.error("/api/auth/session failed:", error);

    return NextResponse.json(
      {
        ok: false,
        step: "session_route_failed",
        error: errorMessage(error),
      },
      { status: 500 }
    );
  }
}
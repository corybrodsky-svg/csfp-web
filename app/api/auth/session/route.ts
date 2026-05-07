import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

    return NextResponse.json({
      ok: true,
      receivedAccessToken: Boolean(accessToken),
      receivedRefreshToken: Boolean(refreshToken),
    });
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

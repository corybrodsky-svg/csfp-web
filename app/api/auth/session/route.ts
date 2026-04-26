import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const accessToken = body?.access_token || body?.accessToken;
    const refreshToken = body?.refresh_token || body?.refreshToken;

    if (!accessToken || !refreshToken) {
      return NextResponse.json(
        { ok: false, error: "Missing tokens", receivedKeys: Object.keys(body || {}) },
        { status: 400 }
      );
    }

    const response = NextResponse.json({ ok: true });

    response.cookies.set("cfsp-access-token", accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    });

    response.cookies.set("cfsp-refresh-token", refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, route: "/api/auth/session" });
}
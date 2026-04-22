import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);

    const accessToken = body?.access_token || body?.accessToken || "";
    const refreshToken = body?.refresh_token || body?.refreshToken || "";

    if (!accessToken || !refreshToken) {
      return NextResponse.json(
        { ok: false, error: "Missing tokens" },
        { status: 400 }
      );
    }

    const res = NextResponse.json({ ok: true });

    try {
      // 🔥 MINIMAL SAFE COOKIE SET (no helpers)
      res.cookies.set("cfsp-access-token", accessToken.trim(), {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      });

      res.cookies.set("cfsp-refresh-token", refreshToken.trim(), {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      });

    } catch (cookieError) {
      console.error("COOKIE CRASH:", cookieError);
      return NextResponse.json(
        { ok: false, error: "Cookie write failed" },
        { status: 500 }
      );
    }

    return res;

  } catch (err) {
    console.error("SESSION CRASH:", err);
    return NextResponse.json(
      { ok: false, error: "Session route crashed" },
      { status: 500 }
    );
  }
}
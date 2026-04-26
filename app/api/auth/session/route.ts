import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { access_token, refresh_token } = body;

    if (!access_token || !refresh_token) {
      return NextResponse.json(
        { ok: false, step: "missing_tokens" },
        { status: 400 }
      );
    }

    const res = NextResponse.json({ ok: true });

    try {
      res.cookies.set("cfsp-access-token", access_token, {
        httpOnly: true,
        path: "/",
      });

      res.cookies.set("cfsp-refresh-token", refresh_token, {
        httpOnly: true,
        path: "/",
      });
    } catch (cookieError: any) {
      console.error("COOKIE ERROR:", cookieError);

      return NextResponse.json(
        {
          ok: false,
          step: "cookie_set_failed",
          error: cookieError?.message || "unknown",
        },
        { status: 500 }
      );
    }

    return res;
  } catch (err: any) {
    console.error("SESSION ROUTE ERROR:", err);

    return NextResponse.json(
      {
        ok: false,
        step: "session_route_crash",
        error: err?.message || "unknown",
      },
      { status: 500 }
    );
  }
}
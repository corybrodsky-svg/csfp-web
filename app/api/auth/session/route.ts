import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const accessToken =
      body?.access_token || body?.accessToken || "";
    const refreshToken =
      body?.refresh_token || body?.refreshToken || "";

    if (!accessToken || !refreshToken) {
      return NextResponse.json(
        { ok: false, error: "Missing tokens" },
        { status: 400 }
      );
    }

    const res = NextResponse.json({ ok: true });

    // 🔑 direct cookies — no helper, no abstraction
    res.cookies.set("cfsp-access-token", accessToken, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });

    res.cookies.set("cfsp-refresh-token", refreshToken, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });

    return res;
  } catch (err) {
    console.error("SESSION HARD FAIL:", err);

    return NextResponse.json(
      { ok: false, error: "Hard session failure" },
      { status: 500 }
    );
  }
}
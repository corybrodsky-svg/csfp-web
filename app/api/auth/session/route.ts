import { NextRequest, NextResponse } from "next/server";

const ACCESS_COOKIE = "cfsp-access-token";
const REFRESH_COOKIE = "cfsp-refresh-token";

function getString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {};

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, step: "parse_body", error: "Could not parse request body." },
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
        error: "Missing access or refresh token.",
        receivedKeys: Object.keys(body),
      },
      { status: 400 }
    );
  }

  const response = NextResponse.json({ ok: true });

  response.cookies.set(ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  response.cookies.set(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/auth/session",
    methods: ["POST"],
  });
}
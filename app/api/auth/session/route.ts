import { NextResponse } from "next/server";
import { setAuthCookies } from "../../../lib/authCookies";

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

type SessionPayload = {
  access_token?: unknown;
  refresh_token?: unknown;
  accessToken?: unknown;
  refreshToken?: unknown;
};

function getTokenPair(body: unknown) {
  if (!body || typeof body !== "object") {
    return {
      accessToken: "",
      refreshToken: "",
    };
  }

  const payload = body as SessionPayload;

  return {
    accessToken: asText(payload.access_token ?? payload.accessToken),
    refreshToken: asText(payload.refresh_token ?? payload.refreshToken),
  };
}

export async function POST(request: Request) {
  try {
    let body: unknown = null;

    try {
      body = await request.json().catch(() => null);
    } catch {
      body = null;
    }

    const { accessToken, refreshToken } = getTokenPair(body);

    if (!accessToken || !refreshToken) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing access token or refresh token.",
        },
        { status: 400 }
      );
    }

    try {
      const response = NextResponse.json({ ok: true });
      const persisted = setAuthCookies(response, {
        accessToken,
        refreshToken,
      });

      if (!persisted) {
        return NextResponse.json(
          { ok: false, error: "session failed" },
          { status: 500 }
        );
      }

      return response;
    } catch (error) {
      console.error("SESSION ERROR:", error);
      return NextResponse.json(
        { ok: false, error: "session failed" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("SESSION ERROR:", error);
    return NextResponse.json(
      { ok: false, error: "session failed" },
      { status: 500 }
    );
  }
}

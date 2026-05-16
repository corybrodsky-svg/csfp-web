import { NextRequest, NextResponse } from "next/server";
import { setAuthCookies } from "../../../lib/authCookies";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function asToken(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

function getSafeErrorLabel(error: unknown) {
  if (error instanceof Error) return error.message || error.name || "error";
  if (typeof error === "string") return error;
  return "error";
}

export async function GET() {
  return jsonNoStore({
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
      return jsonNoStore(
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
      return jsonNoStore(
        {
          ok: false,
          error: "Missing access token or refresh token.",
        },
        { status: 400 }
      );
    }

    const response = jsonNoStore({ ok: true });
    const cookiesSet = setAuthCookies(response, {
      accessToken,
      refreshToken,
    });

    if (!cookiesSet) {
      return jsonNoStore(
        {
          ok: false,
          error: "Could not persist auth cookies.",
        },
        { status: 500 }
      );
    }

    return response;
  } catch (error) {
    console.error("[auth] /api/auth/session failed", getSafeErrorLabel(error));

    return jsonNoStore(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Session route failed",
      },
      { status: 500 }
    );
  }
}

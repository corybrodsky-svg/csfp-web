import type { NextResponse } from "next/server";

export const AUTH_ACCESS_COOKIE = "cfsp-access-token";
export const AUTH_REFRESH_COOKIE = "cfsp-refresh-token";

function cookieOptions(maxAge?: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(typeof maxAge === "number" ? { maxAge } : {}),
  };
}

export function setAuthCookies(
  response: NextResponse,
  tokens: { accessToken: string; refreshToken: string },
  maxAge = 60 * 60 * 24 * 7
) {
  response.cookies.set(AUTH_ACCESS_COOKIE, tokens.accessToken, cookieOptions(maxAge));
  response.cookies.set(AUTH_REFRESH_COOKIE, tokens.refreshToken, cookieOptions(maxAge));
}

export function clearAuthCookies(response: NextResponse) {
  response.cookies.set(AUTH_ACCESS_COOKIE, "", cookieOptions(0));
  response.cookies.set(AUTH_REFRESH_COOKIE, "", cookieOptions(0));
}

import type { NextResponse } from "next/server";

export const AUTH_ACCESS_COOKIE = "cfsp-access-token";
export const AUTH_REFRESH_COOKIE = "cfsp-refresh-token";

function normalizeCookieValue(value: string) {
  return value.replace(/[\u0000-\u001F\u007F\s]+/g, "").trim();
}

function cookieOptions(maxAge?: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(typeof maxAge === "number" ? { maxAge } : {}),
  };
}

function assertCookieToken(name: string, value: string) {
  const normalized = normalizeCookieValue(value);
  if (!normalized) {
    throw new Error(`Missing ${name}.`);
  }

  return normalized;
}

export function setAuthCookies(
  response: NextResponse,
  tokens: { accessToken: string; refreshToken: string },
  maxAge = 60 * 60 * 24 * 7
) {
  const accessToken = assertCookieToken("access token", tokens.accessToken);
  const refreshToken = assertCookieToken("refresh token", tokens.refreshToken);
  const options = cookieOptions(maxAge);

  response.cookies.set(AUTH_ACCESS_COOKIE, accessToken, options);
  response.cookies.set(AUTH_REFRESH_COOKIE, refreshToken, options);
}

export function clearAuthCookies(response: NextResponse) {
  const options = cookieOptions(0);
  response.cookies.set(AUTH_ACCESS_COOKIE, "", options);
  response.cookies.set(AUTH_REFRESH_COOKIE, "", options);
}

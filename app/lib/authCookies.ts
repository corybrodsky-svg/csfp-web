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

function safeCookieToken(value: string) {
  return normalizeCookieValue(value);
}

export function setAuthCookies(
  response: NextResponse,
  tokens: { accessToken: string; refreshToken: string },
  maxAge = 60 * 60 * 24 * 7,
  refreshMaxAge = 60 * 60 * 24 * 30
) {
  const accessToken = safeCookieToken(tokens.accessToken);
  const refreshToken = safeCookieToken(tokens.refreshToken);
  const accessOptions = cookieOptions(maxAge);
  const refreshOptions = cookieOptions(refreshMaxAge);

  if (!accessToken || !refreshToken) {
    return false;
  }

  try {
    response.cookies.set(AUTH_ACCESS_COOKIE, accessToken, accessOptions);
    response.cookies.set(AUTH_REFRESH_COOKIE, refreshToken, refreshOptions);
    return true;
  } catch {
    return false;
  }
}

export function clearAuthCookies(response: NextResponse) {
  const options = cookieOptions(0);

  try {
    response.cookies.set(AUTH_ACCESS_COOKIE, "", options);
    response.cookies.set(AUTH_REFRESH_COOKIE, "", options);
  } catch {
    return;
  }
}

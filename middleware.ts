import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { AUTH_ACCESS_COOKIE } from "./app/lib/authCookies";
import {
  getEffectivePortalNavigationRole,
  getSpPortalLandingPath,
  isSpPortalAllowedPath,
} from "./app/lib/spPortalAccess";

function decodeJwtPayload(token: string | undefined) {
  if (!token) return null;
  const payloadSegment = token.split(".")[1];
  if (!payloadSegment) return null;

  try {
    const normalized = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    const decoded = atob(padded);
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isStaticOrApiPath(pathname: string) {
  return (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/branding/") ||
    pathname === "/favicon.ico" ||
    /\.[a-z0-9]+$/i.test(pathname)
  );
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (isStaticOrApiPath(pathname)) return NextResponse.next();

  const payload = decodeJwtPayload(request.cookies.get(AUTH_ACCESS_COOKIE)?.value);
  const metadata = (payload?.user_metadata || {}) as Record<string, unknown>;
  const appMetadata = (payload?.app_metadata || {}) as Record<string, unknown>;
  const role = getEffectivePortalNavigationRole([
    appMetadata.role,
    appMetadata.organization_role,
    metadata.organization_role,
    metadata.org_role,
    metadata.role,
    payload?.role,
  ]);

  if (role === "sp" && !isSpPortalAllowedPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = getSpPortalLandingPath();
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/:path*"],
};

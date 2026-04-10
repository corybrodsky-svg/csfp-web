import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  AUTH_ACCESS_COOKIE,
  AUTH_REFRESH_COOKIE,
  clearAuthCookies,
  setAuthCookies,
} from "./app/lib/authCookies";
import { createSupabaseServerClient } from "./app/lib/supabaseServerClient";

const PUBLIC_ROUTES = new Set(["/login", "/signup"]);
const PUBLIC_API_PREFIX = "/api/auth/";

function isStaticAsset(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname === "/favicon.ico" ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".jpg") ||
    pathname.endsWith(".jpeg") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".webp")
  );
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  if (PUBLIC_ROUTES.has(pathname) || pathname.startsWith(PUBLIC_API_PREFIX)) {
    return NextResponse.next();
  }

  const accessToken = request.cookies.get(AUTH_ACCESS_COOKIE)?.value || "";
  const refreshToken = request.cookies.get(AUTH_REFRESH_COOKIE)?.value || "";
  let authenticated = false;
  let refreshedTokens: { accessToken: string; refreshToken: string } | null = null;
  let authError = false;

  try {
    const supabase = createSupabaseServerClient();

    if (accessToken) {
      const {
        data: { user },
      } = await supabase.auth.getUser(accessToken);
      authenticated = Boolean(user);
    }

    if (!authenticated && refreshToken) {
      const { data } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
      if (data.session?.access_token && data.session.refresh_token) {
        authenticated = true;
        refreshedTokens = {
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
        };
      }
    }
  } catch {
    authError = true;
  }

  if (!authenticated || authError) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    const response = NextResponse.redirect(loginUrl);
    if (accessToken || refreshToken) {
      clearAuthCookies(response);
    }
    return response;
  }

  const response = NextResponse.next();
  if (refreshedTokens) {
    setAuthCookies(response, refreshedTokens);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

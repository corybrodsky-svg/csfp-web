import { NextResponse } from "next/server";

<<<<<<< HEAD
export function middleware() {
  return NextResponse.next();
=======
const PUBLIC_ROUTES = new Set(["/login", "/signup"]);
const PUBLIC_API_PREFIX = "/api/auth/";

function isStaticAsset(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
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

  if (
    isStaticAsset(pathname) ||
    PUBLIC_ROUTES.has(pathname) ||
    pathname.startsWith(PUBLIC_API_PREFIX)
  ) {
    return NextResponse.next();
  }

  const accessToken = request.cookies.get(AUTH_ACCESS_COOKIE)?.value || "";
  const refreshToken = request.cookies.get(AUTH_REFRESH_COOKIE)?.value || "";

  if (!accessToken && !refreshToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  try {
    const supabase = createSupabaseServerClient();

    if (accessToken) {
      const {
        data: { user },
      } = await supabase.auth.getUser(accessToken);

      if (user) {
        return NextResponse.next();
      }
    }

    if (refreshToken) {
      const { data } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
      if (data.session?.access_token && data.session.refresh_token) {
        const response = NextResponse.next();
        setAuthCookies(response, {
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
        });
        return response;
      }
    }
  } catch {
    // Fall through to a clean cookie reset + redirect.
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${pathname}${search}`);
  const response = NextResponse.redirect(loginUrl);
  if (accessToken || refreshToken) {
    clearAuthCookies(response);
  }
  return response;
>>>>>>> restore-working-login
}

export const config = {
  matcher: ["/:path*"],
};

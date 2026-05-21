import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  AUTH_ACCESS_COOKIE,
  AUTH_REFRESH_COOKIE,
  clearAuthCookies,
  setAuthCookies,
} from "../../../lib/authCookies";
import { createSupabaseServerClient } from "../../../lib/supabaseServerClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

async function resolveRealtimeSession() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(AUTH_ACCESS_COOKIE)?.value?.trim() || "";
  const refreshToken = cookieStore.get(AUTH_REFRESH_COOKIE)?.value?.trim() || "";
  const supabase = createSupabaseServerClient();

  if (accessToken) {
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (!error && data.user) {
      return {
        ok: true as const,
        accessToken,
        refreshedTokens: null as { accessToken: string; refreshToken: string } | null,
        shouldClearCookies: false,
      };
    }
  }

  if (refreshToken) {
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
    const refreshedUser = data.user || data.session?.user || null;
    if (!error && data.session?.access_token && data.session.refresh_token && refreshedUser) {
      return {
        ok: true as const,
        accessToken: data.session.access_token,
        refreshedTokens: {
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
        },
        shouldClearCookies: false,
      };
    }
  }

  return {
    ok: false as const,
    accessToken: "",
    refreshedTokens: null as { accessToken: string; refreshToken: string } | null,
    shouldClearCookies: Boolean(accessToken || refreshToken),
  };
}

function applySessionCookies(
  response: NextResponse,
  session: Awaited<ReturnType<typeof resolveRealtimeSession>>
) {
  if (session.refreshedTokens) {
    setAuthCookies(response, session.refreshedTokens);
  }
  if (session.shouldClearCookies) {
    clearAuthCookies(response);
  }
  return response;
}

export async function GET() {
  const session = await resolveRealtimeSession();
  if (!session.ok || !session.accessToken) {
    return applySessionCookies(
      jsonNoStore({ error: "Unauthorized" }, { status: 401 }),
      session
    );
  }

  return applySessionCookies(
    jsonNoStore({
      ok: true,
      accessToken: session.accessToken,
    }),
    session
  );
}

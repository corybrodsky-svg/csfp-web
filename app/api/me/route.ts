import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../lib/supabaseServerClient";
import {
  AUTH_ACCESS_COOKIE,
  AUTH_REFRESH_COOKIE,
  clearAuthCookies,
  setAuthCookies,
} from "../../lib/authCookies";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ProfileRow = {
  id: string;
  full_name?: string | null;
  schedule_match_name?: string | null;
  role?: string | null;
  status?: string | null;
  email?: string | null;
  profile_picture_url?: string | null;
  notes?: string | null;
};

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

async function resolveSession() {
  const supabase = createSupabaseServerClient();

  const cookieStore = await import("next/headers").then((m) => m.cookies());
  const accessToken = cookieStore.get(AUTH_ACCESS_COOKIE)?.value?.trim() || "";
  const refreshToken = cookieStore.get(AUTH_REFRESH_COOKIE)?.value?.trim() || "";

  if (!accessToken && !refreshToken) {
    return {
      ok: false as const,
      reason: "missing_tokens",
      supabase,
      user: null,
      refreshedSession: null,
    };
  }

  if (accessToken) {
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (!error && data.user) {
      return {
        ok: true as const,
        supabase,
        user: data.user,
        refreshedSession: null,
      };
    }
  }

  if (refreshToken) {
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (!error && data.session?.access_token && data.session.refresh_token && data.user) {
      return {
        ok: true as const,
        supabase,
        user: data.user,
        refreshedSession: data.session,
      };
    }
  }

  return {
    ok: false as const,
    reason: "invalid_session",
    supabase,
    user: null,
    refreshedSession: null,
  };
}

export async function GET() {
  try {
    const session = await resolveSession();

    if (!session.ok || !session.user) {
      const response = jsonNoStore(
        {
          ok: false,
          error: "Unauthorized",
        },
        { status: 401 }
      );
      clearAuthCookies(response);
      return response;
    }

    const user = session.user;
    const supabase = session.supabase;

    let profile: ProfileRow | null = null;

    const profileResult = await supabase
      .from("profiles")
      .select("id, full_name, schedule_match_name, role, status, email, profile_picture_url, notes")
      .eq("id", user.id)
      .maybeSingle();

    if (!profileResult.error && profileResult.data) {
      profile = profileResult.data as ProfileRow;
    } else {
      const fallbackResult = await supabase
        .from("profiles")
        .select("id, full_name, schedule_match_name, role, status, email, profile_picture_url, notes")
        .eq("email", user.email || "")
        .maybeSingle();

      if (!fallbackResult.error && fallbackResult.data) {
        profile = fallbackResult.data as ProfileRow;
      }
    }

    const response = jsonNoStore({
      ok: true,
      user: {
        id: user.id,
        email: user.email || null,
      },
      profile: profile
        ? {
            id: profile.id,
            full_name: profile.full_name || "",
            schedule_match_name: profile.schedule_match_name || "",
            role: profile.role || "",
            status: profile.status || "",
            email: profile.email || user.email || "",
            profile_picture_url: profile.profile_picture_url || "",
            notes: profile.notes || "",
          }
        : {
            id: user.id,
            full_name: "",
            schedule_match_name: "",
            role: "",
            status: "",
            email: user.email || "",
            profile_picture_url: "",
            notes: "",
          },
    });

    if (session.refreshedSession?.access_token && session.refreshedSession.refresh_token) {
      setAuthCookies(response, {
        accessToken: session.refreshedSession.access_token,
        refreshToken: session.refreshedSession.refresh_token,
      });
    }

    return response;
  } catch (error) {
    console.error("/api/me GET failed", error);

    const response = jsonNoStore(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Could not load member profile.",
      },
      { status: 500 }
    );

    return response;
  }
}
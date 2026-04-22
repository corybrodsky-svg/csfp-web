import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  AUTH_ACCESS_COOKIE,
  AUTH_REFRESH_COOKIE,
  clearAuthCookies,
  setAuthCookies,
} from "../../lib/authCookies";
import {
  ensureProfileForUser,
  getProfileForUser,
  updateProfileForUser,
  type ProfileResult,
} from "../../lib/profileServer";
import { createSupabaseServerClient } from "../../lib/supabaseServerClient";

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeProfileRole(value: unknown) {
  const role = asText(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (role === "sim_op" || role === "admin" || role === "super_admin" || role === "sp") return role;
  return "sp";
}

function getForcedSuperAdminRole(email: unknown, role: string) {
  const normalizedEmail = asText(email).toLowerCase();
  const emailLocalPart = normalizedEmail.split("@")[0] || "";
  if (role === "super_admin" || emailLocalPart === "cory.brodsky") {
    return "super_admin";
  }
  return role;
}

type AuthenticatedUserResult = {
  accessToken: string;
  refreshToken: string;
  user: Awaited<ReturnType<ReturnType<typeof createSupabaseServerClient>["auth"]["getUser"]>>["data"]["user"] | null;
  error: string;
  refreshedTokens?: {
    accessToken: string;
    refreshToken: string;
  };
  shouldClearCookies?: boolean;
};

function buildProfileResponse(
  user: AuthenticatedUserResult["user"],
  profile: {
    id: string;
    full_name: string | null;
    schedule_name: string | null;
    email: string | null;
    role: string | null;
    is_active: boolean | null;
  } | null,
  overrides?: {
    full_name?: string | null;
    schedule_name?: string | null;
    role?: string | null;
    profile_image_url?: string | null;
  }
) {
  if (!user) return null;

  const fallbackFullName = asText(user.user_metadata?.full_name) || null;
  const fallbackScheduleName = asText(user.user_metadata?.schedule_name) || null;

  return {
    id: profile?.id || user.id,
    full_name: profile?.full_name ?? overrides?.full_name ?? fallbackFullName,
    schedule_name: profile?.schedule_name ?? overrides?.schedule_name ?? fallbackScheduleName,
    email: profile?.email || user.email || null,
    role: getForcedSuperAdminRole(
      profile?.email || user.email || null,
      normalizeProfileRole(profile?.role || overrides?.role || user.user_metadata?.role)
    ),
    is_active: profile?.is_active ?? null,
    profile_image_url:
      asText(overrides?.profile_image_url) ||
      asText(user.user_metadata?.profile_image_url) ||
      null,
  };
}

async function getAuthenticatedUser(): Promise<AuthenticatedUserResult> {
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get(AUTH_ACCESS_COOKIE)?.value || "";
    const refreshToken = cookieStore.get(AUTH_REFRESH_COOKIE)?.value || "";

    if (!accessToken && !refreshToken) {
      return { accessToken: "", refreshToken: "", user: null, error: "Unauthorized" };
    }

    const supabase = createSupabaseServerClient();

    if (accessToken) {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser(accessToken);

      if (!error && user) {
        return { accessToken, refreshToken, user, error: "" };
      }
    }

    if (!refreshToken) {
      return {
        accessToken,
        refreshToken,
        user: null,
        error: "Unauthorized",
        shouldClearCookies: true,
      };
    }

    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
    const refreshedAccessToken = asText(data.session?.access_token);
    const refreshedRefreshToken = asText(data.session?.refresh_token);
    const refreshedUser = data.user ?? data.session?.user ?? null;

    if (error || !refreshedUser || !refreshedAccessToken || !refreshedRefreshToken) {
      return {
        accessToken,
        refreshToken,
        user: null,
        error: "Unauthorized",
        shouldClearCookies: true,
      };
    }

    return {
      accessToken: refreshedAccessToken,
      refreshToken: refreshedRefreshToken,
      user: refreshedUser,
      error: "",
      refreshedTokens: {
        accessToken: refreshedAccessToken,
        refreshToken: refreshedRefreshToken,
      },
    };
  } catch {
    return { accessToken: "", refreshToken: "", user: null, error: "Unauthorized" };
  }
}

export async function GET() {
  const auth = await getAuthenticatedUser();
  if (!auth.user) {
    const response = NextResponse.json({ error: auth.error || "Unauthorized" }, { status: 401 });
    if (auth.shouldClearCookies) {
      clearAuthCookies(response);
    }
    return response;
  }

  let profileResult: ProfileResult = await getProfileForUser(auth.user.id, auth.accessToken);
  if (!profileResult.profile && profileResult.available !== false) {
    profileResult = await ensureProfileForUser(auth.user, auth.accessToken);
  }

  const response = NextResponse.json({
    user: {
      id: auth.user.id,
      email: auth.user.email,
      created_at: auth.user.created_at || null,
      last_sign_in_at: auth.user.last_sign_in_at || null,
      email_confirmed_at: auth.user.email_confirmed_at || null,
    },
    profile: buildProfileResponse(auth.user, profileResult.profile),
    profile_available: profileResult.available,
    ...(profileResult.error ? { warning: profileResult.error } : {}),
  });

  if (auth.refreshedTokens) {
    setAuthCookies(response, auth.refreshedTokens);
  }

  return response;
}

export async function POST(request: Request) {
  const auth = await getAuthenticatedUser();
  if (!auth.user) {
    const response = NextResponse.json({ error: auth.error || "Unauthorized" }, { status: 401 });
    if (auth.shouldClearCookies) {
      clearAuthCookies(response);
    }
    return response;
  }

  try {
    const body = await request.json().catch(() => null);
    const fullName = asText(body && typeof body === "object" ? (body as { full_name?: unknown }).full_name : "");
    const scheduleName = asText(
      body && typeof body === "object" ? (body as { schedule_name?: unknown }).schedule_name : ""
    );
    const role = normalizeProfileRole(
      body && typeof body === "object" ? (body as { role?: unknown }).role : ""
    );
    const profileImageUrl = asText(
      body && typeof body === "object" ? (body as { profile_image_url?: unknown }).profile_image_url : ""
    );

    if (!fullName) {
      return NextResponse.json({ error: "Full name is required." }, { status: 400 });
    }

    const profileResult = await updateProfileForUser(
      auth.user,
      {
        full_name: fullName,
        schedule_name: scheduleName || null,
        role,
        profile_image_url: profileImageUrl || null,
      },
      auth.accessToken
    );

    if (profileResult.error && !profileResult.profile) {
      return NextResponse.json(
        { error: profileResult.error, profile_available: profileResult.available },
        { status: 500 }
      );
    }

    const response = NextResponse.json({
      ok: true,
      message: "Profile saved.",
      user: {
        id: auth.user.id,
        email: auth.user.email,
        created_at: auth.user.created_at || null,
        last_sign_in_at: auth.user.last_sign_in_at || null,
        email_confirmed_at: auth.user.email_confirmed_at || null,
      },
      profile: buildProfileResponse(auth.user, profileResult.profile, {
        full_name: fullName,
        schedule_name: scheduleName || null,
        role,
        profile_image_url: profileImageUrl || null,
      }),
      profile_available: profileResult.available,
      warning: profileResult.error || "",
    });

    if (auth.refreshedTokens) {
      setAuthCookies(response, auth.refreshedTokens);
    }

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save profile." },
      { status: 500 }
    );
  }
}

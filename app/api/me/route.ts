import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../lib/supabaseServerClient";
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
} from "../../lib/profileServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SUPER_ADMIN_EMAIL = "cory.brodsky@gmail.com";

type ProfileRow = {
  id: string;
  full_name?: string | null;
  schedule_name?: string | null;
  role?: string | null;
  is_active?: boolean | null;
  email?: string | null;
  profile_image_url?: string | null;
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeRole(value: unknown) {
  const role = asText(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (role === "sim_op" || role === "admin" || role === "super_admin" || role === "sp") return role;
  return "sp";
}

function isSuperAdminEmail(email: string | null | undefined) {
  return asText(email).toLowerCase() === SUPER_ADMIN_EMAIL;
}

function getForcedRole(email: string | null | undefined, currentRole: unknown) {
  if (isSuperAdminEmail(email)) return "super_admin";
  return normalizeRole(currentRole);
}

function getCoryFallbackProfile(user: { id: string; email?: string | null }) {
  if (!isSuperAdminEmail(user.email)) return null;

  return {
    id: user.id,
    full_name: "Cory Brodsky",
    schedule_name: "Cory",
    role: "super_admin",
    is_active: true,
    email: user.email || SUPER_ADMIN_EMAIL,
  } satisfies ProfileRow;
}

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
      accessToken: "",
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
        accessToken,
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
        accessToken: data.session.access_token,
      };
    }
  }

  return {
    ok: false as const,
    reason: "invalid_session",
    supabase,
    user: null,
    refreshedSession: null,
    accessToken: "",
  };
}

function buildNormalizedProfile(
  profile: ProfileRow | null,
  user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> }
) {
  const coryFallback = getCoryFallbackProfile(user);
  const fullName =
    asText(profile?.full_name) ||
    asText(user.user_metadata?.full_name) ||
    asText(coryFallback?.full_name);
  const scheduleName =
    asText(profile?.schedule_name) ||
    asText(user.user_metadata?.schedule_name) ||
    asText(coryFallback?.schedule_name);
  const role = getForcedRole(user.email, profile?.role || user.user_metadata?.role || coryFallback?.role);
  const isActive = profile?.is_active ?? coryFallback?.is_active ?? true;
  const email = profile?.email || user.email || coryFallback?.email || null;
  const profileImageUrl =
    asText(profile?.profile_image_url) || asText(user.user_metadata?.profile_image_url);

  return {
    id: profile?.id || coryFallback?.id || user.id,
    full_name: fullName || null,
    schedule_name: scheduleName || null,
    role,
    is_active: isActive,
    email,
    profile_image_url: profileImageUrl || null,
  } satisfies ProfileRow;
}

async function ensureCoryIsSuperAdmin(user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> }, accessToken?: string) {
  if (!isSuperAdminEmail(user.email)) return;

  await updateProfileForUser(
    user as never,
    {
      full_name: asText(user.user_metadata?.full_name) || "Cory Brodsky",
      schedule_name: asText(user.user_metadata?.schedule_name) || "Cory",
      role: "super_admin",
    },
    accessToken
  );
}

function buildResponseProfile(
  profile: ProfileRow | null,
  user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> }
) {
  const resolved = buildNormalizedProfile(profile, user);

  return resolved
    ? {
        id: resolved.id || user.id,
        full_name: resolved.full_name || "",
        schedule_match_name: resolved.schedule_name || "",
        schedule_name: resolved.schedule_name || "",
        role: resolved.role || "",
        status: resolved.is_active === false ? "inactive" : "active",
        email: resolved.email || user.email || "",
        is_active: resolved.is_active ?? true,
        profile_image_url: resolved.profile_image_url || "",
      }
    : {
        id: user.id,
        full_name: getCoryFallbackProfile(user)?.full_name || "",
        schedule_match_name: getCoryFallbackProfile(user)?.schedule_name || "",
        schedule_name: getCoryFallbackProfile(user)?.schedule_name || "",
        role: getForcedRole(user.email, ""),
        status: "active",
        email: user.email || "",
        is_active: true,
        profile_image_url: asText(user.user_metadata?.profile_image_url) || "",
      };
}

async function handleGetOrSave(method: "GET" | "POST" | "PATCH", request?: Request) {
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
  const accessToken = session.accessToken || session.refreshedSession?.access_token || undefined;

  await ensureCoryIsSuperAdmin(user, accessToken);

  if (method === "GET") {
    const profileResult = await getProfileForUser(user.id, accessToken);
    const ensuredProfile = profileResult.profile || (await ensureProfileForUser(user, accessToken)).profile;

    const response = jsonNoStore({
      ok: true,
      user: {
        id: user.id,
        email: user.email || null,
      },
      profile: buildResponseProfile(ensuredProfile as ProfileRow | null, user),
      profile_available: profileResult.available,
      ...(profileResult.error ? { warning: profileResult.error } : {}),
    });

    if (process.env.NODE_ENV !== "production") {
      console.log("/api/me normalized profile returned", {
        email: user.email || null,
        profile: buildResponseProfile(ensuredProfile as ProfileRow | null, user),
      });
    }

    if (session.refreshedSession?.access_token && session.refreshedSession.refresh_token) {
      setAuthCookies(response, {
        accessToken: session.refreshedSession.access_token,
        refreshToken: session.refreshedSession.refresh_token,
      });
    }

    return response;
  }

  const body = request ? await request.json().catch(() => null) : null;
  const fullName = asText(body && typeof body === "object" ? (body as { full_name?: unknown }).full_name : "") || null;
  const scheduleMatchName =
    asText(
      body && typeof body === "object"
        ? ((body as { schedule_match_name?: unknown; schedule_name?: unknown }).schedule_match_name ??
            (body as { schedule_name?: unknown }).schedule_name)
        : ""
    ) || null;
  const requestedRole =
    body && typeof body === "object" ? (body as { role?: unknown }).role : "";
  const profileImageUrl =
    asText(body && typeof body === "object" ? (body as { profile_image_url?: unknown }).profile_image_url : "") || null;
  const finalRole = getForcedRole(user.email, requestedRole);

  const saveResult = await updateProfileForUser(
    user,
    {
      full_name: fullName,
      schedule_name: scheduleMatchName,
      role: finalRole,
      profile_image_url: profileImageUrl,
    },
    accessToken
  );

  if (!saveResult.profile) {
    const response = jsonNoStore(
      {
        ok: false,
        error: saveResult.error || "Could not save profile.",
      },
      { status: 500 }
    );

    if (session.refreshedSession?.access_token && session.refreshedSession.refresh_token) {
      setAuthCookies(response, {
        accessToken: session.refreshedSession.access_token,
        refreshToken: session.refreshedSession.refresh_token,
      });
    }

    return response;
  }

  const response = jsonNoStore({
    ok: true,
    message: "Profile saved.",
    ...(saveResult.error ? { warning: saveResult.error } : {}),
    user: {
      id: user.id,
      email: user.email || null,
    },
    profile: buildResponseProfile(saveResult.profile as ProfileRow, user),
    profile_available: saveResult.available,
  });

  if (process.env.NODE_ENV !== "production") {
    console.log("/api/me normalized profile returned", {
      email: user.email || null,
      profile: buildResponseProfile(saveResult.profile as ProfileRow, user),
    });
  }

  if (session.refreshedSession?.access_token && session.refreshedSession.refresh_token) {
    setAuthCookies(response, {
      accessToken: session.refreshedSession.access_token,
      refreshToken: session.refreshedSession.refresh_token,
    });
  }

  return response;
}

export async function GET() {
  try {
    return await handleGetOrSave("GET");
  } catch (error) {
    console.error("/api/me GET failed", error);

    return jsonNoStore(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Could not load member profile.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    return await handleGetOrSave("POST", request);
  } catch (error) {
    console.error("/api/me POST failed", error);

    return jsonNoStore(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Could not save profile.",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    return await handleGetOrSave("PATCH", request);
  } catch (error) {
    console.error("/api/me PATCH failed", error);

    return jsonNoStore(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Could not save profile.",
      },
      { status: 500 }
    );
  }
}

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
import {
  persistSpAccountLink,
  resolveSpAccountLink,
  type SpAccountLink,
} from "../../lib/spAccountLinking";
import {
  getOrganizationContext,
  setActiveOrganizationCookie,
} from "../../lib/organizationAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SUPER_ADMIN_EMAIL = "cory.brodsky@gmail.com";
const ADMIN_FALLBACK_EMAIL = "cwb55@drexel.edu";
const PROFILE_IMAGE_MAX_BYTES = 3 * 1024 * 1024;
const PROFILE_IMAGE_SIZE_ERROR_MESSAGE =
  "Please choose an image smaller than 3 MB. Large images are automatically compressed before upload.";

type ProfileRow = {
  id: string;
  full_name?: string | null;
  schedule_name?: string | null;
  role?: string | null;
  is_active?: boolean | null;
  email?: string | null;
  profile_image_url?: string | null;
};

type ResponseSpLink = SpAccountLink & {
  onboarding_message?: string;
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function getDataUrlByteSize(dataUrl: string) {
  const parts = dataUrl.split(",");
  if (parts.length < 2) return 0;
  const base64 = parts[1] || "";
  const paddingMatch = base64.match(/=*$/);
  const padding = paddingMatch ? paddingMatch[0].length : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function profileImageDataUrlTooLarge(profileImageUrl: string | null) {
  const imageUrl = asText(profileImageUrl);
  if (!imageUrl || !imageUrl.startsWith("data:image/")) return false;
  return getDataUrlByteSize(imageUrl) > PROFILE_IMAGE_MAX_BYTES;
}

function normalizeRole(value: unknown) {
  const role = asText(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (role === "faculty" || role === "sim_op" || role === "admin" || role === "super_admin" || role === "sp") return role;
  return "sp";
}

function isSuperAdminEmail(email: string | null | undefined) {
  return asText(email).toLowerCase() === SUPER_ADMIN_EMAIL;
}

function isAdminFallbackEmail(email: string | null | undefined) {
  return asText(email).toLowerCase() === ADMIN_FALLBACK_EMAIL;
}

function getForcedRole(email: string | null | undefined, currentRole: unknown) {
  const normalizedCurrentRole = normalizeRole(currentRole);
  if (isSuperAdminEmail(email)) return "super_admin";
  if (isAdminFallbackEmail(email)) {
    if (normalizedCurrentRole === "super_admin") return "super_admin";
    if (normalizedCurrentRole === "admin" || normalizedCurrentRole === "sim_op") return normalizedCurrentRole;
    return "admin";
  }
  return normalizedCurrentRole;
}

function canSelfManageRole(email: string | null | undefined, currentRole: unknown) {
  const normalizedCurrentRole = normalizeRole(currentRole);
  if (isSuperAdminEmail(email) || isAdminFallbackEmail(email)) return true;
  return normalizedCurrentRole === "super_admin" || normalizedCurrentRole === "admin" || normalizedCurrentRole === "sim_op";
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

function getAdminFallbackProfile(user: { id: string; email?: string | null }) {
  if (!isAdminFallbackEmail(user.email)) return null;

  return {
    id: user.id,
    full_name: null,
    schedule_name: null,
    role: "admin",
    is_active: true,
    email: user.email || ADMIN_FALLBACK_EMAIL,
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
    console.error("[auth] /api/me session tokens present: false");
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
    if (error) {
      console.error("[auth] /api/me access token validation failed");
    }
  }

  if (refreshToken) {
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });

    const refreshedUser = data.user ?? data.session?.user ?? null;
    if (!error && data.session?.access_token && data.session.refresh_token && refreshedUser) {
      return {
        ok: true as const,
        supabase,
        user: refreshedUser,
        refreshedSession: data.session,
        accessToken: data.session.access_token,
      };
    }
    console.error("[auth] /api/me refresh failed", {
      hasError: Boolean(error),
      hasSession: Boolean(data.session),
      hasUser: Boolean(refreshedUser),
    });
  }

  console.error("[auth] /api/me session valid: false");
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
  const adminFallback = getAdminFallbackProfile(user);
  const fullName =
    asText(profile?.full_name) ||
    asText(user.user_metadata?.full_name) ||
    asText(coryFallback?.full_name) ||
    asText(adminFallback?.full_name);
  const scheduleName =
    asText(profile?.schedule_name) ||
    asText(user.user_metadata?.schedule_name) ||
    asText(coryFallback?.schedule_name) ||
    asText(adminFallback?.schedule_name);
  const role = getForcedRole(user.email, profile?.role || user.user_metadata?.role || coryFallback?.role || adminFallback?.role);
  const isActive = profile?.is_active ?? coryFallback?.is_active ?? adminFallback?.is_active ?? true;
  const email = profile?.email || user.email || coryFallback?.email || adminFallback?.email || null;
  const profileImageUrl =
    asText(profile?.profile_image_url) || asText(user.user_metadata?.profile_image_url);

  return {
    id: profile?.id || coryFallback?.id || adminFallback?.id || user.id,
    full_name: fullName || null,
    schedule_name: scheduleName || null,
    role,
    is_active: isActive,
    email,
    profile_image_url: profileImageUrl || null,
  } satisfies ProfileRow;
}

async function ensurePreferredRole(
  user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> },
  accessToken?: string
) {
  if (isSuperAdminEmail(user.email)) {
    await updateProfileForUser(
      user as never,
      {
        full_name: asText(user.user_metadata?.full_name) || "Cory Brodsky",
        schedule_name: asText(user.user_metadata?.schedule_name) || "Cory",
        role: "super_admin",
      },
      accessToken
    );
    return;
  }

  if (isAdminFallbackEmail(user.email)) {
    const existingRole = normalizeRole(user.user_metadata?.role);
    const preferredRole =
      existingRole === "super_admin" || existingRole === "admin" || existingRole === "sim_op"
        ? existingRole
        : "admin";

    await updateProfileForUser(
      user as never,
      {
        full_name: asText(user.user_metadata?.full_name) || null,
        schedule_name: asText(user.user_metadata?.schedule_name) || null,
        role: preferredRole,
      },
      accessToken
    );
  }
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

function buildResponseSpLink(link: SpAccountLink): ResponseSpLink {
  return {
    ...link,
    ...(link.status === "pending"
      ? {
          onboarding_message: "Your SP account is awaiting directory matching.",
        }
      : {}),
  };
}

function buildSpLinkDebug(args: {
  user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> };
  profile: ProfileRow | null;
  link: SpAccountLink;
}) {
  const { user, profile, link } = args;
  return {
    auth_user_id: user.id,
    profile_id: profile?.id || null,
    explicit_sp_id:
      asText(user.user_metadata?.sp_id) ||
      asText(user.user_metadata?.linked_sp_id) ||
      asText(user.user_metadata?.sp_link_sp_id) ||
      null,
    profile_email: profile?.email || null,
    auth_email: user.email || null,
    normalized_emails: Array.from(
      new Set(
        [
          asText(profile?.email).toLowerCase(),
          asText(user.email).toLowerCase(),
          asText(user.user_metadata?.email).toLowerCase(),
          asText(user.user_metadata?.working_email).toLowerCase(),
        ].filter(Boolean)
      )
    ),
    full_name: asText(profile?.full_name) || asText(user.user_metadata?.full_name) || null,
    schedule_match_name: asText(profile?.schedule_name) || asText(user.user_metadata?.schedule_name) || null,
    profile_role: profile?.role || null,
    metadata_role: asText(user.user_metadata?.role) || null,
    resolved_status: link.status,
    resolved_sp_id: link.sp_id,
    resolved_sp_name: link.sp_name,
    matched_by: link.matched_by,
  };
}

async function handleGetOrSave(method: "GET" | "POST" | "PATCH", request?: Request) {
  const session = await resolveSession();

  if (!session.ok || !session.user) {
    const response = jsonNoStore(
      {
        ok: false,
        status: session.reason || "invalid_session",
        source: "auth_session",
        error: "Unauthorized",
      },
      { status: 401 }
    );
    clearAuthCookies(response);
    return response;
  }

  const user = session.user;
  const accessToken = session.accessToken || session.refreshedSession?.access_token || undefined;

  await ensurePreferredRole(user, accessToken);
  const existingProfileResult = await getProfileForUser(user.id, accessToken);
  const existingProfile = existingProfileResult.profile || (await ensureProfileForUser(user, accessToken)).profile;
  const spLink = await resolveSpAccountLink({
    user,
    profile: existingProfile || null,
    accessToken,
  });
  const spLinkPersistError = await persistSpAccountLink({
    user,
    link: spLink,
    accessToken,
  });

  if (method === "GET") {
    const profileResult = existingProfileResult;
    const ensuredProfile = existingProfile;
    const organizationContext = await getOrganizationContext();
    const responseProfile = buildResponseProfile(ensuredProfile as ProfileRow | null, user);
    const effectiveProfile = {
      ...responseProfile,
      role: organizationContext.accessStatus === "active" ? organizationContext.legacyRole : responseProfile.role,
      organization_role: organizationContext.role || null,
    };

    const response = jsonNoStore({
      ok: true,
      status: "ok",
      accessStatus: organizationContext.accessStatus,
      user: {
        id: user.id,
        email: user.email || null,
      },
      profile: effectiveProfile,
      memberships: organizationContext.memberships,
      activeOrganization: organizationContext.activeOrganization,
      role: organizationContext.role,
      legacyRole: organizationContext.legacyRole,
      isPlatformOwner: organizationContext.isPlatformOwner,
      profile_available: profileResult.available,
      sp_link: buildResponseSpLink(spLink),
      ...(canSelfManageRole(user.email, effectiveProfile.role)
        ? { sp_link_debug: buildSpLinkDebug({ user, profile: ensuredProfile as ProfileRow | null, link: spLink }) }
        : {}),
      ...(profileResult.error || spLinkPersistError
        ? {
            warning: profileResult.error || spLinkPersistError,
            diagnostics: {
              profileLookupAvailable: profileResult.available,
              profileLookupError: profileResult.error || null,
              spLinkPersistError: spLinkPersistError || null,
            },
          }
        : {}),
    });

    if (organizationContext.activeOrganization?.id) {
      setActiveOrganizationCookie(response, organizationContext.activeOrganization.id);
    }

    if (session.refreshedSession?.access_token && session.refreshedSession.refresh_token) {
      setAuthCookies(response, {
        accessToken: session.refreshedSession.access_token,
        refreshToken: session.refreshedSession.refresh_token,
      });
    }

    return response;
  }

  const body = request ? await request.json().catch(() => Symbol.for("invalid_json")) : null;
  if (body === Symbol.for("invalid_json")) {
    const response = jsonNoStore(
      {
        ok: false,
        error: "Invalid JSON body.",
      },
      { status: 400 }
    );

    if (session.refreshedSession?.access_token && session.refreshedSession.refresh_token) {
      setAuthCookies(response, {
        accessToken: session.refreshedSession.access_token,
        refreshToken: session.refreshedSession.refresh_token,
      });
    }

    return response;
  }
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
  if (profileImageDataUrlTooLarge(profileImageUrl)) {
    const response = jsonNoStore(
      {
        ok: false,
        error: PROFILE_IMAGE_SIZE_ERROR_MESSAGE,
      },
      { status: 400 }
    );
    if (session.refreshedSession?.access_token && session.refreshedSession.refresh_token) {
      setAuthCookies(response, {
        accessToken: session.refreshedSession.access_token,
        refreshToken: session.refreshedSession.refresh_token,
      });
    }
    return response;
  }
  const currentRole = existingProfile?.role || user.user_metadata?.role;
  const finalRole = canSelfManageRole(user.email, currentRole)
    ? getForcedRole(user.email, requestedRole || currentRole)
    : getForcedRole(user.email, currentRole || requestedRole || "sp");

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

  const nextSpLink = await resolveSpAccountLink({
    user: {
      ...user,
      user_metadata: {
        ...user.user_metadata,
        full_name: fullName,
        schedule_name: scheduleMatchName,
        role: finalRole,
      },
    },
    profile: saveResult.profile,
    accessToken,
  });
  const spLinkSaveError = await persistSpAccountLink({
    user,
    link: nextSpLink,
    accessToken,
  });

  const response = jsonNoStore({
    ok: true,
    message: "Profile saved.",
    ...(saveResult.error || spLinkSaveError ? { warning: saveResult.error || spLinkSaveError } : {}),
    user: {
      id: user.id,
      email: user.email || null,
    },
    profile: buildResponseProfile(saveResult.profile as ProfileRow, user),
    profile_available: saveResult.available,
    sp_link: buildResponseSpLink(nextSpLink),
    ...(canSelfManageRole(user.email, finalRole)
      ? { sp_link_debug: buildSpLinkDebug({ user, profile: saveResult.profile as ProfileRow, link: nextSpLink }) }
      : {}),
  });

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
    console.error("[auth] /api/me GET failed");

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
    console.error("[auth] /api/me POST failed");

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
    console.error("[auth] /api/me PATCH failed");

    return jsonNoStore(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Could not save profile.",
      },
      { status: 500 }
    );
  }
}

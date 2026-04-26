import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../lib/supabaseServerClient";
import { createSupabaseAdminClient } from "../../lib/supabaseAdminClient";
import {
  AUTH_ACCESS_COOKIE,
  AUTH_REFRESH_COOKIE,
  clearAuthCookies,
  setAuthCookies,
} from "../../lib/authCookies";
import {
  ensureProfileForUser,
  getProfileForUser,
  getProfilesByIds,
  type AppProfile,
} from "../../lib/profileServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SUPER_ADMIN_EMAIL = "cory.brodsky@gmail.com";

type StaffMember = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  schedule_match_name: string;
  status: string;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeRole(value: unknown) {
  const role = asText(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (role === "super_admin" || role === "admin" || role === "sim_op" || role === "sp") return role;
  return "sp";
}

function isSuperAdminEmail(email: string | null | undefined) {
  return asText(email).toLowerCase() === SUPER_ADMIN_EMAIL;
}

function getEffectiveRole(email: string | null | undefined, currentRole: unknown) {
  if (isSuperAdminEmail(email)) return "super_admin";
  return normalizeRole(currentRole);
}

function roleCanViewAll(role: string) {
  return role === "admin" || role === "super_admin";
}

function getFirstMetadataString(user: User, key: "full_name" | "schedule_name" | "role") {
  return asText(user.user_metadata?.[key]);
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

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

function buildMember(user: User, profile: AppProfile | null): StaffMember {
  const fullName = asText(profile?.full_name) || getFirstMetadataString(user, "full_name");
  const scheduleName = asText(profile?.schedule_name) || getFirstMetadataString(user, "schedule_name");
  const role = getEffectiveRole(user.email, profile?.role || getFirstMetadataString(user, "role"));
  const isActive = profile?.is_active ?? true;

  return {
    id: user.id,
    full_name: fullName || "",
    email: asText(profile?.email) || asText(user.email) || "",
    role,
    schedule_match_name: scheduleName || "",
    status: isActive === false ? "inactive" : "active",
    is_active: isActive !== false,
    created_at: user.created_at || null,
    updated_at: user.updated_at || null,
  };
}

async function listAllAuthUsers() {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return {
      ok: false as const,
      error: "Organization directory requires a configured Supabase service role.",
      users: [] as User[],
    };
  }

  const users: User[] = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      return {
        ok: false as const,
        error: error.message || "Could not load organization users.",
        users: [] as User[],
      };
    }

    const batch = data.users || [];
    users.push(...batch);

    if (batch.length < perPage) break;
    page += 1;
  }

  return {
    ok: true as const,
    error: "",
    users,
  };
}

export async function GET() {
  const session = await resolveSession();

  if (!session.ok || !session.user) {
    const response = jsonNoStore({ ok: false, error: "Unauthorized" }, { status: 401 });
    clearAuthCookies(response);
    return response;
  }

  const user = session.user;
  const accessToken = session.accessToken || session.refreshedSession?.access_token || undefined;
  const role = getEffectiveRole(user.email, user.user_metadata?.role);

  const currentProfileResult = await getProfileForUser(user.id, accessToken);
  const currentProfile = currentProfileResult.profile || (await ensureProfileForUser(user, accessToken)).profile;
  const currentMember = buildMember(user, currentProfile);

  if (!roleCanViewAll(role)) {
    const response = jsonNoStore({
      ok: true,
      members: [currentMember],
      limited: true,
      role,
    });

    if (session.refreshedSession?.access_token && session.refreshedSession.refresh_token) {
      setAuthCookies(response, {
        accessToken: session.refreshedSession.access_token,
        refreshToken: session.refreshedSession.refresh_token,
      });
    }

    return response;
  }

  const authUsersResult = await listAllAuthUsers();
  if (!authUsersResult.ok) {
    return jsonNoStore({ ok: false, error: authUsersResult.error }, { status: 500 });
  }

  const directoryProfiles = await getProfilesByIds(authUsersResult.users.map((item) => item.id));
  const profileMap = new Map(directoryProfiles.profiles.map((profile) => [profile.id, profile]));

  const members = authUsersResult.users
    .map((authUser) => buildMember(authUser, profileMap.get(authUser.id) || null))
    .sort((a, b) => {
      const aName = asText(a.full_name) || asText(a.email);
      const bName = asText(b.full_name) || asText(b.email);
      return aName.localeCompare(bName);
    });

  const response = jsonNoStore({
    ok: true,
    members,
    limited: false,
    role,
    ...(directoryProfiles.error ? { warning: directoryProfiles.error } : {}),
  });

  if (session.refreshedSession?.access_token && session.refreshedSession.refresh_token) {
    setAuthCookies(response, {
      accessToken: session.refreshedSession.access_token,
      refreshToken: session.refreshedSession.refresh_token,
    });
  }

  return response;
}

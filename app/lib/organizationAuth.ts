import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import {
  AUTH_ACCESS_COOKIE,
  AUTH_REFRESH_COOKIE,
  clearAuthCookies,
  setAuthCookies,
} from "./authCookies";
import { getProfileForUser, type AppProfile } from "./profileServer";
import { createSupabaseAdminClient } from "./supabaseAdminClient";
import { createSupabaseServerClient, supabaseKey, supabaseUrl } from "./supabaseServerClient";

export const ACTIVE_ORGANIZATION_COOKIE = "cfsp-active-organization-id";

export const ORGANIZATION_ROLES = [
  "platform_owner",
  "org_admin",
  "sim_ops",
  "faculty",
  "sp",
  "viewer",
] as const;

export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];
export type LegacyRole = "super_admin" | "admin" | "sim_op" | "faculty" | "sp";

export type OrganizationSummary = {
  id: string;
  name: string;
  slug: string | null;
  type: string | null;
  status: string;
};

export type OrganizationMembershipSummary = {
  id: string;
  organization_id: string;
  user_id: string;
  sp_id?: string | null;
  role: OrganizationRole;
  legacy_role: LegacyRole;
  status: string;
  approved_at: string | null;
  created_at: string | null;
  organization: OrganizationSummary | null;
};

export type OrganizationContext = {
  ok: boolean;
  accessStatus: "active" | "no_active_membership" | "unauthorized";
  user: User | null;
  accessToken: string;
  refreshToken: string;
  profile: AppProfile | null;
  memberships: OrganizationMembershipSummary[];
  activeOrganization: OrganizationSummary | null;
  role: OrganizationRole | null;
  legacyRole: LegacyRole;
  isPlatformOwner: boolean;
  refreshedTokens?: {
    accessToken: string;
    refreshToken: string;
  } | null;
  shouldClearCookies?: boolean;
  schemaAvailable: boolean;
};

type AuthSessionResult = {
  user: User | null;
  accessToken: string;
  refreshToken: string;
  refreshedTokens?: {
    accessToken: string;
    refreshToken: string;
  } | null;
  shouldClearCookies?: boolean;
};

type MembershipRow = {
  id?: string | null;
  organization_id?: string | null;
  user_id?: string | null;
  sp_id?: string | null;
  role?: string | null;
  status?: string | null;
  approved_at?: string | null;
  created_at?: string | null;
  organizations?: OrganizationRow | OrganizationRow[] | null;
};

type OrganizationRow = {
  id?: string | null;
  name?: string | null;
  slug?: string | null;
  type?: string | null;
  status?: string | null;
};

const CORY_PLATFORM_OWNER_EMAILS = new Set([
  "cory.brodsky@gmail.com",
  "cory.brodsky@drexel.edu",
  "cwb55@drexel.edu",
]);

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeEmail(value: unknown) {
  return asText(value).toLowerCase();
}

export function normalizeOrganizationRole(value: unknown): OrganizationRole {
  const role = asText(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (role === "platform_owner" || role === "owner" || role === "super_admin") return "platform_owner";
  if (role === "org_admin" || role === "organization_admin" || role === "admin") return "org_admin";
  if (role === "sim_ops" || role === "sim_op") return "sim_ops";
  if (role === "faculty") return "faculty";
  if (role === "viewer" || role === "read_only" || role === "readonly") return "viewer";
  if (role === "sp") return "sp";
  return "viewer";
}

export function organizationRoleToLegacyRole(role: OrganizationRole | null | undefined): LegacyRole {
  if (role === "platform_owner") return "super_admin";
  if (role === "org_admin") return "admin";
  if (role === "sim_ops") return "sim_op";
  if (role === "sp") return "sp";
  return "faculty";
}

export function legacyRoleToOrganizationRole(value: unknown): OrganizationRole {
  const role = asText(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (role === "super_admin") return "platform_owner";
  if (role === "admin") return "org_admin";
  if (role === "sim_op" || role === "sim_ops") return "sim_ops";
  if (role === "faculty") return "faculty";
  if (role === "sp") return "sp";
  return "viewer";
}

export function roleCanManageOrganization(role: OrganizationRole | null | undefined) {
  return role === "platform_owner" || role === "org_admin";
}

export function roleCanOperateOrganization(role: OrganizationRole | null | undefined) {
  return role === "platform_owner" || role === "org_admin" || role === "sim_ops";
}

export function roleCanReadOrganization(role: OrganizationRole | null | undefined) {
  return Boolean(role && ORGANIZATION_ROLES.includes(role));
}

export function isPlatformOwnerEmail(email: unknown) {
  return CORY_PLATFORM_OWNER_EMAILS.has(normalizeEmail(email));
}

function isMissingOrganizationSchema(error: unknown) {
  const source = error as { code?: string; message?: string; details?: string; hint?: string } | null;
  const text = [source?.code, source?.message, source?.details, source?.hint].map(asText).join(" ");
  return /organization_memberships|organizations|relation .* does not exist|PGRST205|42P01/i.test(text);
}

function isMissingMembershipSpIdColumn(error: unknown) {
  const source = error as { code?: string; message?: string; details?: string; hint?: string } | null;
  const code = asText(source?.code);
  const text = [source?.code, source?.message, source?.details, source?.hint].map(asText).join(" ");
  return code === "42703" && /organization_memberships.*sp_id|sp_id.*organization_memberships|organization_memberships\.sp_id/i.test(text);
}

export function jsonNoStore(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

export function createSupabaseUserClient(accessToken: string): SupabaseClient {
  if (!supabaseUrl || !supabaseKey) throw new Error("Missing Supabase configuration.");
  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

export async function resolveAuthenticatedUserFromCookies(): Promise<AuthSessionResult> {
  const cookieStore = await cookies();
  const accessToken = asText(cookieStore.get(AUTH_ACCESS_COOKIE)?.value);
  const refreshToken = asText(cookieStore.get(AUTH_REFRESH_COOKIE)?.value);

  if (!accessToken && !refreshToken) {
    return { user: null, accessToken: "", refreshToken: "" };
  }

  const supabase = createSupabaseServerClient();

  if (accessToken) {
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (!error && data.user) {
      return { user: data.user, accessToken, refreshToken };
    }
  }

  if (!refreshToken) {
    return {
      user: null,
      accessToken,
      refreshToken,
      shouldClearCookies: true,
    };
  }

  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
  const refreshedAccessToken = asText(data.session?.access_token);
  const refreshedRefreshToken = asText(data.session?.refresh_token);
  const refreshedUser = data.user ?? data.session?.user ?? null;

  if (error || !refreshedUser || !refreshedAccessToken || !refreshedRefreshToken) {
    return {
      user: null,
      accessToken,
      refreshToken,
      shouldClearCookies: true,
    };
  }

  return {
    user: refreshedUser,
    accessToken: refreshedAccessToken,
    refreshToken: refreshedRefreshToken,
    refreshedTokens: {
      accessToken: refreshedAccessToken,
      refreshToken: refreshedRefreshToken,
    },
  };
}

function normalizeOrganization(row: OrganizationRow | null | undefined): OrganizationSummary | null {
  const id = asText(row?.id);
  if (!id) return null;

  return {
    id,
    name: asText(row?.name) || "Organization",
    slug: asText(row?.slug) || null,
    type: asText(row?.type) || null,
    status: asText(row?.status) || "active",
  };
}

function getNestedOrganization(row: MembershipRow) {
  const nested = row.organizations;
  if (Array.isArray(nested)) return nested[0] || null;
  return nested || null;
}

function normalizeMembership(row: MembershipRow): OrganizationMembershipSummary | null {
  const id = asText(row.id);
  const organizationId = asText(row.organization_id);
  const userId = asText(row.user_id);
  if (!id || !organizationId || !userId) return null;

  const role = normalizeOrganizationRole(row.role);
  return {
    id,
    organization_id: organizationId,
    user_id: userId,
    sp_id: asText(row.sp_id) || null,
    role,
    legacy_role: organizationRoleToLegacyRole(role),
    status: asText(row.status) || "active",
    approved_at: asText(row.approved_at) || null,
    created_at: asText(row.created_at) || null,
    organization: normalizeOrganization(getNestedOrganization(row)),
  };
}

function dedupeOrganizations(organizations: OrganizationSummary[]) {
  return Array.from(new Map(organizations.map((organization) => [organization.id, organization])).values());
}

async function loadActiveMemberships(db: SupabaseClient, userId: string) {
  const runMembershipQuery = async (withSpId: boolean) => {
    const membershipSelect = withSpId
      ? "id,organization_id,user_id,sp_id,role,status,approved_at,created_at,organizations(id,name,slug,type,status)"
      : "id,organization_id,user_id,role,status,approved_at,created_at,organizations(id,name,slug,type,status)";
    return db
      .from("organization_memberships")
      .select(membershipSelect)
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: true });
  };

  let { data, error } = await runMembershipQuery(true);
  if (error && isMissingMembershipSpIdColumn(error)) {
    const fallback = await runMembershipQuery(false);
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    return {
      schemaAvailable: !isMissingOrganizationSchema(error),
      memberships: [] as OrganizationMembershipSummary[],
      error,
    };
  }

  return {
    schemaAvailable: true,
    memberships: ((data || []) as MembershipRow[]).map(normalizeMembership).filter(Boolean) as OrganizationMembershipSummary[],
    error: null,
  };
}

async function loadAllOrganizations(db: SupabaseClient) {
  const { data, error } = await db
    .from("organizations")
    .select("id,name,slug,type,status")
    .eq("status", "active")
    .order("name", { ascending: true });

  if (error) return [] as OrganizationSummary[];
  return ((data || []) as OrganizationRow[]).map(normalizeOrganization).filter(Boolean) as OrganizationSummary[];
}

function getFallbackContext(args: {
  user: User;
  accessToken: string;
  refreshToken: string;
  profile: AppProfile | null;
  refreshedTokens?: AuthSessionResult["refreshedTokens"];
  shouldClearCookies?: boolean;
}): OrganizationContext {
  const email = normalizeEmail(args.profile?.email || args.user.email);
  const legacyRole = isPlatformOwnerEmail(email)
    ? "super_admin"
    : organizationRoleToLegacyRole(legacyRoleToOrganizationRole(args.profile?.role || args.user.user_metadata?.role));
  const role = legacyRoleToOrganizationRole(legacyRole);
  const fallbackOrganization = {
    id: "legacy-cfsp-workspace",
    name: "CFSP Workspace",
    slug: "legacy-cfsp-workspace",
    type: "demo",
    status: "active",
  };

  return {
    ok: true,
    accessStatus: "active",
    user: args.user,
    accessToken: args.accessToken,
    refreshToken: args.refreshToken,
    profile: args.profile,
    memberships: [
      {
        id: "legacy-cfsp-membership",
        organization_id: fallbackOrganization.id,
        user_id: args.user.id,
        role,
        legacy_role: legacyRole,
        status: "active",
        approved_at: null,
        created_at: null,
        organization: fallbackOrganization,
      },
    ],
    activeOrganization: fallbackOrganization,
    role,
    legacyRole,
    isPlatformOwner: role === "platform_owner",
    refreshedTokens: args.refreshedTokens,
    shouldClearCookies: args.shouldClearCookies,
    schemaAvailable: false,
  };
}

export async function getOrganizationContext(): Promise<OrganizationContext> {
  const auth = await resolveAuthenticatedUserFromCookies();

  if (!auth.user || !auth.accessToken) {
    return {
      ok: false,
      accessStatus: "unauthorized",
      user: null,
      accessToken: "",
      refreshToken: "",
      profile: null,
      memberships: [],
      activeOrganization: null,
      role: null,
      legacyRole: "sp",
      isPlatformOwner: false,
      refreshedTokens: auth.refreshedTokens,
      shouldClearCookies: auth.shouldClearCookies,
      schemaAvailable: true,
    };
  }

  const profileResult = await getProfileForUser(auth.user.id, auth.accessToken);
  const profile = profileResult.profile;
  const db = createSupabaseAdminClient() || createSupabaseUserClient(auth.accessToken);
  const membershipsResult = await loadActiveMemberships(db, auth.user.id);

  if (!membershipsResult.schemaAvailable) {
    return getFallbackContext({
      user: auth.user,
      accessToken: auth.accessToken,
      refreshToken: auth.refreshToken,
      profile,
      refreshedTokens: auth.refreshedTokens,
      shouldClearCookies: auth.shouldClearCookies,
    });
  }

  const memberships = membershipsResult.memberships;
  const isPlatformOwner = memberships.some((membership) => membership.role === "platform_owner");
  const memberOrganizations = dedupeOrganizations(
    memberships.map((membership) => membership.organization).filter(Boolean) as OrganizationSummary[]
  );
  const availableOrganizations = isPlatformOwner
    ? dedupeOrganizations([...memberOrganizations, ...(await loadAllOrganizations(db))])
    : memberOrganizations;

  const cookieStore = await cookies();
  const requestedOrganizationId = asText(cookieStore.get(ACTIVE_ORGANIZATION_COOKIE)?.value);
  const activeOrganization =
    availableOrganizations.find((organization) => organization.id === requestedOrganizationId) ||
    availableOrganizations[0] ||
    null;
  const activeMembership =
    activeOrganization && memberships.find((membership) => membership.organization_id === activeOrganization.id);
  const activeRole =
    activeMembership?.role ||
    (isPlatformOwner && activeOrganization ? "platform_owner" : null);
  const legacyRole = organizationRoleToLegacyRole(activeRole);

  return {
    ok: Boolean(activeOrganization && activeRole),
    accessStatus: activeOrganization && activeRole ? "active" : "no_active_membership",
    user: auth.user,
    accessToken: auth.accessToken,
    refreshToken: auth.refreshToken,
    profile,
    memberships: isPlatformOwner
      ? availableOrganizations.map((organization) => {
          const membership = memberships.find((item) => item.organization_id === organization.id);
          if (membership) return membership;
          return {
            id: `platform-owner-${organization.id}`,
            organization_id: organization.id,
            user_id: auth.user!.id,
            role: "platform_owner" as const,
            legacy_role: "super_admin" as const,
            status: "active",
            approved_at: null,
            created_at: null,
            organization,
          };
        })
      : memberships,
    activeOrganization,
    role: activeRole,
    legacyRole,
    isPlatformOwner,
    refreshedTokens: auth.refreshedTokens,
    shouldClearCookies: auth.shouldClearCookies,
    schemaAvailable: true,
  };
}

export function applyOrganizationAuthCookies(response: NextResponse, context: Pick<OrganizationContext, "refreshedTokens" | "shouldClearCookies"> | null) {
  if (context?.refreshedTokens) {
    setAuthCookies(response, context.refreshedTokens);
  }
  if (context?.shouldClearCookies) {
    clearAuthCookies(response);
  }
  return response;
}

export function setActiveOrganizationCookie(response: NextResponse, organizationId: string) {
  response.cookies.set(ACTIVE_ORGANIZATION_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}

export function unauthorizedJson(context?: Pick<OrganizationContext, "refreshedTokens" | "shouldClearCookies"> | null) {
  return applyOrganizationAuthCookies(jsonNoStore({ ok: false, error: "Unauthorized" }, { status: 401 }), context || null);
}

export function noActiveOrganizationJson(context?: Pick<OrganizationContext, "refreshedTokens" | "shouldClearCookies"> | null) {
  return applyOrganizationAuthCookies(
    jsonNoStore(
      {
        ok: false,
        error: "No active organization membership.",
        accessStatus: "no_active_membership",
      },
      { status: 403 }
    ),
    context || null
  );
}

export function forbiddenJson(message = "You do not have access to this organization.", context?: Pick<OrganizationContext, "refreshedTokens" | "shouldClearCookies"> | null) {
  return applyOrganizationAuthCookies(jsonNoStore({ ok: false, error: message }, { status: 403 }), context || null);
}

export function requireActiveOrganization(context: OrganizationContext) {
  return Boolean(context.user && context.activeOrganization && context.role);
}

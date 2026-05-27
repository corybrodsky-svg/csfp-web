import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "../../lib/supabaseAdminClient";
import {
  ensureProfileForUser,
  getProfileForUser,
  getProfilesByIds,
  type AppProfile,
} from "../../lib/profileServer";
import { sanitizePublicErrorMessage } from "../../lib/safeErrorMessage";
import {
  applyOrganizationAuthCookies,
  forbiddenJson,
  getOrganizationContext,
  noActiveOrganizationJson,
  normalizeOrganizationRole,
  organizationRoleToLegacyRole,
  requireActiveOrganization,
  roleCanManageOrganization,
  unauthorizedJson,
  type OrganizationRole,
} from "../../lib/organizationAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SUPER_ADMIN_EMAIL = "cory.brodsky@gmail.com";
const MANAGEABLE_MEMBERSHIP_ROLES = new Set<OrganizationRole>(["org_admin", "sim_ops", "faculty", "sp", "viewer"]);

type StaffMember = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  organization_role?: string;
  organization_id?: string;
  schedule_match_name: string;
  sp_link_status?: string;
  sp_link_sp_id?: string;
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

function normalizeMembershipRoleInput(value: unknown): OrganizationRole | null {
  const normalized = normalizeOrganizationRole(value);
  if (MANAGEABLE_MEMBERSHIP_ROLES.has(normalized)) return normalized;
  return null;
}

function getFirstMetadataString(user: User, key: "full_name" | "schedule_name" | "role") {
  return asText(user.user_metadata?.[key]);
}

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

function safeErrorMessage(value: unknown, fallback: string) {
  return sanitizePublicErrorMessage(value, fallback);
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
    sp_link_status:
      role === "sp"
        ? asText(user.user_metadata?.sp_link_status || (user.user_metadata?.sp_id ? "linked" : "pending")) || "pending"
        : "",
    sp_link_sp_id: role === "sp" ? asText(user.user_metadata?.sp_id) || "" : "",
    status: isActive === false ? "inactive" : "active",
    is_active: isActive !== false,
    created_at: user.created_at || null,
    updated_at: user.updated_at || null,
  };
}

function buildMemberWithOrganizationRole(
  user: User,
  profile: AppProfile | null,
  membershipRole: OrganizationRole,
  organizationId: string
): StaffMember {
  return {
    ...buildMember(user, profile),
    role: organizationRoleToLegacyRole(membershipRole),
    organization_role: membershipRole,
    organization_id: organizationId,
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
        error: safeErrorMessage(error.message, "Could not load organization users."),
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

async function syncMemberRoleMetadata(userId: string, role: OrganizationRole, organizationId: string) {
  const admin = createSupabaseAdminClient();
  if (!admin) return;
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user) return;

  const metadata = {
    ...(data.user.user_metadata || {}),
    role: organizationRoleToLegacyRole(role),
    organization_role: role,
    organization_id: organizationId,
  };
  await admin.auth.admin.updateUserById(userId, { user_metadata: metadata });
}

export async function GET() {
  const organizationContext = await getOrganizationContext();

  if (!organizationContext.user) return unauthorizedJson(organizationContext);
  if (!requireActiveOrganization(organizationContext)) return noActiveOrganizationJson(organizationContext);

  const user = organizationContext.user;
  const accessToken = organizationContext.accessToken;
  const role = organizationContext.legacyRole;

  const currentProfileResult = await getProfileForUser(user.id, accessToken);
  const currentProfile = currentProfileResult.profile || (await ensureProfileForUser(user, accessToken)).profile;
  const currentMember = buildMemberWithOrganizationRole(
    user,
    currentProfile,
    organizationContext.role || "viewer",
    organizationContext.activeOrganization!.id
  );

  if (!roleCanManageOrganization(organizationContext.role)) {
    return applyOrganizationAuthCookies(
      jsonNoStore({
      ok: true,
      members: [currentMember],
      limited: true,
      role,
      activeOrganization: organizationContext.activeOrganization,
    }),
      organizationContext
    );
  }

  if (!roleCanViewAll(role)) {
    return forbiddenJson("Only organization admins can view organization members.", organizationContext);
  }

  const authUsersResult = await listAllAuthUsers();
  if (!authUsersResult.ok) {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, error: safeErrorMessage(authUsersResult.error, "Could not load organization users.") }, { status: 500 }),
      organizationContext
    );
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, error: "Organization members require a configured Supabase service role." }, { status: 500 }),
      organizationContext
    );
  }

  const { data: memberships, error: membershipsError } = await admin
    .from("organization_memberships")
    .select("user_id,role,status,organization_id")
    .eq("organization_id", organizationContext.activeOrganization!.id)
    .eq("status", "active");

  if (membershipsError) {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, error: safeErrorMessage(membershipsError.message, "Could not load organization memberships.") }, { status: 500 }),
      organizationContext
    );
  }

  const membershipByUserId = new Map(
    ((memberships || []) as Array<{ user_id?: string | null; role?: string | null; organization_id?: string | null }>).map((membership) => [
      asText(membership.user_id),
      {
        role: normalizeOrganizationRole(membership.role),
        organizationId: asText(membership.organization_id),
      },
    ])
  );
  const scopedUsers = authUsersResult.users.filter((authUser) => membershipByUserId.has(authUser.id));
  const directoryProfiles = await getProfilesByIds(scopedUsers.map((item) => item.id));
  const profileMap = new Map(directoryProfiles.profiles.map((profile) => [profile.id, profile]));

  const members = scopedUsers
    .map((authUser) => {
      const membership = membershipByUserId.get(authUser.id);
      return buildMemberWithOrganizationRole(
        authUser,
        profileMap.get(authUser.id) || null,
        membership?.role || "viewer",
        membership?.organizationId || organizationContext.activeOrganization!.id
      );
    })
    .sort((a, b) => {
      const aName = asText(a.full_name) || asText(a.email);
      const bName = asText(b.full_name) || asText(b.email);
      return aName.localeCompare(bName);
    });

  return applyOrganizationAuthCookies(
    jsonNoStore({
    ok: true,
    members,
    limited: false,
    role,
    activeOrganization: organizationContext.activeOrganization,
    ...(directoryProfiles.error ? { warning: directoryProfiles.error } : {}),
  }),
    organizationContext
  );
}

export async function PATCH(request: Request) {
  const organizationContext = await getOrganizationContext();

  if (!organizationContext.user) return unauthorizedJson(organizationContext);
  if (!requireActiveOrganization(organizationContext)) return noActiveOrganizationJson(organizationContext);
  if (!roleCanManageOrganization(organizationContext.role)) {
    return forbiddenJson("Only platform owners and organization admins can manage users.", organizationContext);
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, error: "User management requires a configured Supabase service role." }, { status: 500 }),
      organizationContext
    );
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const userId = asText(body?.user_id ?? body?.userId ?? body?.id);
  const action = asText(body?.action).toLowerCase();

  if (!userId || !action) {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, error: "User id and action are required." }, { status: 400 }),
      organizationContext
    );
  }

  if ((action === "suspend" || action === "remove") && userId === organizationContext.user.id) {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, error: "You cannot suspend or remove your own active membership." }, { status: 400 }),
      organizationContext
    );
  }

  if (action === "change_role") {
    const membershipRole = normalizeMembershipRoleInput(body?.role ?? body?.organization_role);
    if (!membershipRole || !MANAGEABLE_MEMBERSHIP_ROLES.has(membershipRole)) {
      return applyOrganizationAuthCookies(
        jsonNoStore({ ok: false, error: "Role is not allowed for organization members." }, { status: 400 }),
        organizationContext
      );
    }

    const { data: updatedMembership, error: membershipError } = await admin
      .from("organization_memberships")
      .update({
        role: membershipRole,
        status: "active",
        approved_by: organizationContext.user.id,
        approved_at: new Date().toISOString(),
      })
      .eq("organization_id", organizationContext.activeOrganization!.id)
      .eq("user_id", userId)
      .select("user_id")
      .maybeSingle<{ user_id?: string | null }>();

    if (membershipError) {
      return applyOrganizationAuthCookies(
        jsonNoStore({ ok: false, error: safeErrorMessage(membershipError.message, "Could not update user role.") }, { status: 500 }),
        organizationContext
      );
    }

    if (!asText(updatedMembership?.user_id)) {
      return applyOrganizationAuthCookies(
        jsonNoStore({ ok: false, error: "Organization membership not found." }, { status: 404 }),
        organizationContext
      );
    }

    await admin
      .from("profiles")
      .update({
        role: organizationRoleToLegacyRole(membershipRole),
      })
      .eq("id", userId);
    await syncMemberRoleMetadata(userId, membershipRole, organizationContext.activeOrganization!.id);

    return applyOrganizationAuthCookies(
      jsonNoStore({
        ok: true,
        action: "change_role",
        user_id: userId,
        role: membershipRole,
      }),
      organizationContext
    );
  }

  if (action === "suspend") {
    const { data: updatedMembership, error: membershipError } = await admin
      .from("organization_memberships")
      .update({
        status: "inactive",
      })
      .eq("organization_id", organizationContext.activeOrganization!.id)
      .eq("user_id", userId)
      .select("user_id")
      .maybeSingle<{ user_id?: string | null }>();

    if (membershipError) {
      return applyOrganizationAuthCookies(
        jsonNoStore({ ok: false, error: safeErrorMessage(membershipError.message, "Could not suspend membership.") }, { status: 500 }),
        organizationContext
      );
    }

    if (!asText(updatedMembership?.user_id)) {
      return applyOrganizationAuthCookies(
        jsonNoStore({ ok: false, error: "Organization membership not found." }, { status: 404 }),
        organizationContext
      );
    }

    return applyOrganizationAuthCookies(
      jsonNoStore({
        ok: true,
        action: "suspend",
        user_id: userId,
      }),
      organizationContext
    );
  }

  if (action === "remove") {
    const { error: deleteError } = await admin
      .from("organization_memberships")
      .delete()
      .eq("organization_id", organizationContext.activeOrganization!.id)
      .eq("user_id", userId);

    if (deleteError) {
      return applyOrganizationAuthCookies(
        jsonNoStore({ ok: false, error: safeErrorMessage(deleteError.message, "Could not remove membership.") }, { status: 500 }),
        organizationContext
      );
    }

    return applyOrganizationAuthCookies(
      jsonNoStore({
        ok: true,
        action: "remove",
        user_id: userId,
      }),
      organizationContext
    );
  }

  return applyOrganizationAuthCookies(
    jsonNoStore({ ok: false, error: "Unknown user action." }, { status: 400 }),
    organizationContext
  );
}

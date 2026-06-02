import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "../../lib/supabaseAdminClient";
import {
  ensureProfileForUser,
  getProfileForUser,
  getProfilesByIds,
  type AppProfile,
} from "../../lib/profileServer";
import { getSpLinkFromMetadata } from "../../lib/spAccountLinking";
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
  sp_link_name?: string;
  sp_link_matched_by?: string;
  status: string;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
};

type MembershipDirectoryRow = {
  user_id?: string | null;
  role?: string | null;
  organization_id?: string | null;
  sp_id?: string | null;
};

type SpDirectoryRow = {
  id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  working_email?: string | null;
  email?: string | null;
  organization_id?: string | null;
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

function normalizeEmail(value: unknown) {
  return asText(value).toLowerCase();
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

function getSpDisplayName(sp: SpDirectoryRow | null | undefined) {
  if (!sp) return "";
  return (
    asText(sp.full_name) ||
    [asText(sp.first_name), asText(sp.last_name)].filter(Boolean).join(" ") ||
    "Unnamed SP"
  );
}

function isMissingMembershipSpIdColumn(error: unknown) {
  const message = asText((error as { message?: unknown } | null)?.message);
  const details = asText((error as { details?: unknown } | null)?.details);
  const hint = asText((error as { hint?: unknown } | null)?.hint);
  const text = [message, details, hint].join(" ").toLowerCase();
  return text.includes("organization_memberships.sp_id") || text.includes("column") && text.includes("sp_id");
}

function isMissingProfileSpIdColumn(error: unknown) {
  const message = asText((error as { message?: unknown } | null)?.message);
  const details = asText((error as { details?: unknown } | null)?.details);
  const hint = asText((error as { hint?: unknown } | null)?.hint);
  const text = [message, details, hint].join(" ").toLowerCase();
  return text.includes("profiles.sp_id") || text.includes("column") && text.includes("sp_id");
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

function buildMember(
  user: User,
  profile: AppProfile | null,
  options?: {
    linkedSpId?: string | null;
    linkedSpName?: string | null;
    linkSource?: string | null;
  }
): StaffMember {
  const fullName = asText(profile?.full_name) || getFirstMetadataString(user, "full_name");
  const scheduleName = asText(profile?.schedule_name) || getFirstMetadataString(user, "schedule_name");
  const role = getEffectiveRole(user.email, profile?.role || getFirstMetadataString(user, "role"));
  const isActive = profile?.is_active ?? true;
  const normalizedLinkedSpId = asText(options?.linkedSpId);
  const metadataSpLink = getSpLinkFromMetadata(user.user_metadata, profile?.full_name);
  const linkedSpId = normalizedLinkedSpId || asText(metadataSpLink.sp_id);
  const linkedSpName = asText(options?.linkedSpName) || asText(metadataSpLink.sp_name);
  const linkSource = asText(options?.linkSource);

  return {
    id: user.id,
    full_name: fullName || "",
    email: asText(profile?.email) || asText(user.email) || "",
    role,
    schedule_match_name: scheduleName || "",
    sp_link_status:
      role === "sp"
        ? (linkedSpId
            ? "linked"
            : asText(user.user_metadata?.sp_link_status || metadataSpLink.status || "pending") || "pending")
        : "",
    sp_link_sp_id: role === "sp" ? linkedSpId || "" : "",
    sp_link_name: role === "sp" ? linkedSpName || "" : "",
    sp_link_matched_by: role === "sp" ? (linkSource || asText(metadataSpLink.matched_by) || "") : "",
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
  organizationId: string,
  options?: {
    linkedSpId?: string | null;
    linkedSpName?: string | null;
    linkSource?: string | null;
  }
): StaffMember {
  return {
    ...buildMember(user, profile, options),
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

async function syncMemberSpLinkMetadata(userId: string, organizationId: string, spId: string, spName: string) {
  const admin = createSupabaseAdminClient();
  if (!admin) return "Supabase service role is not configured.";
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user) return safeErrorMessage(error?.message, "Could not load user metadata.");

  const metadata = {
    ...(data.user.user_metadata || {}),
    sp_id: spId,
    linked_sp_id: spId,
    sp_link_sp_id: spId,
    sp_link_status: "linked",
    sp_link_matched_by: "saved_link",
    sp_link_name: spName,
    organization_id: organizationId,
  };
  const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: metadata,
  });
  return updateError ? safeErrorMessage(updateError.message, "Could not update user metadata.") : "";
}

function resolveLinkedSpForMember(args: {
  user: User;
  profile: AppProfile | null;
  membership: { spId: string };
  spById: Map<string, SpDirectoryRow>;
  spIdsByEmail: Map<string, string[]>;
}) {
  const { user, profile, membership, spById, spIdsByEmail } = args;
  const profileSpId = asText((profile as { sp_id?: unknown } | null)?.sp_id);
  const metadataSpLink = getSpLinkFromMetadata(user.user_metadata, profile?.full_name);
  const explicitLinkedSpId = asText(membership.spId) || profileSpId || asText(metadataSpLink.sp_id);
  if (explicitLinkedSpId) {
    const linkedSp = spById.get(explicitLinkedSpId);
    return {
      spId: explicitLinkedSpId,
      spName: getSpDisplayName(linkedSp) || asText(metadataSpLink.sp_name) || "",
      source: asText(membership.spId)
        ? "membership_sp_id"
        : profileSpId
          ? "profile_sp_id"
          : asText(metadataSpLink.matched_by) || "metadata_sp_id",
    };
  }

  const emailCandidates = Array.from(
    new Set(
      [
        normalizeEmail(profile?.email),
        normalizeEmail(user.email),
        normalizeEmail(user.user_metadata?.email),
        normalizeEmail(user.user_metadata?.working_email),
      ].filter(Boolean)
    )
  );

  const matchedIds = Array.from(
    new Set(
      emailCandidates.flatMap((email) => {
        const ids = spIdsByEmail.get(email);
        return ids || [];
      })
    )
  );

  if (matchedIds.length === 1) {
    const spId = matchedIds[0];
    return {
      spId,
      spName: getSpDisplayName(spById.get(spId)),
      source: "email_match",
    };
  }

  return {
    spId: "",
    spName: "",
    source: "",
  };
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
  const currentMembership = organizationContext.memberships.find(
    (membership) =>
      asText(membership.user_id) === asText(user.id) &&
      asText(membership.organization_id) === asText(organizationContext.activeOrganization!.id)
  );
  const currentMembershipSpId = asText((currentMembership as { sp_id?: unknown } | undefined)?.sp_id);
  const currentMember = buildMemberWithOrganizationRole(
    user,
    currentProfile,
    organizationContext.role || "viewer",
    organizationContext.activeOrganization!.id,
    {
      linkedSpId: currentMembershipSpId || asText((currentProfile as { sp_id?: unknown } | null)?.sp_id) || "",
      linkSource: currentMembershipSpId ? "membership_sp_id" : "",
    }
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

  const runMembershipQuery = async (withSpId: boolean) => {
    const membershipSelect = withSpId
      ? "user_id,role,status,organization_id,sp_id"
      : "user_id,role,status,organization_id";
    return admin
      .from("organization_memberships")
      .select(membershipSelect)
      .eq("organization_id", organizationContext.activeOrganization!.id)
      .eq("status", "active");
  };

  let { data: memberships, error: membershipsError } = await runMembershipQuery(true);
  if (membershipsError && isMissingMembershipSpIdColumn(membershipsError)) {
    const fallbackMembershipQuery = await runMembershipQuery(false);
    memberships = fallbackMembershipQuery.data;
    membershipsError = fallbackMembershipQuery.error;
  }

  if (membershipsError) {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, error: safeErrorMessage(membershipsError.message, "Could not load organization memberships.") }, { status: 500 }),
      organizationContext
    );
  }

  const membershipByUserId = new Map(
    ((memberships || []) as MembershipDirectoryRow[]).map((membership) => [
      asText(membership.user_id),
      {
        role: normalizeOrganizationRole(membership.role),
        organizationId: asText(membership.organization_id),
        spId: asText(membership.sp_id),
      },
    ])
  );
  const scopedUsers = authUsersResult.users.filter((authUser) => membershipByUserId.has(authUser.id));
  const directoryProfiles = await getProfilesByIds(scopedUsers.map((item) => item.id));
  const profileMap = new Map(directoryProfiles.profiles.map((profile) => [profile.id, profile]));

  let spDirectory: SpDirectoryRow[] = [];
  let spDirectoryWarning = "";
  const scopedSpResult = await admin
    .from("sps")
    .select("id,organization_id,first_name,last_name,full_name,working_email,email")
    .eq("organization_id", organizationContext.activeOrganization!.id);
  if (scopedSpResult.error) {
    const fallbackSpResult = await admin
      .from("sps")
      .select("id,first_name,last_name,full_name,working_email,email")
      .limit(1000);
    if (fallbackSpResult.error) {
      spDirectoryWarning = safeErrorMessage(fallbackSpResult.error.message, "Could not load SP directory links.");
    } else {
      spDirectory = (fallbackSpResult.data || []) as SpDirectoryRow[];
    }
  } else {
    spDirectory = (scopedSpResult.data || []) as SpDirectoryRow[];
  }
  const spById = new Map(spDirectory.map((sp) => [asText(sp.id), sp]));
  const spIdsByEmail = new Map<string, string[]>();
  spDirectory.forEach((sp) => {
    const spId = asText(sp.id);
    if (!spId) return;
    [normalizeEmail(sp.working_email), normalizeEmail(sp.email)]
      .filter(Boolean)
      .forEach((email) => {
        const current = spIdsByEmail.get(email) || [];
        current.push(spId);
        spIdsByEmail.set(email, current);
      });
  });

  const members = scopedUsers
    .map((authUser) => {
      const membership = membershipByUserId.get(authUser.id);
      const profile = profileMap.get(authUser.id) || null;
      const resolvedSpLink = resolveLinkedSpForMember({
        user: authUser,
        profile,
        membership: {
          spId: asText(membership?.spId),
        },
        spById,
        spIdsByEmail,
      });
      return buildMemberWithOrganizationRole(
        authUser,
        profile,
        membership?.role || "viewer",
        membership?.organizationId || organizationContext.activeOrganization!.id,
        {
          linkedSpId: resolvedSpLink.spId || "",
          linkedSpName: resolvedSpLink.spName || "",
          linkSource: resolvedSpLink.source || "",
        }
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
    ...(
      [directoryProfiles.error, spDirectoryWarning]
        .filter(Boolean)
        .length
        ? { warning: [directoryProfiles.error, spDirectoryWarning].filter(Boolean).join(" ") }
        : {}
    ),
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
  const requestedSpId = asText(body?.sp_id ?? body?.spId);

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

  if (action === "link_sp") {
    if (!requestedSpId) {
      return applyOrganizationAuthCookies(
        jsonNoStore({ ok: false, error: "sp_id is required for SP linking." }, { status: 400 }),
        organizationContext
      );
    }

    const { data: existingMembership, error: existingMembershipError } = await admin
      .from("organization_memberships")
      .select("user_id,organization_id")
      .eq("organization_id", organizationContext.activeOrganization!.id)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle<{ user_id?: string | null; organization_id?: string | null }>();

    if (existingMembershipError) {
      return applyOrganizationAuthCookies(
        jsonNoStore({ ok: false, error: safeErrorMessage(existingMembershipError.message, "Could not load organization membership.") }, { status: 500 }),
        organizationContext
      );
    }

    if (!asText(existingMembership?.user_id)) {
      return applyOrganizationAuthCookies(
        jsonNoStore({ ok: false, error: "Active organization membership not found for this user." }, { status: 404 }),
        organizationContext
      );
    }

    let spLookup = await admin
      .from("sps")
      .select("id,organization_id,first_name,last_name,full_name")
      .eq("id", requestedSpId)
      .eq("organization_id", organizationContext.activeOrganization!.id)
      .maybeSingle<SpDirectoryRow>();
    if (spLookup.error) {
      const fallbackLookup = await admin
        .from("sps")
        .select("id,first_name,last_name,full_name")
        .eq("id", requestedSpId)
        .maybeSingle<SpDirectoryRow>();
      spLookup = fallbackLookup;
    }

    if (spLookup.error) {
      return applyOrganizationAuthCookies(
        jsonNoStore({ ok: false, error: safeErrorMessage(spLookup.error.message, "Could not load SP directory record.") }, { status: 500 }),
        organizationContext
      );
    }

    const linkedSp = spLookup.data || null;
    if (!asText(linkedSp?.id)) {
      return applyOrganizationAuthCookies(
        jsonNoStore({ ok: false, error: "SP directory record not found." }, { status: 404 }),
        organizationContext
      );
    }

    const { data: updatedMembership, error: linkMembershipError } = await admin
      .from("organization_memberships")
      .update({
        sp_id: requestedSpId,
        approved_by: organizationContext.user.id,
        approved_at: new Date().toISOString(),
      })
      .eq("organization_id", organizationContext.activeOrganization!.id)
      .eq("user_id", userId)
      .select("user_id")
      .maybeSingle<{ user_id?: string | null }>();

    if (linkMembershipError) {
      const membershipErrorMessage = isMissingMembershipSpIdColumn(linkMembershipError)
        ? "This deployment is missing organization_memberships.sp_id. Run the latest migration before linking SP directory records."
        : safeErrorMessage(linkMembershipError.message, "Could not save SP directory link.");
      return applyOrganizationAuthCookies(
        jsonNoStore({ ok: false, error: membershipErrorMessage }, { status: 500 }),
        organizationContext
      );
    }

    if (!asText(updatedMembership?.user_id)) {
      return applyOrganizationAuthCookies(
        jsonNoStore({ ok: false, error: "Organization membership not found." }, { status: 404 }),
        organizationContext
      );
    }

    const spName = getSpDisplayName(linkedSp);
    const metadataWarning = await syncMemberSpLinkMetadata(
      userId,
      organizationContext.activeOrganization!.id,
      requestedSpId,
      spName
    );
    const { error: profileLinkError } = await admin
      .from("profiles")
      .update({ sp_id: requestedSpId })
      .eq("id", userId);
    const profileWarning =
      profileLinkError && !isMissingProfileSpIdColumn(profileLinkError)
        ? safeErrorMessage(profileLinkError.message, "Could not update profile SP link.")
        : "";
    const warning = [metadataWarning, profileWarning].filter(Boolean).join(" ");

    return applyOrganizationAuthCookies(
      jsonNoStore({
        ok: true,
        action: "link_sp",
        user_id: userId,
        sp_id: requestedSpId,
        sp_name: spName,
        ...(warning ? { warning } : {}),
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

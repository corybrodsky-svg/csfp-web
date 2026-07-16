import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "../../lib/supabaseAdminClient";
import {
  deriveAccountProvisioningStatus,
  getProvisioningStatusLabel,
  provisionOrganizationAccount,
  type AccountProvisioningStatus,
} from "../../lib/adminAccountProvisioning";
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
  sp_link_email?: string;
  sp_link_matched_by?: string;
  sp_link_reason?: string;
  sp_link_candidate_count?: number;
  sp_link_candidates?: Array<{
    sp_id: string;
    sp_name: string;
    sp_email: string;
    matched_by: string;
  }>;
  status: string;
  account_status?: AccountProvisioningStatus;
  account_status_label?: string;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
};

type StaffSpOption = {
  id: string;
  name: string;
  email: string;
  organization_id: string;
};

type MembershipDirectoryRow = {
  user_id?: string | null;
  role?: string | null;
  status?: string | null;
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

function normalizeName(value: unknown) {
  return asText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function getSpDisplayEmail(sp: SpDirectoryRow | null | undefined) {
  if (!sp) return "";
  return asText(sp.working_email) || asText(sp.email);
}

function buildSpOption(sp: SpDirectoryRow): StaffSpOption {
  return {
    id: asText(sp.id),
    name: getSpDisplayName(sp),
    email: getSpDisplayEmail(sp),
    organization_id: asText(sp.organization_id),
  };
}

function getMemberFullName(user: User, profile: AppProfile | null) {
  return (
    asText(profile?.full_name) ||
    getFirstMetadataString(user, "full_name") ||
    asText(user.user_metadata?.name) ||
    asText(user.email).split("@")[0] ||
    "Account user"
  );
}

function getRequestOrigin(request: Request) {
  const directOrigin = asText(request.headers.get("origin"));
  if (directOrigin) return directOrigin;
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
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
    linkedSpEmail?: string | null;
    linkSource?: string | null;
    linkStatus?: string | null;
    linkReason?: string | null;
    linkCandidates?: StaffMember["sp_link_candidates"];
    membershipStatus?: string | null;
    organizationRole?: OrganizationRole | null;
  }
): StaffMember {
  const fullName = asText(profile?.full_name) || getFirstMetadataString(user, "full_name");
  const scheduleName = asText(profile?.schedule_name) || getFirstMetadataString(user, "schedule_name");
  const role = options?.organizationRole
    ? organizationRoleToLegacyRole(options.organizationRole)
    : getEffectiveRole(user.email, profile?.role || getFirstMetadataString(user, "role"));
  const isActive = profile?.is_active ?? true;
  const membershipStatus = asText(options?.membershipStatus).toLowerCase() || (isActive === false ? "inactive" : "active");
  const normalizedLinkedSpId = asText(options?.linkedSpId);
  const metadataSpLink = getSpLinkFromMetadata(user.user_metadata, profile?.full_name);
  const linkedSpId = normalizedLinkedSpId || asText(metadataSpLink.sp_id);
  const linkedSpName = asText(options?.linkedSpName) || asText(metadataSpLink.sp_name);
  const linkedSpEmail = asText(options?.linkedSpEmail);
  const linkSource = asText(options?.linkSource);
  const linkStatus = asText(options?.linkStatus);
  const linkCandidates = options?.linkCandidates || [];
  const durableSpLinkId = linkSource === "email_match" ? "" : linkedSpId;
  const invitePending = Boolean(
    (asText(user.invited_at) || asText(user.confirmation_sent_at) || asText(user.recovery_sent_at)) &&
      !(asText(user.confirmed_at) || asText(user.email_confirmed_at) || asText(user.last_sign_in_at))
  );

  const status = deriveAccountProvisioningStatus({
    role,
    membershipStatus,
    profileActive: isActive,
    inviteSent: invitePending,
    spLinkId: role === "sp" ? durableSpLinkId : "",
  });

  return {
    id: user.id,
    full_name: fullName || "",
    email: asText(profile?.email) || asText(user.email) || "",
    role,
    schedule_match_name: scheduleName || "",
    sp_link_status:
      role === "sp"
        ? (linkStatus || (linkedSpId ? "linked" : "needs_review"))
        : "",
    sp_link_sp_id: role === "sp" ? linkedSpId || "" : "",
    sp_link_name: role === "sp" ? linkedSpName || "" : "",
    sp_link_email: role === "sp" ? linkedSpEmail || "" : "",
    sp_link_matched_by: role === "sp" ? (linkSource || asText(metadataSpLink.matched_by) || "") : "",
    sp_link_reason: role === "sp" ? asText(options?.linkReason) : "",
    sp_link_candidate_count: role === "sp" ? linkCandidates.length : 0,
    sp_link_candidates: role === "sp" ? linkCandidates : [],
    status: membershipStatus,
    account_status: status,
    account_status_label: getProvisioningStatusLabel(status),
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
    linkedSpEmail?: string | null;
    linkSource?: string | null;
    linkStatus?: string | null;
    linkReason?: string | null;
    linkCandidates?: StaffMember["sp_link_candidates"];
    membershipStatus?: string | null;
  }
): StaffMember {
  return {
    ...buildMember(user, profile, { ...options, organizationRole: membershipRole }),
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

async function loadProvisioningUserProfile(admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>, userId: string) {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user) {
    return {
      user: null as User | null,
      profile: null as AppProfile | null,
      error: safeErrorMessage(error?.message, "Could not load user account."),
    };
  }

  const profileResult = await getProfilesByIds([userId]);
  return {
    user: data.user,
    profile: profileResult.profiles[0] || null,
    error: profileResult.error,
  };
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
  spIdsByName: Map<string, string[]>;
}) {
  const { user, profile, membership, spById, spIdsByEmail, spIdsByName } = args;
  const explicitLinkedSpId = asText(membership.spId);
  if (explicitLinkedSpId) {
    const linkedSp = spById.get(explicitLinkedSpId);
    if (!linkedSp) {
      return {
        spId: "",
        spName: "",
        spEmail: "",
        source: "membership_sp_id",
        status: "invalid_organization",
        reason: "Saved SP ID does not exist in this organization.",
        candidates: [],
      };
    }
    return {
      spId: explicitLinkedSpId,
      spName: getSpDisplayName(linkedSp),
      spEmail: getSpDisplayEmail(linkedSp),
      source: "membership_sp_id",
      status: "linked",
      reason: "Saved organization membership SP link.",
      candidates: [],
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

  const emailMatchedIds = Array.from(
    new Set(
      emailCandidates.flatMap((email) => {
        const ids = spIdsByEmail.get(email);
        return ids || [];
      })
    )
  );

  const scheduleAndNameCandidates = Array.from(
    new Set(
      [
        normalizeName(profile?.schedule_name),
        normalizeName((profile as { schedule_match_name?: unknown } | null)?.schedule_match_name),
        normalizeName(user.user_metadata?.schedule_name),
        normalizeName(user.user_metadata?.schedule_match_name),
        normalizeName(profile?.full_name),
        normalizeName(user.user_metadata?.full_name),
      ].filter(Boolean)
    )
  );
  const nameMatchedIds = Array.from(
    new Set(
      scheduleAndNameCandidates.flatMap((name) => {
        const ids = spIdsByName.get(name);
        return ids || [];
      })
    )
  );
  const candidateIds = Array.from(new Set([...emailMatchedIds, ...nameMatchedIds]));
  const candidates = candidateIds
    .map((spId) => {
      const sp = spById.get(spId);
      if (!sp) return null;
      const matchedBy = emailMatchedIds.includes(spId) ? "email_match" : "name_match";
      return {
        sp_id: spId,
        sp_name: getSpDisplayName(sp),
        sp_email: getSpDisplayEmail(sp),
        matched_by: matchedBy,
      };
    })
    .filter(Boolean) as NonNullable<StaffMember["sp_link_candidates"]>;

  if (candidates.length === 1) {
    return {
      spId: "",
      spName: "",
      spEmail: "",
      source: candidates[0].matched_by,
      status: "needs_review",
      reason: "One possible organization-scoped SP record needs administrator confirmation.",
      candidates,
    };
  }

  if (candidates.length > 1) {
    return {
      spId: "",
      spName: "",
      spEmail: "",
      source: "multiple_candidates",
      status: "multiple_matches",
      reason: emailMatchedIds.length > 1 ? "More than one email match." : "More than one name or schedule alias match.",
      candidates,
    };
  }

  return {
    spId: "",
    spName: "",
    spEmail: "",
    source: "",
    status: "not_found",
    reason: "No organization-scoped SP record matched this account.",
    candidates: [],
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
      membershipStatus: asText(currentMembership?.status) || "active",
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
      memberships: organizationContext.memberships,
      currentUserRole: organizationContext.role,
      isPlatformOwner: organizationContext.isPlatformOwner,
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
      .eq("organization_id", organizationContext.activeOrganization!.id);
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
        status: asText(membership.status) || "active",
      },
    ])
  );
  const scopedUsers = authUsersResult.users.filter((authUser) => membershipByUserId.has(authUser.id));
  const directoryProfiles = await getProfilesByIds(scopedUsers.map((item) => item.id));
  const profileMap = new Map(directoryProfiles.profiles.map((profile) => [profile.id, profile]));

  let spDirectory: SpDirectoryRow[] = [];
  let platformSpDirectory: SpDirectoryRow[] = [];
  let spDirectoryWarning = "";
  const scopedSpResult = await admin
    .from("sps")
    .select("id,organization_id,first_name,last_name,full_name,working_email,email")
    .eq("organization_id", organizationContext.activeOrganization!.id);
  if (scopedSpResult.error) {
    spDirectoryWarning = safeErrorMessage(
      scopedSpResult.error.message,
      "Could not load organization-scoped SP directory links."
    );
  } else {
    spDirectory = (scopedSpResult.data || []) as SpDirectoryRow[];
  }
  if (organizationContext.isPlatformOwner) {
    const platformSpResult = await admin
      .from("sps")
      .select("id,organization_id,first_name,last_name,full_name,working_email,email")
      .order("full_name", { ascending: true })
      .limit(2000);
    if (!platformSpResult.error) {
      platformSpDirectory = (platformSpResult.data || []) as SpDirectoryRow[];
    }
  }
  const spById = new Map(spDirectory.map((sp) => [asText(sp.id), sp]));
  const spIdsByEmail = new Map<string, string[]>();
  const spIdsByName = new Map<string, string[]>();
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
    [normalizeName(sp.full_name), normalizeName([sp.first_name, sp.last_name].map(asText).filter(Boolean).join(" "))]
      .filter(Boolean)
      .forEach((name) => {
        const current = spIdsByName.get(name) || [];
        current.push(spId);
        spIdsByName.set(name, current);
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
        spIdsByName,
      });
      return buildMemberWithOrganizationRole(
        authUser,
        profile,
        membership?.role || "viewer",
        membership?.organizationId || organizationContext.activeOrganization!.id,
        {
          linkedSpId: resolvedSpLink.spId || "",
          linkedSpName: resolvedSpLink.spName || "",
          linkedSpEmail: resolvedSpLink.spEmail || "",
          linkSource: resolvedSpLink.source || "",
          linkStatus: resolvedSpLink.status || "",
          linkReason: resolvedSpLink.reason || "",
          linkCandidates: resolvedSpLink.candidates || [],
          membershipStatus: membership?.status || "active",
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
    spDirectory: spDirectory.map(buildSpOption).filter((sp) => sp.id),
    platformSpDirectory: platformSpDirectory.map(buildSpOption).filter((sp) => sp.id),
    limited: false,
    role,
    activeOrganization: organizationContext.activeOrganization,
    memberships: organizationContext.memberships,
    currentUserRole: organizationContext.role,
    isPlatformOwner: organizationContext.isPlatformOwner,
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

export async function POST(request: Request) {
  const organizationContext = await getOrganizationContext();

  if (!organizationContext.user) return unauthorizedJson(organizationContext);
  if (!requireActiveOrganization(organizationContext)) return noActiveOrganizationJson(organizationContext);
  if (!roleCanManageOrganization(organizationContext.role)) {
    return forbiddenJson("Only platform owners and organization admins can create users.", organizationContext);
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, error: "User management requires a configured Supabase service role." }, { status: 500 }),
      organizationContext
    );
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const fullName = asText(body?.full_name ?? body?.fullName ?? body?.name);
  const email = normalizeEmail(body?.email);
  const role = normalizeMembershipRoleInput(body?.role ?? body?.account_type ?? body?.accountType ?? body?.organization_role);
  const sendInvite = body?.send_invite !== false && body?.sendInvite !== false;

  if (!fullName || !email || !role) {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, error: "Name, email, organization, and account type are required." }, { status: 400 }),
      organizationContext
    );
  }

  if (email === normalizeEmail(organizationContext.user.email) && role === "sp") {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, error: "Do not convert your own admin account into an SP account. Create or update a separate SP login instead." }, { status: 400 }),
      organizationContext
    );
  }

  const origin = getRequestOrigin(request);
  const provisioned = await provisionOrganizationAccount({
    admin,
    organizationId: organizationContext.activeOrganization!.id,
    email,
    fullName,
    role,
    approvedBy: organizationContext.user.id,
    redirectTo: `${origin}/reset-password`,
    sendInvite,
    createAuthUserIfMissing: true,
    allowRoleConversion: false,
    schemaAvailable: organizationContext.schemaAvailable,
  });

  if (!provisioned.ok || !provisioned.user) {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, error: provisioned.error || "Could not create this account." }, { status: 500 }),
      organizationContext
    );
  }

  const status = deriveAccountProvisioningStatus({
    role,
    membershipStatus: "active",
    profileActive: true,
    inviteSent: provisioned.inviteSent,
    spLinkId: role === "sp" ? provisioned.spId : "",
  });

  return applyOrganizationAuthCookies(
    jsonNoStore({
      ok: true,
      action: "create_account",
      user_id: provisioned.user.id,
      role,
      account_status: status,
      account_status_label: getProvisioningStatusLabel(status),
      inviteSent: provisioned.inviteSent,
      userCreated: provisioned.userCreated,
      sp_id: provisioned.spId,
      sp_name: provisioned.spName,
      sp_created: provisioned.spCreated,
      warning: safeErrorMessage(provisioned.warning, ""),
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

    const loaded = await loadProvisioningUserProfile(admin, userId);
    if (!loaded.user) {
      return applyOrganizationAuthCookies(
        jsonNoStore({ ok: false, error: loaded.error || "Could not load user account." }, { status: 404 }),
        organizationContext
      );
    }

    const fullName = getMemberFullName(loaded.user, loaded.profile);
    const email = normalizeEmail(loaded.user.email || loaded.profile?.email);
    if (!email) {
      return applyOrganizationAuthCookies(
        jsonNoStore({ ok: false, error: "This user does not have an email address to provision." }, { status: 400 }),
        organizationContext
      );
    }

    const provisioned = await provisionOrganizationAccount({
      admin,
      existingUser: loaded.user,
      email,
      fullName,
      role: membershipRole,
      organizationId: organizationContext.activeOrganization!.id,
      approvedBy: organizationContext.user.id,
      sendInvite: false,
      createAuthUserIfMissing: false,
      allowRoleConversion: true,
      schemaAvailable: organizationContext.schemaAvailable,
    });

    if (!provisioned.ok) {
      return applyOrganizationAuthCookies(
        jsonNoStore({ ok: false, error: provisioned.error || "Could not update user role." }, { status: 500 }),
        organizationContext
      );
    }

    return applyOrganizationAuthCookies(
      jsonNoStore({
        ok: true,
        action: "change_role",
        user_id: userId,
        role: membershipRole,
        sp_id: provisioned.spId,
        sp_name: provisioned.spName,
        sp_created: provisioned.spCreated,
        warning: safeErrorMessage([loaded.error, provisioned.warning].filter(Boolean).join(" "), ""),
      }),
      organizationContext
    );
  }

  if (action === "repair_sp_link" || action === "link_or_create_sp_profile") {
    const loaded = await loadProvisioningUserProfile(admin, userId);
    if (!loaded.user) {
      return applyOrganizationAuthCookies(
        jsonNoStore({ ok: false, error: loaded.error || "Could not load user account." }, { status: 404 }),
        organizationContext
      );
    }

    const fullName = getMemberFullName(loaded.user, loaded.profile);
    const email = normalizeEmail(loaded.user.email || loaded.profile?.email);
    if (!email) {
      return applyOrganizationAuthCookies(
        jsonNoStore({ ok: false, error: "This user does not have an email address to match or create an SP profile." }, { status: 400 }),
        organizationContext
      );
    }

    const provisioned = await provisionOrganizationAccount({
      admin,
      existingUser: loaded.user,
      email,
      fullName,
      role: "sp",
      organizationId: organizationContext.activeOrganization!.id,
      approvedBy: organizationContext.user.id,
      sendInvite: false,
      createAuthUserIfMissing: false,
      allowRoleConversion: true,
      schemaAvailable: organizationContext.schemaAvailable,
    });

    if (!provisioned.ok || !provisioned.spId) {
      return applyOrganizationAuthCookies(
        jsonNoStore({ ok: false, error: provisioned.error || "Could not link or create the missing SP profile." }, { status: 500 }),
        organizationContext
      );
    }

    return applyOrganizationAuthCookies(
      jsonNoStore({
        ok: true,
        action: "repair_sp_link",
        user_id: userId,
        role: "sp",
        sp_id: provisioned.spId,
        sp_name: provisioned.spName,
        sp_created: provisioned.spCreated,
        warning: safeErrorMessage([loaded.error, provisioned.warning].filter(Boolean).join(" "), ""),
      }),
      organizationContext
    );
  }

  if (action === "resend_invite" || action === "send_invite") {
    const loaded = await loadProvisioningUserProfile(admin, userId);
    if (!loaded.user) {
      return applyOrganizationAuthCookies(
        jsonNoStore({ ok: false, error: loaded.error || "Could not load user account." }, { status: 404 }),
        organizationContext
      );
    }

    const email = normalizeEmail(loaded.user.email || loaded.profile?.email);
    if (!email) {
      return applyOrganizationAuthCookies(
        jsonNoStore({ ok: false, error: "This user does not have an email address for setup delivery." }, { status: 400 }),
        organizationContext
      );
    }

    const origin = getRequestOrigin(request);
    const { error: inviteError } = await admin.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/reset-password`,
    });

    if (inviteError) {
      return applyOrganizationAuthCookies(
        jsonNoStore({ ok: false, error: safeErrorMessage(inviteError.message, "Could not send setup email.") }, { status: 500 }),
        organizationContext
      );
    }

    return applyOrganizationAuthCookies(
      jsonNoStore({
        ok: true,
        action: "resend_invite",
        user_id: userId,
        inviteSent: true,
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

    const spLookup = await admin
      .from("sps")
      .select("id,organization_id,first_name,last_name,full_name,working_email,email")
      .eq("id", requestedSpId)
      .eq("organization_id", organizationContext.activeOrganization!.id)
      .maybeSingle<SpDirectoryRow>();

    if (spLookup.error) {
      return applyOrganizationAuthCookies(
        jsonNoStore({ ok: false, error: safeErrorMessage(spLookup.error.message, "Could not load an organization-scoped SP directory record.") }, { status: 500 }),
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

  if (action === "unlink_sp") {
    const { data: updatedMembership, error: unlinkMembershipError } = await admin
      .from("organization_memberships")
      .update({
        sp_id: null,
        approved_by: organizationContext.user.id,
        approved_at: new Date().toISOString(),
      })
      .eq("organization_id", organizationContext.activeOrganization!.id)
      .eq("user_id", userId)
      .eq("status", "active")
      .select("user_id")
      .maybeSingle<{ user_id?: string | null }>();

    if (unlinkMembershipError) {
      const membershipErrorMessage = isMissingMembershipSpIdColumn(unlinkMembershipError)
        ? "This deployment is missing organization_memberships.sp_id. Run the latest migration before unlinking SP directory records."
        : safeErrorMessage(unlinkMembershipError.message, "Could not clear SP directory link.");
      return applyOrganizationAuthCookies(
        jsonNoStore({ ok: false, error: membershipErrorMessage }, { status: 500 }),
        organizationContext
      );
    }

    if (!asText(updatedMembership?.user_id)) {
      return applyOrganizationAuthCookies(
        jsonNoStore({ ok: false, error: "Active organization membership not found for this user." }, { status: 404 }),
        organizationContext
      );
    }

    return applyOrganizationAuthCookies(
      jsonNoStore({
        ok: true,
        action: "unlink_sp",
        user_id: userId,
      }),
      organizationContext
    );
  }

  if (action === "suspend") {
    const { data: updatedMembership, error: membershipError } = await admin
      .from("organization_memberships")
      .update({
        status: "suspended",
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

  if (action === "reactivate") {
    const { data: updatedMembership, error: membershipError } = await admin
      .from("organization_memberships")
      .update({
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
        jsonNoStore({ ok: false, error: safeErrorMessage(membershipError.message, "Could not reactivate membership.") }, { status: 500 }),
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
        action: "reactivate",
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

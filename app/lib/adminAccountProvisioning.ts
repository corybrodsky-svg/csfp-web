import type { SupabaseClient, User } from "@supabase/supabase-js";
import { organizationRoleToLegacyRole, normalizeOrganizationRole, type OrganizationRole } from "./organizationAuth";
import { sanitizePublicErrorMessage } from "./safeErrorMessage";

export type AccountProvisioningStatus =
  | "pending_invite"
  | "pending_approval"
  | "active"
  | "needs_profile_link"
  | "disabled";

type SupabaseErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

type SpProfileRow = {
  id?: string | null;
  organization_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  working_email?: string | null;
  email?: string | null;
  status?: string | null;
};

type MembershipRoleRow = {
  id?: string | null;
  role?: string | null;
  status?: string | null;
  sp_id?: string | null;
};

export type ProvisionOrganizationAccountResult = {
  ok: boolean;
  user: User | null;
  userCreated: boolean;
  inviteSent: boolean;
  spId: string | null;
  spName: string | null;
  spCreated: boolean;
  error: string;
  warning: string;
};

export const ADMIN_ACCOUNT_ROLES: OrganizationRole[] = ["org_admin", "sim_ops", "sp", "faculty", "viewer"];

export function asProvisioningText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function normalizeProvisioningEmail(value: unknown) {
  return asProvisioningText(value).toLowerCase();
}

export function normalizeProvisioningRole(value: unknown): OrganizationRole {
  const role = normalizeOrganizationRole(value);
  if (ADMIN_ACCOUNT_ROLES.includes(role)) return role;
  return "viewer";
}

export function formatProvisioningRoleLabel(value: unknown) {
  const role = normalizeOrganizationRole(value);
  if (role === "platform_owner") return "Platform Owner";
  if (role === "org_admin") return "Admin";
  if (role === "sim_ops") return "Simulation Operations";
  if (role === "sp") return "SP";
  if (role === "faculty") return "Faculty / Instructor";
  return "Observer / Client";
}

export function getProvisioningStatusLabel(value: AccountProvisioningStatus) {
  if (value === "pending_invite") return "Pending invite";
  if (value === "pending_approval") return "Pending approval";
  if (value === "needs_profile_link") return "Needs profile link";
  if (value === "disabled") return "Disabled";
  return "Active";
}

export function deriveAccountProvisioningStatus(args: {
  role?: unknown;
  membershipStatus?: unknown;
  profileActive?: boolean | null;
  inviteSent?: boolean;
  pendingApproval?: boolean;
  spLinkId?: unknown;
}) {
  const membershipStatus = asProvisioningText(args.membershipStatus).toLowerCase();
  if (membershipStatus === "inactive" || membershipStatus === "disabled" || args.profileActive === false) {
    return "disabled" satisfies AccountProvisioningStatus;
  }
  if (args.pendingApproval) return "pending_approval" satisfies AccountProvisioningStatus;
  if (normalizeOrganizationRole(args.role) === "sp" && !asProvisioningText(args.spLinkId)) {
    return "needs_profile_link" satisfies AccountProvisioningStatus;
  }
  if (args.inviteSent) return "pending_invite" satisfies AccountProvisioningStatus;
  return "active" satisfies AccountProvisioningStatus;
}

function isMissingColumnError(error: unknown, columnName: string) {
  const source = (error && typeof error === "object" ? error : {}) as SupabaseErrorLike;
  const text = [source.code, source.message, source.details, source.hint]
    .map(asProvisioningText)
    .join(" ")
    .toLowerCase();
  return text.includes("42703") || (text.includes(columnName.toLowerCase()) && text.includes("column"));
}

function isMissingRelationError(error: unknown, relationName: string) {
  const source = (error && typeof error === "object" ? error : {}) as SupabaseErrorLike;
  const text = [source.code, source.message, source.details, source.hint]
    .map(asProvisioningText)
    .join(" ")
    .toLowerCase();
  return text.includes("42p01") || text.includes("pgrst205") || text.includes(relationName.toLowerCase());
}

function safeErrorMessage(value: unknown, fallback: string) {
  return sanitizePublicErrorMessage(value, fallback);
}

function splitFullName(value: unknown) {
  const fullName = asProvisioningText(value).replace(/\s+/g, " ");
  if (!fullName) return { firstName: "", lastName: "", fullName: "" };
  const parts = fullName.split(" ");
  if (parts.length === 1) return { firstName: parts[0], lastName: "", fullName };
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts.slice(-1).join(" "),
    fullName,
  };
}

function getSpDisplayName(sp: SpProfileRow | null | undefined, fallbackName?: string | null) {
  return (
    asProvisioningText(sp?.full_name) ||
    [asProvisioningText(sp?.first_name), asProvisioningText(sp?.last_name)].filter(Boolean).join(" ") ||
    asProvisioningText(fallbackName) ||
    "SP"
  );
}

async function listAllAuthUsers(admin: SupabaseClient) {
  const users: User[] = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const batch = data.users || [];
    users.push(...batch);
    if (batch.length < perPage) return users;
    page += 1;
  }
}

export async function findProvisioningAuthUserByEmail(admin: SupabaseClient, email: string) {
  const targetEmail = normalizeProvisioningEmail(email);
  if (!targetEmail) return null;
  const users = await listAllAuthUsers(admin);
  return users.find((user) => normalizeProvisioningEmail(user.email) === targetEmail) || null;
}

async function loadMembership(admin: SupabaseClient, organizationId: string, userId: string) {
  const result = await admin
    .from("organization_memberships")
    .select("id,role,status,sp_id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle<MembershipRoleRow>();
  if (!result.error) return { membership: result.data || null, warning: "" };
  if (!isMissingColumnError(result.error, "sp_id")) throw result.error;
  const fallback = await admin
    .from("organization_memberships")
    .select("id,role,status")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle<MembershipRoleRow>();
  if (fallback.error) throw fallback.error;
  return {
    membership: fallback.data || null,
    warning: "organization_memberships.sp_id is missing. Apply the latest migration to store durable SP profile links.",
  };
}

async function validateRoleConversion(args: {
  admin: SupabaseClient;
  user: User;
  organizationId: string;
  targetRole: OrganizationRole;
  allowRoleConversion?: boolean;
}) {
  if (args.targetRole !== "sp" || args.allowRoleConversion) return "";
  const { membership } = await loadMembership(args.admin, args.organizationId, args.user.id);
  const existingRole = normalizeOrganizationRole(membership?.role);
  const existingStatus = asProvisioningText(membership?.status).toLowerCase();
  if (existingRole !== "sp" && existingStatus && existingStatus !== "inactive" && existingStatus !== "disabled") {
    return "A user with this email already has non-SP access in this organization. Change their role explicitly from Accounts / People instead of converting them during SP creation.";
  }
  return "";
}

async function findSpByEmail(args: {
  admin: SupabaseClient;
  organizationId: string;
  email: string;
  schemaAvailable?: boolean;
}) {
  const email = normalizeProvisioningEmail(args.email);
  if (!email) return null;

  const runQuery = async (column: "working_email" | "email", withOrganizationScope: boolean) => {
    let query = args.admin
      .from("sps")
      .select("id,organization_id,first_name,last_name,full_name,working_email,email,status")
      .ilike(column, email)
      .limit(2);
    if (withOrganizationScope && args.organizationId) query = query.eq("organization_id", args.organizationId);
    return query.returns<SpProfileRow[]>();
  };

  for (const column of ["working_email", "email"] as const) {
    const result = await runQuery(column, Boolean(args.schemaAvailable && args.organizationId));
    if (result.error && args.schemaAvailable && isMissingColumnError(result.error, "organization_id")) {
      throw new Error("sps.organization_id is required before organization-scoped SP account linking can run.");
    }
    if (result.error) throw result.error;
    const rows = (result.data || []).filter((row) => {
      const rowOrg = asProvisioningText(row.organization_id);
      return !args.organizationId || rowOrg === args.organizationId;
    });
    if (rows[0]) return rows[0];
  }

  return null;
}

async function createSpProfile(args: {
  admin: SupabaseClient;
  organizationId: string;
  email: string;
  fullName: string;
  schemaAvailable?: boolean;
}) {
  const name = splitFullName(args.fullName);
  const payload = {
    first_name: name.firstName || null,
    last_name: name.lastName || null,
    full_name: name.fullName,
    working_email: normalizeProvisioningEmail(args.email),
    email: normalizeProvisioningEmail(args.email),
    status: "Active",
    ...(args.schemaAvailable ? { organization_id: args.organizationId } : {}),
  };

  const runInsert = async (withOrganizationId: boolean) => {
    const insertPayload = withOrganizationId
      ? payload
      : Object.fromEntries(Object.entries(payload).filter(([key]) => key !== "organization_id"));
    return args.admin
      .from("sps")
      .insert(insertPayload)
      .select("id,organization_id,first_name,last_name,full_name,working_email,email,status")
      .single<SpProfileRow>();
  };

  const result = await runInsert(Boolean(args.schemaAvailable && args.organizationId));
  if (result.error && args.schemaAvailable && isMissingColumnError(result.error, "organization_id")) {
    throw new Error("sps.organization_id is required before organization-scoped SP records can be created.");
  }
  if (result.error) throw result.error;
  return result.data || null;
}

export async function findOrCreateSpProfileForAccount(args: {
  admin: SupabaseClient;
  organizationId: string;
  email: string;
  fullName: string;
  schemaAvailable?: boolean;
}) {
  const existing = await findSpByEmail(args);
  if (existing) {
    return {
      sp: existing,
      created: false,
    };
  }

  const created = await createSpProfile(args);
  if (!created?.id) throw new Error("Could not create SP profile for this account.");
  return {
    sp: created,
    created: true,
  };
}

async function updateAuthMetadata(args: {
  admin: SupabaseClient;
  user: User;
  organizationId: string;
  role: OrganizationRole;
  fullName: string;
  sp?: SpProfileRow | null;
}) {
  const spId = asProvisioningText(args.sp?.id);
  const spName = args.sp ? getSpDisplayName(args.sp, args.fullName) : "";
  const metadata = {
    ...(args.user.user_metadata || {}),
    full_name: args.fullName,
    schedule_name: args.fullName,
    role: organizationRoleToLegacyRole(args.role),
    organization_role: args.role,
    organization_id: args.organizationId,
    ...(args.role === "sp" && spId
      ? {
          sp_id: spId,
          linked_sp_id: spId,
          sp_link_sp_id: spId,
          sp_link_status: "linked",
          sp_link_matched_by: "saved_link",
          sp_link_name: spName,
        }
      : {}),
  };

  if (args.role !== "sp") {
    delete (metadata as Record<string, unknown>).sp_id;
    delete (metadata as Record<string, unknown>).linked_sp_id;
    delete (metadata as Record<string, unknown>).sp_link_sp_id;
    delete (metadata as Record<string, unknown>).sp_link_status;
    delete (metadata as Record<string, unknown>).sp_link_matched_by;
    delete (metadata as Record<string, unknown>).sp_link_name;
  }

  const { data, error } = await args.admin.auth.admin.updateUserById(args.user.id, {
    user_metadata: metadata,
  });
  if (error) throw error;
  return data.user || args.user;
}

async function upsertProfile(args: {
  admin: SupabaseClient;
  user: User;
  email: string;
  fullName: string;
  role: OrganizationRole;
  sp?: SpProfileRow | null;
}) {
  const spId = asProvisioningText(args.sp?.id);
  const payload = {
    id: args.user.id,
    email: args.email,
    full_name: args.fullName || null,
    schedule_name: args.fullName || null,
    role: organizationRoleToLegacyRole(args.role),
    is_active: true,
    ...(args.role === "sp" && spId ? { sp_id: spId } : { sp_id: null }),
  };

  const result = await args.admin
    .from("profiles")
    .upsert(payload, { onConflict: "id" })
    .select("id")
    .maybeSingle();
  if (!result.error) return "";
  if (!isMissingColumnError(result.error, "sp_id")) {
    if (isMissingRelationError(result.error, "profiles")) return "";
    throw result.error;
  }
  const fallbackPayload = { ...payload };
  delete (fallbackPayload as { sp_id?: string | null }).sp_id;
  const fallback = await args.admin
    .from("profiles")
    .upsert(fallbackPayload, { onConflict: "id" })
    .select("id")
    .maybeSingle();
  if (fallback.error && !isMissingRelationError(fallback.error, "profiles")) throw fallback.error;
  return args.role === "sp" ? "profiles.sp_id is missing, so the SP link was stored on membership and auth metadata." : "";
}

async function upsertMembership(args: {
  admin: SupabaseClient;
  userId: string;
  organizationId: string;
  role: OrganizationRole;
  approvedBy: string;
  sp?: SpProfileRow | null;
}) {
  const spId = asProvisioningText(args.sp?.id);
  const payload = {
    organization_id: args.organizationId,
    user_id: args.userId,
    role: args.role,
    status: "active",
    approved_by: args.approvedBy,
    approved_at: new Date().toISOString(),
    ...(args.role === "sp" && spId ? { sp_id: spId } : { sp_id: null }),
  };

  const result = await args.admin
    .from("organization_memberships")
    .upsert(payload, { onConflict: "organization_id,user_id" })
    .select("id")
    .maybeSingle();
  if (!result.error) return "";
  if (!isMissingColumnError(result.error, "sp_id")) throw result.error;
  const fallbackPayload = { ...payload };
  delete (fallbackPayload as { sp_id?: string | null }).sp_id;
  const fallback = await args.admin
    .from("organization_memberships")
    .upsert(fallbackPayload, { onConflict: "organization_id,user_id" })
    .select("id")
    .maybeSingle();
  if (fallback.error) throw fallback.error;
  return args.role === "sp"
    ? "organization_memberships.sp_id is missing, so the SP login can only be matched by profile/auth metadata until the latest migration is applied."
    : "";
}

async function upsertCommunicationPreference(args: {
  admin: SupabaseClient;
  organizationId: string;
  sp?: SpProfileRow | null;
}) {
  const spId = asProvisioningText(args.sp?.id);
  if (!spId) return "";
  const result = await args.admin
    .from("sp_communication_preferences")
    .upsert(
      {
        organization_id: args.organizationId,
        sp_id: spId,
        preferred_mode: "portal",
        portal_status: "linked",
        onboarding_status: "complete",
      },
      { onConflict: "organization_id,sp_id" }
    )
    .select("id")
    .maybeSingle();
  if (!result.error || isMissingRelationError(result.error, "sp_communication_preferences")) return "";
  throw result.error;
}

export async function provisionOrganizationAccount(args: {
  admin: SupabaseClient;
  organizationId: string;
  email: string;
  fullName: string;
  role: OrganizationRole;
  approvedBy: string;
  existingUser?: User | null;
  redirectTo?: string;
  sendInvite?: boolean;
  createAuthUserIfMissing?: boolean;
  allowRoleConversion?: boolean;
  schemaAvailable?: boolean;
}): Promise<ProvisionOrganizationAccountResult> {
  const role = normalizeProvisioningRole(args.role);
  const email = normalizeProvisioningEmail(args.email);
  const fullName = asProvisioningText(args.fullName);
  const warnings: string[] = [];

  if (!email || !fullName || !args.organizationId) {
    return {
      ok: false,
      user: null,
      userCreated: false,
      inviteSent: false,
      spId: null,
      spName: null,
      spCreated: false,
      warning: "",
      error: "Name, email, organization, and role are required.",
    };
  }

  try {
    let user = args.existingUser || (await findProvisioningAuthUserByEmail(args.admin, email));
    let userCreated = false;
    let inviteSent = false;

    if (user) {
      const conversionError = await validateRoleConversion({
        admin: args.admin,
        user,
        organizationId: args.organizationId,
        targetRole: role,
        allowRoleConversion: args.allowRoleConversion,
      });
      if (conversionError) {
        return {
          ok: false,
          user,
          userCreated: false,
          inviteSent: false,
          spId: null,
          spName: null,
          spCreated: false,
          warning: "",
          error: conversionError,
        };
      }
    }

    if (!user) {
      if (args.sendInvite !== false) {
        const { data, error } = await args.admin.auth.admin.inviteUserByEmail(email, {
          redirectTo: args.redirectTo,
          data: {
            full_name: fullName,
            schedule_name: fullName,
            role: organizationRoleToLegacyRole(role),
            organization_role: role,
            organization_id: args.organizationId,
          },
        });
        if (error || !data.user) throw error || new Error("Could not create invited user.");
        user = data.user;
        userCreated = true;
        inviteSent = true;
      } else if (args.createAuthUserIfMissing) {
        const { data, error } = await args.admin.auth.admin.createUser({
          email,
          email_confirm: false,
          user_metadata: {
            full_name: fullName,
            schedule_name: fullName,
            role: organizationRoleToLegacyRole(role),
            organization_role: role,
            organization_id: args.organizationId,
          },
        });
        if (error || !data.user) throw error || new Error("Could not create user.");
        user = data.user;
        userCreated = true;
      }
    }

    if (!user) {
      return {
        ok: false,
        user: null,
        userCreated,
        inviteSent,
        spId: null,
        spName: null,
        spCreated: false,
        warning: "",
        error: "Could not create or load the auth user.",
      };
    }

    let sp: SpProfileRow | null = null;
    let spCreated = false;
    if (role === "sp") {
      const spResult = await findOrCreateSpProfileForAccount({
        admin: args.admin,
        organizationId: args.organizationId,
        email,
        fullName,
        schemaAvailable: args.schemaAvailable,
      });
      sp = spResult.sp;
      spCreated = spResult.created;
      if (!asProvisioningText(sp?.id)) {
        return {
          ok: false,
          user,
          userCreated,
          inviteSent,
          spId: null,
          spName: null,
          spCreated,
          warning: warnings.join(" "),
          error: "Could not create or link the required SP profile.",
        };
      }
    }

    const metadataUser = await updateAuthMetadata({
      admin: args.admin,
      user,
      organizationId: args.organizationId,
      role,
      fullName,
      sp,
    });
    user = metadataUser;
    warnings.push(await upsertProfile({ admin: args.admin, user, email, fullName, role, sp }));
    warnings.push(await upsertMembership({
      admin: args.admin,
      userId: user.id,
      organizationId: args.organizationId,
      role,
      approvedBy: args.approvedBy,
      sp,
    }));
    if (role === "sp") {
      warnings.push(await upsertCommunicationPreference({
        admin: args.admin,
        organizationId: args.organizationId,
        sp,
      }));
    }

    return {
      ok: true,
      user,
      userCreated,
      inviteSent,
      spId: asProvisioningText(sp?.id) || null,
      spName: sp ? getSpDisplayName(sp, fullName) : null,
      spCreated,
      warning: warnings.filter(Boolean).join(" "),
      error: "",
    };
  } catch (error) {
    return {
      ok: false,
      user: null,
      userCreated: false,
      inviteSent: false,
      spId: null,
      spName: null,
      spCreated: false,
      warning: warnings.filter(Boolean).join(" "),
      error: safeErrorMessage(error instanceof Error ? error.message : String(error), "Could not provision this account."),
    };
  }
}

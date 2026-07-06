import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { sanitizePublicErrorMessage } from "../../lib/safeErrorMessage";
import { createSupabaseAdminClient } from "../../lib/supabaseAdminClient";
import { isMissingPreferenceSchemaError } from "../../lib/spCommunicationPreferences";
import { isMissingPortalInviteSchemaError } from "../../lib/spPortalInvites";
import {
  createSupabaseUserClient,
  forbiddenJson,
  getOrganizationContext,
  noActiveOrganizationJson,
  requireActiveOrganization,
  roleCanManageOrganization,
  roleCanOperateOrganization,
  unauthorizedJson,
  type OrganizationRole,
} from "../../lib/organizationAuth";

export const dynamic = "force-dynamic";

const spSelectColumns =
  "id,first_name,last_name,full_name,working_email,email,phone,secondary_phone,portrayal_age,race,sex,status,do_not_hire_for,telehealth,pt_preferred,other_roles,birth_year,secondary_email,speaks_spanish,notes,created_at";
const SP_LOAD_ERROR_MESSAGE = "Could not load SP database right now. Please retry.";

type SPDuplicateCandidate = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  working_email: string | null;
  phone: string | null;
};

type SupabaseErrorLike = {
  message?: string | null;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
};

type SPPortalSummary = {
  profile_status: string;
  portal_login_status: "no_login" | "invite_pending" | "linked" | "inactive" | "disabled" | "needs_help";
  portal_login_status_label: string;
  portal_status: string;
  onboarding_status: string;
  linked_user_id: string | null;
  linked_user_email: string | null;
  linked_user_role: string | null;
  linked_user_last_sign_in_at: string | null;
  last_portal_invite_sent_at: string | null;
  latest_invite_status: string | null;
  active_invite_expires_at: string | null;
};

type SPDirectoryRow = {
  id?: string | null;
  status?: string | null;
  [key: string]: unknown;
};

type SPPreferenceRow = {
  sp_id?: string | null;
  portal_status?: string | null;
  onboarding_status?: string | null;
  last_invited_at?: string | null;
};

type SPInviteRow = {
  sp_id?: string | null;
  status?: string | null;
  expires_at?: string | null;
  accepted_at?: string | null;
  created_at?: string | null;
  accepted_by?: string | null;
};

type SPMembershipRow = {
  user_id?: string | null;
  sp_id?: string | null;
  role?: string | null;
  status?: string | null;
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function toSupabaseError(error: unknown): SupabaseErrorLike {
  if (!error || typeof error !== "object") return {};
  const source = error as SupabaseErrorLike;
  return {
    message: source.message || null,
    code: source.code || null,
    details: source.details || null,
    hint: source.hint || null,
  };
}

function isMissingColumnError(error: unknown, columnName: string) {
  const source = toSupabaseError(error);
  const message = asText(source.message).toLowerCase();
  const code = asText(source.code).toLowerCase();
  const target = columnName.toLowerCase();
  if (code === "42703") return true;
  if (!message) return false;
  return (
    message.includes(target) &&
    (message.includes("does not exist") ||
      message.includes("could not find") ||
      message.includes("schema cache") ||
      message.includes("column"))
  );
}

function isMissingOrganizationColumnError(error: unknown) {
  return isMissingColumnError(error, "organization_id");
}

function getMissingColumnName(error: unknown) {
  const source = toSupabaseError(error);
  const text = [source.message, source.details, source.hint].map(asText).join(" ");
  const match = text.match(/column\s+["']?([a-zA-Z0-9_.]+)["']?\s+(?:of relation .* )?does not exist/i);
  if (match?.[1]) return match[1];
  if (/organization_id/i.test(text)) return "organization_id";
  return "";
}

function canUsePrivilegedSpDirectoryRead(role: OrganizationRole | null | undefined, legacyRole: string) {
  return (
    roleCanOperateOrganization(role) ||
    legacyRole === "super_admin" ||
    legacyRole === "admin" ||
    legacyRole === "sim_op"
  );
}

function logSpsFailure(stage: string, error: unknown, extra?: Record<string, unknown>) {
  const source = toSupabaseError(error);
  console.error("[api/sps] failed", {
    stage,
    message: source.message || "",
    code: source.code || "",
    details: source.details || "",
    hint: source.hint || "",
    missingColumn: getMissingColumnName(error) || "",
    ...(extra || {}),
  });
}

function normalizeEmail(value: unknown) {
  return asText(value).toLowerCase();
}

function normalizePhone(value: unknown) {
  return asText(value).replace(/\D/g, "");
}

function getFullName(sp: Partial<SPDuplicateCandidate>) {
  return (
    asText(sp.full_name) ||
    [sp.first_name, sp.last_name].map(asText).filter(Boolean).join(" ")
  );
}

function buildSpInsertPayload(payload: Record<string, unknown>) {
  const firstName = asText(payload.first_name);
  const lastName = asText(payload.last_name);
  const fullName = [firstName, lastName].filter(Boolean).join(" ");

  return {
    ...payload,
    first_name: firstName || null,
    last_name: lastName || null,
    full_name: fullName,
    working_email: normalizeEmail(payload.working_email) || null,
    phone: asText(payload.phone) || null,
    portrayal_age: asText(payload.portrayal_age) || null,
    race: asText(payload.race) || null,
    sex: asText(payload.sex) || null,
    telehealth: asText(payload.telehealth) || null,
    pt_preferred: asText(payload.pt_preferred) || null,
    other_roles: asText(payload.other_roles) || null,
    status: asText(payload.status) || "Active",
    notes: asText(payload.notes) || null,
  };
}

function normalizeName(value: unknown) {
  return asText(value).replace(/\s+/g, " ").toLowerCase();
}

function duplicateResponse() {
  return NextResponse.json({ error: "SP already exists" }, { status: 409 });
}

function defaultPortalSummary(sp: SPDirectoryRow): SPPortalSummary {
  const profileStatus = asText(sp.status) || "Active";
  const normalizedProfileStatus = profileStatus.toLowerCase();
  const disabled = normalizedProfileStatus.includes("inactive") || normalizedProfileStatus.includes("disabled");
  return {
    profile_status: profileStatus,
    portal_login_status: disabled ? "disabled" : "no_login",
    portal_login_status_label: disabled ? "Profile inactive; portal login disabled" : "No portal login yet",
    portal_status: "not_invited",
    onboarding_status: "not_started",
    linked_user_id: null,
    linked_user_email: null,
    linked_user_role: null,
    linked_user_last_sign_in_at: null,
    last_portal_invite_sent_at: null,
    latest_invite_status: null,
    active_invite_expires_at: null,
  };
}

function userById(users: User[]) {
  return new Map(users.map((user) => [user.id, user]));
}

async function listAllAuthUsersForSpStatus(admin: SupabaseClient) {
  const authAdmin = admin.auth.admin;
  const users: User[] = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await authAdmin.listUsers({ page, perPage });
    if (error) throw error;
    const batch = data.users || [];
    users.push(...batch);
    if (batch.length < perPage) break;
    page += 1;
  }

  return users;
}

function isActiveInvite(invite: SPInviteRow | null | undefined) {
  if (!invite) return false;
  const status = asText(invite.status).toLowerCase();
  if (status !== "active") return false;
  const expiresAt = asText(invite.expires_at);
  if (!expiresAt) return true;
  const parsed = new Date(expiresAt);
  return Number.isNaN(parsed.getTime()) || parsed.getTime() > Date.now();
}

async function loadSpPortalSummaries(args: {
  db: SupabaseClient;
  organizationId: string;
  spRows: SPDirectoryRow[];
}) {
  const { db, organizationId, spRows } = args;
  const spIds = spRows.map((sp) => asText(sp.id)).filter(Boolean);
  const summaries = new Map(spRows.map((sp) => [asText(sp.id), defaultPortalSummary(sp)]));
  if (!spIds.length || !organizationId) return summaries;

  let preferences: SPPreferenceRow[] = [];
  const preferencesResult = await db
    .from("sp_communication_preferences")
    .select("sp_id,portal_status,onboarding_status,last_invited_at")
    .eq("organization_id", organizationId)
    .in("sp_id", spIds);
  if (preferencesResult.error) {
    if (!isMissingPreferenceSchemaError(preferencesResult.error)) throw preferencesResult.error;
  } else {
    preferences = (preferencesResult.data || []) as SPPreferenceRow[];
  }

  let invites: SPInviteRow[] = [];
  const invitesResult = await db
    .from("sp_portal_invites")
    .select("sp_id,status,expires_at,accepted_at,created_at,accepted_by")
    .eq("organization_id", organizationId)
    .in("sp_id", spIds)
    .order("created_at", { ascending: false });
  if (invitesResult.error) {
    if (!isMissingPortalInviteSchemaError(invitesResult.error)) throw invitesResult.error;
  } else {
    invites = (invitesResult.data || []) as SPInviteRow[];
  }

  let memberships: SPMembershipRow[] = [];
  const membershipsResult = await db
    .from("organization_memberships")
    .select("user_id,sp_id,role,status")
    .eq("organization_id", organizationId)
    .in("sp_id", spIds);
  if (membershipsResult.error) {
    if (!isMissingColumnError(membershipsResult.error, "sp_id")) throw membershipsResult.error;
  } else {
    memberships = (membershipsResult.data || []) as SPMembershipRow[];
  }

  let authUsersById = new Map<string, User>();
  if (memberships.length) {
    authUsersById = userById(await listAllAuthUsersForSpStatus(db));
  }

  const preferenceBySpId = new Map(preferences.map((row) => [asText(row.sp_id), row]));
  const invitesBySpId = new Map<string, SPInviteRow[]>();
  invites.forEach((invite) => {
    const spId = asText(invite.sp_id);
    if (!spId) return;
    const current = invitesBySpId.get(spId) || [];
    current.push(invite);
    invitesBySpId.set(spId, current);
  });
  const membershipsBySpId = new Map<string, SPMembershipRow[]>();
  memberships.forEach((membership) => {
    const spId = asText(membership.sp_id);
    if (!spId) return;
    const current = membershipsBySpId.get(spId) || [];
    current.push(membership);
    membershipsBySpId.set(spId, current);
  });

  spRows.forEach((sp) => {
    const spId = asText(sp.id);
    if (!spId) return;
    const summary = summaries.get(spId) || defaultPortalSummary(sp);
    const preference = preferenceBySpId.get(spId) || null;
    const spInvites = invitesBySpId.get(spId) || [];
    const latestInvite = spInvites[0] || null;
    const activeInvite = spInvites.find(isActiveInvite) || null;
    const linkedMembership =
      (membershipsBySpId.get(spId) || []).find((membership) => asText(membership.status).toLowerCase() === "active") ||
      (membershipsBySpId.get(spId) || [])[0] ||
      null;
    const linkedUser = linkedMembership ? authUsersById.get(asText(linkedMembership.user_id)) || null : null;
    const linkedUserRole = asText(linkedMembership?.role).toLowerCase();
    const portalStatus = asText(preference?.portal_status) || summary.portal_status;
    const onboardingStatus = asText(preference?.onboarding_status) || summary.onboarding_status;
    const isLinked = Boolean(linkedUser && linkedUserRole === "sp");
    const inactiveLogin = Boolean(linkedMembership && asText(linkedMembership.status).toLowerCase() !== "active");
    const disabled = summary.portal_login_status === "disabled" || portalStatus === "disabled";
    const needsHelp = portalStatus === "needs_help" || onboardingStatus === "needs_help";

    summaries.set(spId, {
      ...summary,
      portal_status: portalStatus,
      onboarding_status: onboardingStatus,
      last_portal_invite_sent_at: asText(preference?.last_invited_at) || asText(latestInvite?.created_at) || null,
      latest_invite_status: asText(latestInvite?.status) || null,
      active_invite_expires_at: asText(activeInvite?.expires_at) || null,
      linked_user_id: linkedUser?.id || asText(linkedMembership?.user_id) || null,
      linked_user_email: asText(linkedUser?.email) || null,
      linked_user_role: linkedUserRole || null,
      linked_user_last_sign_in_at: asText(linkedUser?.last_sign_in_at) || null,
      portal_login_status: disabled
        ? "disabled"
        : needsHelp
          ? "needs_help"
          : isLinked
            ? "linked"
            : inactiveLogin
              ? "inactive"
              : activeInvite
                ? "invite_pending"
                : "no_login",
      portal_login_status_label: disabled
        ? "Portal login disabled"
        : needsHelp
          ? "Portal login needs help"
          : isLinked
            ? "Linked SP portal account"
            : inactiveLogin
              ? "Inactive linked login"
              : activeInvite
                ? "Pending portal invite"
                : "No portal login yet",
    });
  });

  return summaries;
}

export async function GET() {
  try {
    const organizationContext = await getOrganizationContext();
    if (!organizationContext.user) return unauthorizedJson(organizationContext);
    if (!requireActiveOrganization(organizationContext)) return noActiveOrganizationJson(organizationContext);
    if (organizationContext.role === "sp") {
      return forbiddenJson("SP accounts cannot open the SP database.", organizationContext);
    }

    const activeOrganizationId = asText(organizationContext.activeOrganization?.id);
    const privilegedRead = canUsePrivilegedSpDirectoryRead(organizationContext.role, organizationContext.legacyRole);
    const adminClient = privilegedRead ? createSupabaseAdminClient() : null;
    const supabaseServer = adminClient || createSupabaseUserClient(organizationContext.accessToken);
    const includeLegacyUnscopedRows =
      organizationContext.role === "platform_owner" ||
      organizationContext.role === "org_admin" ||
      organizationContext.legacyRole === "super_admin" ||
      organizationContext.legacyRole === "admin";

    const runQuery = async (mode: "scoped" | "scoped_plus_legacy" | "unscoped_no_org_column") => {
      let query = supabaseServer
        .from("sps")
        .select(spSelectColumns)
        .order("last_name", { ascending: true })
        .order("first_name", { ascending: true })
        .limit(500);
      if (mode === "scoped" && organizationContext.schemaAvailable && activeOrganizationId) {
        query = query.eq("organization_id", activeOrganizationId);
      } else if (mode === "scoped_plus_legacy" && organizationContext.schemaAvailable && activeOrganizationId) {
        query = query.or(`organization_id.eq.${activeOrganizationId},organization_id.is.null`);
      }
      const result = await query;
      return {
        data: result.data || [],
        error: result.error as SupabaseErrorLike | null,
      };
    };

    const initialMode =
      organizationContext.schemaAvailable && activeOrganizationId
        ? includeLegacyUnscopedRows
          ? "scoped_plus_legacy"
          : "scoped"
        : "unscoped_no_org_column";

    let result = await runQuery(initialMode);
    if (result.error && organizationContext.schemaAvailable && isMissingOrganizationColumnError(result.error)) {
      logSpsFailure("load-scope-fallback", result.error, {
        statusCode: 500,
        role: organizationContext.legacyRole,
        organizationRole: organizationContext.role,
        activeOrganizationId,
        adminClientUsed: Boolean(adminClient),
      });
      result = await runQuery("unscoped_no_org_column");
    }

    if (result.error) {
      logSpsFailure("load-query", result.error, {
        statusCode: 500,
        role: organizationContext.legacyRole,
        organizationRole: organizationContext.role,
        activeOrganizationId,
        adminClientUsed: Boolean(adminClient),
      });
      return NextResponse.json(
        { error: SP_LOAD_ERROR_MESSAGE },
        { status: 500 }
      );
    }

    const rows = (result.data || []) as SPDirectoryRow[];
    const portalSummaries =
      adminClient && activeOrganizationId
        ? await loadSpPortalSummaries({
            db: adminClient,
            organizationId: activeOrganizationId,
            spRows: rows,
          }).catch((error) => {
            logSpsFailure("portal-status-summary", error, {
              role: organizationContext.legacyRole,
              organizationRole: organizationContext.role,
              activeOrganizationId,
            });
            return new Map(rows.map((sp) => [asText(sp.id), defaultPortalSummary(sp)]));
          })
        : new Map(rows.map((sp) => [asText(sp.id), defaultPortalSummary(sp)]));

    return NextResponse.json({
      can_manage_sp_portal_accounts: roleCanManageOrganization(organizationContext.role),
      sps: rows.map((sp) => ({
        ...sp,
        ...(portalSummaries.get(asText(sp.id)) || defaultPortalSummary(sp)),
      })),
    });
  } catch (error) {
    logSpsFailure("load-threw", error, { statusCode: 500 });
    return NextResponse.json(
      { error: SP_LOAD_ERROR_MESSAGE },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const organizationContext = await getOrganizationContext();
    if (!organizationContext.user) return unauthorizedJson(organizationContext);
    if (!requireActiveOrganization(organizationContext)) return noActiveOrganizationJson(organizationContext);
    if (!roleCanOperateOrganization(organizationContext.role)) {
      return forbiddenJson("Only Sim Ops or admin accounts can manage the SP database.", organizationContext);
    }

    const rawPayload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!rawPayload || typeof rawPayload !== "object") {
      return NextResponse.json(
        { error: "Invalid JSON body." },
        { status: 400 }
      );
    }

    const activeOrganizationId = asText(organizationContext.activeOrganization?.id);
    const privilegedWrite = canUsePrivilegedSpDirectoryRead(organizationContext.role, organizationContext.legacyRole);
    const adminClient = privilegedWrite ? createSupabaseAdminClient() : null;
    const supabaseServer = adminClient || createSupabaseUserClient(organizationContext.accessToken);

    const payload = {
      ...buildSpInsertPayload(rawPayload),
      ...(organizationContext.schemaAvailable
        ? { organization_id: activeOrganizationId }
        : {}),
    };
    const workingEmail = normalizeEmail(payload.working_email);
    const fullNameText = getFullName(payload);
    const fullName = normalizeName(fullNameText);
    const phone = normalizePhone(payload.phone);

    if (!asText(payload.first_name) && !asText(payload.last_name)) {
      return NextResponse.json(
        { error: "Enter at least a first or last name before saving an SP." },
        { status: 400 }
      );
    }

    if (!fullNameText) {
      return NextResponse.json(
        { error: "SP full name could not be generated. Enter at least one name field." },
        { status: 400 }
      );
    }

    if (workingEmail) {
      const runEmailDuplicateQuery = async (mode: "scoped" | "unscoped_no_org_column") => {
        let emailQuery = supabaseServer
          .from("sps")
          .select("id,working_email")
          .ilike("working_email", workingEmail)
          .limit(1);
        if (mode === "scoped" && organizationContext.schemaAvailable && activeOrganizationId) {
          emailQuery = emailQuery.eq("organization_id", activeOrganizationId);
        }
        return emailQuery.returns<Pick<SPDuplicateCandidate, "id" | "working_email">[]>();
      };

      let { data: emailMatches, error: duplicateError } = await runEmailDuplicateQuery("scoped");
      if (duplicateError && organizationContext.schemaAvailable && isMissingOrganizationColumnError(duplicateError)) {
        logSpsFailure("duplicate-email-scope-fallback", duplicateError, {
          statusCode: 500,
          role: organizationContext.legacyRole,
          organizationRole: organizationContext.role,
          activeOrganizationId,
          adminClientUsed: Boolean(adminClient),
        });
        ({ data: emailMatches, error: duplicateError } = await runEmailDuplicateQuery("unscoped_no_org_column"));
      }

      if (duplicateError) {
        logSpsFailure("duplicate-email-check", duplicateError, {
          statusCode: 500,
          role: organizationContext.legacyRole,
          organizationRole: organizationContext.role,
          activeOrganizationId,
          adminClientUsed: Boolean(adminClient),
        });
        return NextResponse.json(
          { error: "Could not check for duplicate SPs right now. Please retry." },
          { status: 500 }
        );
      }

      if ((emailMatches || []).some((sp) => normalizeEmail(sp.working_email) === workingEmail)) {
        return duplicateResponse();
      }
    } else if (fullName && phone) {
      const runNamePhoneQuery = async (mode: "scoped" | "unscoped_no_org_column") => {
        let namePhoneQuery = supabaseServer
          .from("sps")
          .select("id,first_name,last_name,full_name,working_email,phone");
        if (mode === "scoped" && organizationContext.schemaAvailable && activeOrganizationId) {
          namePhoneQuery = namePhoneQuery.eq("organization_id", activeOrganizationId);
        }
        return namePhoneQuery.returns<SPDuplicateCandidate[]>();
      };

      let { data: namePhoneMatches, error: duplicateError } = await runNamePhoneQuery("scoped");
      if (duplicateError && organizationContext.schemaAvailable && isMissingOrganizationColumnError(duplicateError)) {
        logSpsFailure("duplicate-name-phone-scope-fallback", duplicateError, {
          statusCode: 500,
          role: organizationContext.legacyRole,
          organizationRole: organizationContext.role,
          activeOrganizationId,
          adminClientUsed: Boolean(adminClient),
        });
        ({ data: namePhoneMatches, error: duplicateError } = await runNamePhoneQuery("unscoped_no_org_column"));
      }

      if (duplicateError) {
        logSpsFailure("duplicate-name-phone-check", duplicateError, {
          statusCode: 500,
          role: organizationContext.legacyRole,
          organizationRole: organizationContext.role,
          activeOrganizationId,
          adminClientUsed: Boolean(adminClient),
        });
        return NextResponse.json(
          { error: "Could not check for duplicate SPs right now. Please retry." },
          { status: 500 }
        );
      }

      const duplicate = (namePhoneMatches || []).some(
        (sp) => normalizeName(getFullName(sp)) === fullName && normalizePhone(sp.phone) === phone
      );

      if (duplicate) {
        return duplicateResponse();
      }
    }

    const runInsert = async (includeOrganizationId: boolean) => {
      const insertPayload = includeOrganizationId
        ? payload
        : Object.fromEntries(
            Object.entries(payload).filter(([key]) => key !== "organization_id")
          );
      return supabaseServer
        .from("sps")
        .insert(insertPayload)
        .select(spSelectColumns)
        .single();
    };

    let { data, error } = await runInsert(Boolean(organizationContext.schemaAvailable && activeOrganizationId));
    if (error && organizationContext.schemaAvailable && isMissingOrganizationColumnError(error)) {
      logSpsFailure("create-scope-fallback", error, {
        statusCode: 500,
        role: organizationContext.legacyRole,
        organizationRole: organizationContext.role,
        activeOrganizationId,
        adminClientUsed: Boolean(adminClient),
      });
      ({ data, error } = await runInsert(false));
    }

    if (error) {
      logSpsFailure("create-query", error, {
        statusCode: 500,
        role: organizationContext.legacyRole,
        organizationRole: organizationContext.role,
        activeOrganizationId,
        adminClientUsed: Boolean(adminClient),
      });
      return NextResponse.json(
        { error: sanitizePublicErrorMessage(error.message, "Could not create SP right now. Please retry.") },
        { status: 500 }
      );
    }

    return NextResponse.json({ sp: data }, { status: 201 });
  } catch (error) {
    logSpsFailure("create-threw", error, { statusCode: 500 });
    return NextResponse.json(
      { error: "Could not create SP right now. Please retry." },
      { status: 500 }
    );
  }
}

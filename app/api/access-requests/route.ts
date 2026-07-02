import type { User } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "../../lib/supabaseAdminClient";
import { sanitizePublicErrorMessage } from "../../lib/safeErrorMessage";
import {
  applyOrganizationAuthCookies,
  forbiddenJson,
  getOrganizationContext,
  jsonNoStore,
  normalizeOrganizationRole,
  organizationRoleToLegacyRole,
  requireActiveOrganization,
  roleCanManageOrganization,
  unauthorizedJson,
  type OrganizationRole,
} from "../../lib/organizationAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AccessCodeRow = {
  id: string;
  organization_id: string;
  code: string;
  allowed_email_domains: string[] | null;
  default_requested_role: string | null;
  active: boolean | null;
};

type AccessRequestRow = {
  id: string;
  organization_id: string;
  access_code_id: string | null;
  full_name: string;
  email: string;
  requested_role: string;
  note: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_user_id: string | null;
  created_at: string | null;
};

type MembershipStatusRow = {
  user_id?: string | null;
  role?: string | null;
  status?: string | null;
};

type AccessRequestWithStatus = AccessRequestRow & {
  approval_role: OrganizationRole;
  auth_user_exists: boolean;
  auth_user_id: string | null;
  auth_user_confirmed: boolean;
  auth_user_last_sign_in_at: string | null;
  org_membership_exists: boolean;
  org_membership_status: string | null;
  membership_role: string | null;
  role: OrganizationRole;
  invite_sent: boolean;
  invite_sent_at: string | null;
  last_invite_status: string;
};

const REQUESTABLE_ROLES = new Set<OrganizationRole>(["org_admin", "sim_ops", "faculty", "sp", "viewer"]);
const SANDBOX_ORG_SLUG = "cfsp-sandbox-simulation-center";
const SANDBOX_ACCESS_CODE = "CFSP-SANDBOX";

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeEmail(value: unknown) {
  return asText(value).toLowerCase();
}

function getEmailDomain(email: string) {
  const atIndex = email.lastIndexOf("@");
  return atIndex >= 0 ? email.slice(atIndex + 1).toLowerCase() : "";
}

function normalizeRequestedRole(value: unknown, fallback: unknown = "viewer"): OrganizationRole {
  const role = normalizeOrganizationRole(value || fallback);
  if (REQUESTABLE_ROLES.has(role)) return role;
  return "viewer";
}

function normalizeAccessCode(value: unknown) {
  return asText(value).toUpperCase().replace(/\s+/g, "");
}

function isSandboxAccessCode(value: unknown) {
  return normalizeAccessCode(value) === SANDBOX_ACCESS_CODE;
}

function isSandboxOrganizationSlug(value: unknown) {
  return asText(value).toLowerCase() === SANDBOX_ORG_SLUG;
}

function isSandboxOrganizationContext(context: Awaited<ReturnType<typeof getOrganizationContext>>) {
  return isSandboxOrganizationSlug(context.activeOrganization?.slug);
}

function getDefaultApprovalRole(
  accessRequest: Pick<AccessRequestRow, "requested_role">,
  context: Awaited<ReturnType<typeof getOrganizationContext>>,
  explicitRole?: unknown
): OrganizationRole {
  const fallback = isSandboxOrganizationContext(context) ? "sim_ops" : accessRequest.requested_role || "viewer";
  return normalizeRequestedRole(explicitRole, fallback);
}

function getUserInviteSentAt(user: User | null | undefined) {
  return (
    asText(user?.invited_at) ||
    asText(user?.confirmation_sent_at) ||
    asText(user?.recovery_sent_at) ||
    ""
  );
}

function getUserSetupLinkType(user: User | null | undefined): "invite" | "recovery" {
  return user ? "recovery" : "invite";
}

function buildApprovedUserMetadata(args: {
  accessRequest: AccessRequestRow;
  role: OrganizationRole;
  organizationId: string;
}) {
  const legacyRole = organizationRoleToLegacyRole(args.role);
  return {
    full_name: args.accessRequest.full_name,
    schedule_name: args.accessRequest.full_name,
    role: legacyRole,
    organization_role: args.role,
    organization_id: args.organizationId,
  };
}

function getOrigin(request: Request) {
  const directOrigin = asText(request.headers.get("origin"));
  if (directOrigin) return directOrigin;

  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

function genericAccessCodeError() {
  return jsonNoStore(
    {
      ok: false,
      error: "We could not verify that access code.",
    },
    { status: 400 }
  );
}

function safeErrorMessage(value: unknown, fallback: string) {
  return sanitizePublicErrorMessage(value, fallback);
}

async function listAllAuthUsers() {
  const admin = createSupabaseAdminClient();
  if (!admin) return { users: [] as User[], error: "Supabase service role is not configured." };

  const users: User[] = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) return { users: [] as User[], error: safeErrorMessage(error.message, "Could not list users.") };

    const batch = data.users || [];
    users.push(...batch);

    if (batch.length < perPage) break;
    page += 1;
  }

  return { users, error: "" };
}

async function findAuthUserByEmail(email: string) {
  const result = await listAllAuthUsers();
  if (result.error) return { user: null as User | null, error: result.error };

  return {
    user: result.users.find((user) => normalizeEmail(user.email) === email) || null,
    error: "",
  };
}

async function upsertProfileForApprovedUser(args: {
  userId: string;
  email: string;
  fullName: string;
  role: OrganizationRole;
}) {
  const admin = createSupabaseAdminClient();
  if (!admin) return "Supabase service role is not configured.";

  const { error } = await admin
    .from("profiles")
    .upsert(
      {
        id: args.userId,
        email: args.email,
        full_name: args.fullName || null,
        schedule_name: args.fullName || null,
        role: organizationRoleToLegacyRole(args.role),
        is_active: true,
      },
      { onConflict: "id" }
    );

  if (error && !/profiles/i.test(error.message || "")) {
    return safeErrorMessage(error.message, "Could not update profile.");
  }

  return "";
}

async function updateAuthMetadataForApprovedUser(args: {
  user: User;
  accessRequest: AccessRequestRow;
  role: OrganizationRole;
  organizationId: string;
}) {
  const admin = createSupabaseAdminClient();
  if (!admin) return "Supabase service role is not configured.";

  const metadata = {
    ...(args.user.user_metadata || {}),
    ...buildApprovedUserMetadata({
      accessRequest: args.accessRequest,
      role: args.role,
      organizationId: args.organizationId,
    }),
  };

  const { error } = await admin.auth.admin.updateUserById(args.user.id, {
    user_metadata: metadata,
  });

  return error ? safeErrorMessage(error.message, "User metadata could not be updated.") : "";
}

async function upsertMembershipForApprovedUser(args: {
  userId: string;
  organizationId: string;
  role: OrganizationRole;
  approvedBy: string;
}) {
  const admin = createSupabaseAdminClient();
  if (!admin) return "Supabase service role is not configured.";

  const { error } = await admin
    .from("organization_memberships")
    .upsert(
      {
        organization_id: args.organizationId,
        user_id: args.userId,
        role: args.role,
        status: "active",
        approved_by: args.approvedBy,
        approved_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,user_id" }
    );

  return error ? safeErrorMessage(error.message, "Could not create organization membership.") : "";
}

async function completeApprovedUserRecords(args: {
  user: User;
  email: string;
  accessRequest: AccessRequestRow;
  role: OrganizationRole;
  organizationId: string;
  approvedBy: string;
}) {
  const metadataWarning = await updateAuthMetadataForApprovedUser({
    user: args.user,
    accessRequest: args.accessRequest,
    role: args.role,
    organizationId: args.organizationId,
  });
  const profileWarning = await upsertProfileForApprovedUser({
    userId: args.user.id,
    email: args.email,
    fullName: args.accessRequest.full_name,
    role: args.role,
  });
  const membershipWarning = await upsertMembershipForApprovedUser({
    userId: args.user.id,
    organizationId: args.organizationId,
    role: args.role,
    approvedBy: args.approvedBy,
  });

  return [metadataWarning, profileWarning, membershipWarning].filter(Boolean).join(" ");
}

function buildAccessRequestStatus(args: {
  accessRequest: AccessRequestRow;
  user: User | null;
  membership: MembershipStatusRow | null;
  context: Awaited<ReturnType<typeof getOrganizationContext>>;
}): Omit<AccessRequestWithStatus, keyof AccessRequestRow> {
  const approvalRole = getDefaultApprovalRole(args.accessRequest, args.context);
  const membershipRole = args.membership?.role ? normalizeRequestedRole(args.membership.role, approvalRole) : null;
  const role = membershipRole || approvalRole;
  const inviteSentAt = getUserInviteSentAt(args.user);
  const requestStatus = asText(args.accessRequest.status).toLowerCase();
  const authUserConfirmed = Boolean(args.user?.confirmed_at || args.user?.email_confirmed_at);
  const lastSignInAt = asText(args.user?.last_sign_in_at) || null;
  const inviteSent = Boolean(inviteSentAt || requestStatus === "invited");
  let lastInviteStatus = "Not sent";

  if (lastSignInAt) {
    lastInviteStatus = "User has signed in";
  } else if (asText(args.user?.recovery_sent_at)) {
    lastInviteStatus = "Password setup email sent";
  } else if (asText(args.user?.invited_at) || asText(args.user?.confirmation_sent_at)) {
    lastInviteStatus = "Invite email sent";
  } else if (requestStatus === "invited") {
    lastInviteStatus = "Marked invited";
  } else if (requestStatus === "approved" && args.membership) {
    lastInviteStatus = "Approved; invite not confirmed";
  }

  return {
    approval_role: approvalRole,
    auth_user_exists: Boolean(args.user),
    auth_user_id: args.user?.id || null,
    auth_user_confirmed: authUserConfirmed,
    auth_user_last_sign_in_at: lastSignInAt,
    org_membership_exists: Boolean(args.membership),
    org_membership_status: asText(args.membership?.status) || null,
    membership_role: membershipRole,
    role,
    invite_sent: inviteSent,
    invite_sent_at: inviteSentAt || null,
    last_invite_status: lastInviteStatus,
  };
}

async function generateSetupLinkForAccessRequest(args: {
  accessRequest: AccessRequestRow;
  existingUser: User | null;
  role: OrganizationRole;
  organizationId: string;
  redirectTo: string;
}) {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return {
      user: null as User | null,
      inviteLink: "",
      linkType: "",
      error: "Supabase service role is not configured.",
    };
  }

  const linkType = getUserSetupLinkType(args.existingUser);
  const email = normalizeEmail(args.accessRequest.email);
  const options =
    linkType === "invite"
      ? {
          data: buildApprovedUserMetadata({
            accessRequest: args.accessRequest,
            role: args.role,
            organizationId: args.organizationId,
          }),
          redirectTo: args.redirectTo,
        }
      : { redirectTo: args.redirectTo };
  const { data, error } = await admin.auth.admin.generateLink({
    type: linkType,
    email,
    options,
  });

  if (error || !data.properties?.action_link) {
    return {
      user: null as User | null,
      inviteLink: "",
      linkType,
      error: safeErrorMessage(error?.message, "Could not generate invite link."),
    };
  }

  return {
    user: data.user || args.existingUser,
    inviteLink: data.properties.action_link,
    linkType,
    error: "",
  };
}

async function approveAccessRequestAccount(args: {
  accessRequest: AccessRequestRow;
  role: OrganizationRole;
  organizationId: string;
  approvedBy: string;
  redirectTo: string;
}) {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return {
      user: null as User | null,
      inviteSent: false,
      inviteLink: "",
      linkType: "",
      warning: "",
      error: "Supabase service role is not configured.",
    };
  }

  const email = normalizeEmail(args.accessRequest.email);
  const existingUserResult = await findAuthUserByEmail(email);
  if (existingUserResult.error) {
    return {
      user: null as User | null,
      inviteSent: false,
      inviteLink: "",
      linkType: "",
      warning: "",
      error: safeErrorMessage(existingUserResult.error, "Could not load users for approval."),
    };
  }

  let approvedUser = existingUserResult.user;
  let inviteSent = false;
  let inviteLink = "";
  let linkType = "";
  let warning = "";

  if (!approvedUser) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: args.redirectTo,
      data: buildApprovedUserMetadata({
        accessRequest: args.accessRequest,
        role: args.role,
        organizationId: args.organizationId,
      }),
    });

    if (error || !data.user) {
      warning = `Invite email was not sent: ${safeErrorMessage(error?.message, "Supabase invite delivery failed.")}`;
      const generated = await generateSetupLinkForAccessRequest({
        accessRequest: args.accessRequest,
        existingUser: null,
        role: args.role,
        organizationId: args.organizationId,
        redirectTo: args.redirectTo,
      });
      if (generated.error || !generated.user) {
        return {
          user: null as User | null,
          inviteSent: false,
          inviteLink: "",
          linkType: generated.linkType,
          warning,
          error: generated.error || "Could not create Auth user for this access request.",
        };
      }
      approvedUser = generated.user;
      inviteLink = generated.inviteLink;
      linkType = generated.linkType;
    } else {
      approvedUser = data.user;
      inviteSent = true;
    }
  }

  if (!approvedUser) {
    return {
      user: null as User | null,
      inviteSent,
      inviteLink,
      linkType,
      warning,
      error: "Could not create or load Auth user for this access request.",
    };
  }

  const recordsWarning = await completeApprovedUserRecords({
    user: approvedUser,
    email,
    accessRequest: args.accessRequest,
    role: args.role,
    organizationId: args.organizationId,
    approvedBy: args.approvedBy,
  });

  return {
    user: approvedUser,
    inviteSent,
    inviteLink,
    linkType,
    warning: [warning, recordsWarning].filter(Boolean).join(" "),
    error: "",
  };
}

export async function POST(request: Request) {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return jsonNoStore(
      {
        ok: false,
        error: "Access requests require a configured Supabase service role.",
      },
      { status: 500 }
    );
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const fullName = asText(body?.full_name ?? body?.fullName);
  const email = normalizeEmail(body?.email);
  const accessCode = asText(body?.access_code ?? body?.accessCode);
  const note = asText(body?.note) || null;

  if (!fullName || !email || !accessCode) {
    return jsonNoStore(
      {
        ok: false,
        error: "Full name, work email, and Organization Access Code are required.",
      },
      { status: 400 }
    );
  }

  const { data: accessCodeRows, error: accessCodeError } = await admin
    .from("organization_access_codes")
    .select("id,organization_id,code,allowed_email_domains,default_requested_role,active")
    .ilike("code", accessCode)
    .limit(1)
    .returns<AccessCodeRow[]>();

  if (accessCodeError || !accessCodeRows?.[0] || accessCodeRows[0].active === false) {
    return genericAccessCodeError();
  }

  const code = accessCodeRows[0];
  const allowedDomains = (Array.isArray(code.allowed_email_domains) ? code.allowed_email_domains : [])
    .map((domain) => asText(domain).replace(/^@+/, "").toLowerCase())
    .filter(Boolean);
  const emailDomain = getEmailDomain(email);

  if (allowedDomains.length && !allowedDomains.includes(emailDomain)) {
    return genericAccessCodeError();
  }

  const requestedRoleInput = body?.requested_role ?? body?.requestedRole;
  let requestedRole = normalizeRequestedRole(
    requestedRoleInput,
    isSandboxAccessCode(code.code) ? "sim_ops" : code.default_requested_role
  );
  if (isSandboxAccessCode(code.code) && (!asText(requestedRoleInput) || requestedRole === "viewer")) {
    requestedRole = "sim_ops";
  }
  const { error: insertError } = await admin.from("access_requests").insert({
    organization_id: code.organization_id,
    access_code_id: code.id,
    full_name: fullName,
    email,
    requested_role: requestedRole,
    note,
    status: "pending",
  });

  if (insertError) {
    return jsonNoStore(
      {
        ok: false,
        error: safeErrorMessage(insertError.message, "Could not submit access request."),
      },
      { status: 500 }
    );
  }

  return jsonNoStore({
    ok: true,
    message: "Access request submitted. A CFSP administrator must approve your account before you can sign in.",
  });
}

export async function GET() {
  const context = await getOrganizationContext();
  if (!context.user) return unauthorizedJson(context);
  if (!requireActiveOrganization(context)) return forbiddenJson("No active organization membership.", context);
  if (!roleCanManageOrganization(context.role)) {
    return forbiddenJson("Only platform owners and organization admins can review access requests.", context);
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, error: "Access requests require a configured Supabase service role." }, { status: 500 }),
      context
    );
  }

  const { data, error } = await admin
    .from("access_requests")
    .select("id,organization_id,access_code_id,full_name,email,requested_role,note,status,reviewed_by,reviewed_at,created_user_id,created_at")
    .eq("organization_id", context.activeOrganization!.id)
    .order("created_at", { ascending: false })
    .returns<AccessRequestRow[]>();

  if (error) {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, error: safeErrorMessage(error.message, "Could not load access requests.") }, { status: 500 }),
      context
    );
  }

  const authUsersResult = await listAllAuthUsers();
  if (authUsersResult.error) {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, error: safeErrorMessage(authUsersResult.error, "Could not load access request account status.") }, { status: 500 }),
      context
    );
  }

  const usersByEmail = new Map(authUsersResult.users.map((user) => [normalizeEmail(user.email), user]));
  const usersById = new Map(authUsersResult.users.map((user) => [user.id, user]));
  const requestUsers = (data || []).map((request) => {
    const createdUser = asText(request.created_user_id) ? usersById.get(asText(request.created_user_id)) || null : null;
    return createdUser || usersByEmail.get(normalizeEmail(request.email)) || null;
  });
  const requestUserIds = Array.from(new Set(requestUsers.map((user) => asText(user?.id)).filter(Boolean)));
  let membershipByUserId = new Map<string, MembershipStatusRow>();

  if (requestUserIds.length) {
    const { data: memberships, error: membershipError } = await admin
      .from("organization_memberships")
      .select("user_id,role,status")
      .eq("organization_id", context.activeOrganization!.id)
      .in("user_id", requestUserIds)
      .returns<MembershipStatusRow[]>();

    if (membershipError) {
      return applyOrganizationAuthCookies(
        jsonNoStore({ ok: false, error: safeErrorMessage(membershipError.message, "Could not load access request memberships.") }, { status: 500 }),
        context
      );
    }

    membershipByUserId = new Map(
      (memberships || []).map((membership) => [asText(membership.user_id), membership])
    );
  }

  const enrichedRequests: AccessRequestWithStatus[] = (data || []).map((accessRequest, index) => {
    const user = requestUsers[index] || null;
    const membership = user ? membershipByUserId.get(user.id) || null : null;
    return {
      ...accessRequest,
      ...buildAccessRequestStatus({
        accessRequest,
        user,
        membership,
        context,
      }),
    };
  });

  return applyOrganizationAuthCookies(
    jsonNoStore({
      ok: true,
      accessRequests: enrichedRequests,
      activeOrganization: context.activeOrganization,
      role: context.role,
      isPlatformOwner: context.isPlatformOwner,
    }),
    context
  );
}

export async function PATCH(request: Request) {
  const context = await getOrganizationContext();
  if (!context.user) return unauthorizedJson(context);
  if (!requireActiveOrganization(context)) return forbiddenJson("No active organization membership.", context);
  if (!roleCanManageOrganization(context.role)) {
    return forbiddenJson("Only platform owners and organization admins can approve access requests.", context);
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, error: "Access approvals require a configured Supabase service role." }, { status: 500 }),
      context
    );
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const id = asText(body?.id);
  const action = asText(body?.action).toLowerCase();
  const allowedActions = new Set(["approve", "deny", "send_invite", "generate_invite_link"]);

  if (!id || !allowedActions.has(action)) {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, error: "Request id and action are required." }, { status: 400 }),
      context
    );
  }

  const { data: accessRequest, error: loadError } = await admin
    .from("access_requests")
    .select("id,organization_id,access_code_id,full_name,email,requested_role,note,status,reviewed_by,reviewed_at,created_user_id,created_at")
    .eq("id", id)
    .eq("organization_id", context.activeOrganization!.id)
    .maybeSingle<AccessRequestRow>();

  if (loadError) {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, error: safeErrorMessage(loadError.message, "Could not load access request.") }, { status: 500 }),
      context
    );
  }

  if (!accessRequest) {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, error: "Access request not found." }, { status: 404 }),
      context
    );
  }

  const currentStatus = asText(accessRequest.status).toLowerCase();
  const approvedRole = getDefaultApprovalRole(accessRequest, context, body?.role ?? body?.requested_role);
  const email = normalizeEmail(accessRequest.email);
  const redirectTo = `${getOrigin(request)}/reset-password`;

  if (action === "deny") {
    if (currentStatus !== "pending") {
      return applyOrganizationAuthCookies(
        jsonNoStore(
          {
            ok: false,
            error: `This access request is already ${currentStatus || "reviewed"}.`,
            status: currentStatus || "reviewed",
          },
          { status: 409 }
        ),
        context
      );
    }

    const { error } = await admin
      .from("access_requests")
      .update({
        status: "denied",
        reviewed_by: context.user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", accessRequest.id);

    if (error) {
      return applyOrganizationAuthCookies(
        jsonNoStore({ ok: false, error: safeErrorMessage(error.message, "Could not deny request.") }, { status: 500 }),
        context
      );
    }

    return applyOrganizationAuthCookies(jsonNoStore({ ok: true, status: "denied" }), context);
  }

  if (action === "approve") {
    if (currentStatus !== "pending") {
      return applyOrganizationAuthCookies(
        jsonNoStore(
          {
            ok: false,
            error: `This access request is already ${currentStatus || "reviewed"}.`,
            status: currentStatus || "reviewed",
          },
          { status: 409 }
        ),
        context
      );
    }

    const accountResult = await approveAccessRequestAccount({
      accessRequest,
      role: approvedRole,
      organizationId: context.activeOrganization!.id,
      approvedBy: context.user.id,
      redirectTo,
    });

    if (accountResult.error || !accountResult.user) {
      return applyOrganizationAuthCookies(
        jsonNoStore({ ok: false, error: accountResult.error || "Could not approve access request." }, { status: 500 }),
        context
      );
    }

    const nextStatus = accountResult.inviteSent || accountResult.inviteLink ? "invited" : "approved";
    const { error: updateRequestError } = await admin
      .from("access_requests")
      .update({
        status: nextStatus,
        requested_role: approvedRole,
        reviewed_by: context.user.id,
        reviewed_at: new Date().toISOString(),
        created_user_id: accountResult.user.id,
      })
      .eq("id", accessRequest.id);

    if (updateRequestError) {
      return applyOrganizationAuthCookies(
        jsonNoStore({ ok: false, error: safeErrorMessage(updateRequestError.message, "Could not mark request approved.") }, { status: 500 }),
        context
      );
    }

    return applyOrganizationAuthCookies(
      jsonNoStore({
        ok: true,
        status: nextStatus,
        role: approvedRole,
        inviteSent: accountResult.inviteSent,
        inviteLink: accountResult.inviteLink || undefined,
        inviteLinkType: accountResult.linkType || undefined,
        userId: accountResult.user.id,
        warning: safeErrorMessage(accountResult.warning, ""),
      }),
      context
    );
  }

  if (currentStatus === "pending") {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, error: "Approve this request before sending an invite or generating a setup link." }, { status: 409 }),
      context
    );
  }

  if (currentStatus === "denied") {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, error: "Denied access requests cannot receive invites." }, { status: 409 }),
      context
    );
  }

  const existingUserResult = await findAuthUserByEmail(email);
  if (existingUserResult.error) {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, error: safeErrorMessage(existingUserResult.error, "Could not load users for invite action.") }, { status: 500 }),
      context
    );
  }

  if (action === "send_invite") {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: buildApprovedUserMetadata({
        accessRequest,
        role: approvedRole,
        organizationId: context.activeOrganization!.id,
      }),
    });

    const invitedUser = data.user || existingUserResult.user;
    if (error || !invitedUser) {
      return applyOrganizationAuthCookies(
        jsonNoStore(
          {
            ok: false,
            error: "Supabase did not send an invite email. Use Copy Invite Link to complete onboarding manually.",
            warning: safeErrorMessage(error?.message, ""),
          },
          { status: 409 }
        ),
        context
      );
    }

    const warning = await completeApprovedUserRecords({
      user: invitedUser,
      email,
      accessRequest,
      role: approvedRole,
      organizationId: context.activeOrganization!.id,
      approvedBy: context.user.id,
    });
    const { error: updateRequestError } = await admin
      .from("access_requests")
      .update({
        status: "invited",
        requested_role: approvedRole,
        reviewed_by: context.user.id,
        reviewed_at: new Date().toISOString(),
        created_user_id: invitedUser.id,
      })
      .eq("id", accessRequest.id);

    if (updateRequestError) {
      return applyOrganizationAuthCookies(
        jsonNoStore({ ok: false, error: safeErrorMessage(updateRequestError.message, "Could not mark invite sent.") }, { status: 500 }),
        context
      );
    }

    return applyOrganizationAuthCookies(
      jsonNoStore({
        ok: true,
        status: "invited",
        role: approvedRole,
        inviteSent: true,
        userId: invitedUser.id,
        warning: safeErrorMessage(warning, ""),
      }),
      context
    );
  }

  if (action === "generate_invite_link") {
    const generated = await generateSetupLinkForAccessRequest({
      accessRequest,
      existingUser: existingUserResult.user,
      role: approvedRole,
      organizationId: context.activeOrganization!.id,
      redirectTo,
    });

    if (generated.error || !generated.inviteLink || !generated.user) {
      return applyOrganizationAuthCookies(
        jsonNoStore({ ok: false, error: generated.error || "Could not generate invite link." }, { status: 500 }),
        context
      );
    }

    const warning = await completeApprovedUserRecords({
      user: generated.user,
      email,
      accessRequest,
      role: approvedRole,
      organizationId: context.activeOrganization!.id,
      approvedBy: context.user.id,
    });
    const { error: updateRequestError } = await admin
      .from("access_requests")
      .update({
        status: "invited",
        requested_role: approvedRole,
        reviewed_by: context.user.id,
        reviewed_at: new Date().toISOString(),
        created_user_id: generated.user.id,
      })
      .eq("id", accessRequest.id);

    if (updateRequestError) {
      return applyOrganizationAuthCookies(
        jsonNoStore({ ok: false, error: safeErrorMessage(updateRequestError.message, "Could not mark invite link generated.") }, { status: 500 }),
        context
      );
    }

    return applyOrganizationAuthCookies(
      jsonNoStore({
        ok: true,
        status: "invited",
        role: approvedRole,
        inviteSent: false,
        inviteLink: generated.inviteLink,
        inviteLinkType: generated.linkType,
        userId: generated.user.id,
        warning: safeErrorMessage(warning, ""),
      }),
      context
    );
  }

  return applyOrganizationAuthCookies(
    jsonNoStore({ ok: false, error: "Unknown access request action." }, { status: 400 }),
    context
  );
}

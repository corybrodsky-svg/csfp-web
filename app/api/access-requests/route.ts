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

const REQUESTABLE_ROLES = new Set<OrganizationRole>(["org_admin", "sim_ops", "faculty", "sp", "viewer"]);

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

async function findAuthUserByEmail(email: string) {
  const admin = createSupabaseAdminClient();
  if (!admin) return { user: null as User | null, error: "Supabase service role is not configured." };

  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) return { user: null as User | null, error: safeErrorMessage(error.message, "Could not list users.") };

    const match = (data.users || []).find((user) => normalizeEmail(user.email) === email);
    if (match) return { user: match, error: "" };

    if ((data.users || []).length < perPage) break;
    page += 1;
  }

  return { user: null as User | null, error: "" };
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

  const requestedRole = normalizeRequestedRole(body?.requested_role ?? body?.requestedRole, code.default_requested_role);
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

  return applyOrganizationAuthCookies(
    jsonNoStore({
      ok: true,
      accessRequests: data || [],
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
  const approvedRole = normalizeRequestedRole(body?.role ?? body?.requested_role, "viewer");

  if (!id || (action !== "approve" && action !== "deny")) {
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

  if (action === "deny") {
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

  const email = normalizeEmail(accessRequest.email);
  const existingUserResult = await findAuthUserByEmail(email);
  if (existingUserResult.error) {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, error: safeErrorMessage(existingUserResult.error, "Could not load users for approval.") }, { status: 500 }),
      context
    );
  }

  let approvedUser = existingUserResult.user;
  let inviteSent = false;
  let inviteWarning = "";
  const legacyRole = organizationRoleToLegacyRole(approvedRole);

  if (!approvedUser) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${getOrigin(request)}/reset-password`,
      data: {
        full_name: accessRequest.full_name,
        schedule_name: accessRequest.full_name,
        role: legacyRole,
        organization_role: approvedRole,
        organization_id: context.activeOrganization!.id,
      },
    });

    if (error || !data.user) {
      return applyOrganizationAuthCookies(
        jsonNoStore(
          {
            ok: false,
            error: safeErrorMessage(error?.message, "Could not invite user."),
          },
          { status: 500 }
        ),
        context
      );
    }

    approvedUser = data.user;
    inviteSent = true;
  } else {
    const metadata = {
      ...(approvedUser.user_metadata || {}),
      full_name: asText(approvedUser.user_metadata?.full_name) || accessRequest.full_name,
      schedule_name: asText(approvedUser.user_metadata?.schedule_name) || accessRequest.full_name,
      role: legacyRole,
      organization_role: approvedRole,
      organization_id: context.activeOrganization!.id,
    };
    const { error } = await admin.auth.admin.updateUserById(approvedUser.id, {
      user_metadata: metadata,
    });
    if (error) inviteWarning = safeErrorMessage(error.message, "User metadata could not be updated.");
  }

  const profileWarning = await upsertProfileForApprovedUser({
    userId: approvedUser.id,
    email,
    fullName: accessRequest.full_name,
    role: approvedRole,
  });

  const { error: membershipError } = await admin
    .from("organization_memberships")
    .upsert(
      {
        organization_id: context.activeOrganization!.id,
        user_id: approvedUser.id,
        role: approvedRole,
        status: "active",
        approved_by: context.user.id,
        approved_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,user_id" }
    );

  if (membershipError) {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, error: safeErrorMessage(membershipError.message, "Could not create organization membership.") }, { status: 500 }),
      context
    );
  }

  const nextStatus = inviteSent ? "invited" : "approved";
  const { error: updateRequestError } = await admin
    .from("access_requests")
    .update({
      status: nextStatus,
      requested_role: approvedRole,
      reviewed_by: context.user.id,
      reviewed_at: new Date().toISOString(),
      created_user_id: approvedUser.id,
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
      inviteSent,
      userId: approvedUser.id,
      warning: safeErrorMessage([inviteWarning, profileWarning].filter(Boolean).join(" "), ""),
    }),
    context
  );
}

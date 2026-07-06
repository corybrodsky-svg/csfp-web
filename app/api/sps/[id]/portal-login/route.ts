import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "../../../../lib/supabaseAdminClient";
import {
  applyOrganizationAuthCookies,
  getOrganizationContext,
  requireActiveOrganization,
  roleCanManageOrganization,
} from "../../../../lib/organizationAuth";
import { getRouteId, safeErrorJson } from "../../../../lib/spShiftFoundation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SpRow = {
  id?: string | null;
  organization_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  working_email?: string | null;
  email?: string | null;
  status?: string | null;
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeEmail(value: unknown) {
  return asText(value).toLowerCase();
}

function normalizeRole(value: unknown) {
  return asText(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function getSpDisplayName(sp: SpRow | null | undefined) {
  return (
    asText(sp?.full_name) ||
    [asText(sp?.first_name), asText(sp?.last_name)].filter(Boolean).join(" ") ||
    "SP"
  );
}

function isMissingColumnError(error: unknown, columnName: string) {
  const source = error && typeof error === "object" ? (error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown }) : {};
  const text = [source.code, source.message, source.details, source.hint].map(asText).join(" ").toLowerCase();
  return text.includes("42703") || (text.includes(columnName.toLowerCase()) && text.includes("column"));
}

function isMissingPreferenceSchemaError(error: unknown) {
  const source = error && typeof error === "object" ? (error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown }) : {};
  const text = [source.code, source.message, source.details, source.hint].map(asText).join(" ").toLowerCase();
  return (
    text.includes("42p01") ||
    text.includes("pgrst205") ||
    text.includes("sp_communication_preferences") ||
    (text.includes("relation") && text.includes("does not exist"))
  );
}

function isMissingRelationError(error: unknown) {
  const source = error && typeof error === "object" ? (error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown }) : {};
  const text = [source.code, source.message, source.details, source.hint].map(asText).join(" ").toLowerCase();
  return text.includes("42p01") || text.includes("pgrst205") || (text.includes("relation") && text.includes("does not exist"));
}

function existingRoleConflictMessage(role: string) {
  return `A user account with this email already has ${role} access. Use Staff role management instead of converting that account from the SP profile.`;
}

function jsonNoStore(body: unknown, init?: ResponseInit, auth?: Awaited<ReturnType<typeof getOrganizationContext>>) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return auth ? applyOrganizationAuthCookies(response, auth) : response;
}

function generateTemporaryPassword() {
  return `CFSP-Sp-${randomBytes(6).toString("base64url")}!7`;
}

async function findAuthUserByEmail(admin: SupabaseClient, email: string) {
  let page = 1;
  const perPage = 200;
  const target = normalizeEmail(email);

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = (data.users || []).find((user) => normalizeEmail(user.email) === target);
    if (match) return match;
    if ((data.users || []).length < perPage) return null;
    page += 1;
  }
}

async function validateExistingUserCanBeLinkedAsSp(admin: SupabaseClient, user: User) {
  const metadataRoles = [user.user_metadata?.role, user.user_metadata?.organization_role]
    .map(normalizeRole)
    .filter(Boolean);
  const blockingMetadataRole = metadataRoles.find((role) => role !== "sp");
  if (blockingMetadataRole) return existingRoleConflictMessage(blockingMetadataRole);

  const profileResult = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profileResult.error && !isMissingRelationError(profileResult.error) && !isMissingColumnError(profileResult.error, "role")) {
    throw profileResult.error;
  }
  const profileRole = normalizeRole((profileResult.data as { role?: unknown } | null)?.role);
  if (profileRole && profileRole !== "sp") return existingRoleConflictMessage(profileRole);

  const membershipsResult = await admin.from("organization_memberships").select("organization_id,role,status").eq("user_id", user.id);
  if (membershipsResult.error && !isMissingRelationError(membershipsResult.error) && !isMissingColumnError(membershipsResult.error, "role")) {
    throw membershipsResult.error;
  }
  const memberships = (membershipsResult.data || []) as Array<{ role?: unknown; status?: unknown }>;
  const blockingMembership = memberships.find((membership) => {
    const role = normalizeRole(membership.role);
    const status = normalizeRole(membership.status);
    return Boolean(role && role !== "sp" && status !== "inactive" && status !== "disabled");
  });
  if (blockingMembership) return existingRoleConflictMessage(normalizeRole(blockingMembership.role));

  return "";
}

async function loadSp(admin: SupabaseClient, spId: string, organizationId: string, scopeByOrganization: boolean) {
  const runQuery = async (withOrganizationScope: boolean) => {
    let query = admin
      .from("sps")
      .select("id,organization_id,first_name,last_name,full_name,working_email,email,status")
      .eq("id", spId)
      .limit(1);
    if (withOrganizationScope && organizationId) query = query.eq("organization_id", organizationId);
    return query.maybeSingle();
  };

  let result = await runQuery(scopeByOrganization);
  if (result.error && scopeByOrganization && isMissingColumnError(result.error, "organization_id")) {
    result = await runQuery(false);
  }
  if (result.error) throw result.error;
  const sp = (result.data || null) as SpRow | null;
  if (!sp) return null;
  if (scopeByOrganization && organizationId && asText(sp.organization_id) && asText(sp.organization_id) !== organizationId) return null;
  return sp;
}

async function upsertProfile(admin: SupabaseClient, user: User, sp: SpRow) {
  const profilePayload = {
    id: user.id,
    full_name: getSpDisplayName(sp),
    schedule_name: getSpDisplayName(sp),
    email: normalizeEmail(user.email),
    role: "sp",
    is_active: true,
    sp_id: asText(sp.id),
  };
  const result = await admin.from("profiles").upsert(profilePayload, { onConflict: "id" }).select("id").maybeSingle();
  if (!result.error) return "";
  if (!isMissingColumnError(result.error, "sp_id")) throw result.error;
  const fallbackPayload = { ...profilePayload };
  delete (fallbackPayload as { sp_id?: string }).sp_id;
  const fallback = await admin.from("profiles").upsert(fallbackPayload, { onConflict: "id" }).select("id").maybeSingle();
  if (fallback.error) throw fallback.error;
  return "profiles.sp_id is missing, so the durable SP link was stored on the organization membership and auth metadata.";
}

async function upsertSpMembership(admin: SupabaseClient, args: {
  user: User;
  organizationId: string;
  spId: string;
  currentUserId: string;
}) {
  const existing = await admin
    .from("organization_memberships")
    .select("id,role,status")
    .eq("organization_id", args.organizationId)
    .eq("user_id", args.user.id)
    .maybeSingle();
  if (existing.error) throw existing.error;

  const existingRole = asText((existing.data as { role?: unknown } | null)?.role).toLowerCase().replace(/[\s-]+/g, "_");
  if (existingRole && existingRole !== "sp") {
    return {
      ok: false,
      error:
        "A user account with this email already belongs to this organization as a non-SP. Use Staff to review that account instead of converting it from the SP profile.",
    };
  }

  const payload = {
    organization_id: args.organizationId,
    user_id: args.user.id,
    sp_id: args.spId,
    role: "sp",
    status: "active",
    approved_by: args.currentUserId,
    approved_at: new Date().toISOString(),
  };
  const query = (existing.data as { id?: string } | null)?.id
    ? admin.from("organization_memberships").update(payload).eq("id", asText((existing.data as { id?: string }).id))
    : admin.from("organization_memberships").insert(payload);
  const result = await query.select("id").maybeSingle();
  if (!result.error) return { ok: true, warning: "" };
  if (!isMissingColumnError(result.error, "sp_id")) throw result.error;

  const fallbackPayload = { ...payload };
  delete (fallbackPayload as { sp_id?: string }).sp_id;
  const fallbackQuery = (existing.data as { id?: string } | null)?.id
    ? admin.from("organization_memberships").update(fallbackPayload).eq("id", asText((existing.data as { id?: string }).id))
    : admin.from("organization_memberships").insert(fallbackPayload);
  const fallback = await fallbackQuery.select("id").maybeSingle();
  if (fallback.error) throw fallback.error;
  return {
    ok: true,
    warning: "organization_memberships.sp_id is missing, so the SP login can only be matched by auth metadata/email until the latest migration is applied.",
  };
}

async function updateAuthMetadata(admin: SupabaseClient, user: User, args: {
  organizationId: string;
  spId: string;
  spName: string;
}) {
  const metadata = {
    ...(user.user_metadata || {}),
    full_name: args.spName,
    schedule_name: args.spName,
    role: "sp",
    organization_role: "sp",
    organization_id: args.organizationId,
    sp_id: args.spId,
    linked_sp_id: args.spId,
    sp_link_sp_id: args.spId,
    sp_link_status: "linked",
    sp_link_matched_by: "saved_link",
    sp_link_name: args.spName,
  };
  const { data, error } = await admin.auth.admin.updateUserById(user.id, {
    user_metadata: metadata,
  });
  if (error) throw error;
  return data.user || user;
}

async function upsertCommunicationPreference(admin: SupabaseClient, organizationId: string, spId: string) {
  const result = await admin
    .from("sp_communication_preferences")
    .upsert(
      {
        organization_id: organizationId,
        sp_id: spId,
        preferred_mode: "portal",
        portal_status: "linked",
        onboarding_status: "complete",
      },
      { onConflict: "organization_id,sp_id" }
    )
    .select("id")
    .maybeSingle();
  if (result.error && !isMissingPreferenceSchemaError(result.error)) throw result.error;
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id?: string | string[] }> }
) {
  const organizationContext = await getOrganizationContext();
  if (!organizationContext.user) return safeErrorJson("unauthorized", "Authentication is required.", 401, organizationContext);
  if (!requireActiveOrganization(organizationContext)) {
    return safeErrorJson("forbidden", "No active organization membership.", 403, organizationContext);
  }
  if (!roleCanManageOrganization(organizationContext.role)) {
    return safeErrorJson("forbidden", "Only platform owners and organization admins can create or link SP portal logins.", 403, organizationContext);
  }

  const params = await context.params;
  const spId = getRouteId(params);
  if (!spId) return safeErrorJson("bad_request", "Missing SP id.", 400, organizationContext);

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return safeErrorJson("server_error", "SP portal login setup requires a configured Supabase service role.", 500, organizationContext);
  }

  try {
    const organizationId = asText(organizationContext.activeOrganization?.id);
    const sp = await loadSp(admin, spId, organizationId, Boolean(organizationContext.schemaAvailable && organizationId));
    if (!sp) return safeErrorJson("not_found", "SP profile was not found in this organization.", 404, organizationContext);

    const email = normalizeEmail(sp.working_email) || normalizeEmail(sp.email);
    if (!email) {
      return safeErrorJson("bad_request", "Add a working email to this SP profile before creating a portal login.", 400, organizationContext);
    }
    if (email === normalizeEmail(organizationContext.user.email)) {
      return safeErrorJson(
        "conflict",
        "This SP profile uses your current account email. CFSP will not convert the logged-in Sim Ops/admin account into an SP. Use a separate SP test email or Staff role management.",
        409,
        organizationContext
      );
    }

    const spName = getSpDisplayName(sp);
    const existingUser = await findAuthUserByEmail(admin, email);
    const existingUserConflict = existingUser ? await validateExistingUserCanBeLinkedAsSp(admin, existingUser) : "";
    if (existingUserConflict) {
      return safeErrorJson("conflict", existingUserConflict, 409, organizationContext);
    }
    const temporaryPassword = existingUser ? "" : generateTemporaryPassword();
    const userResult = existingUser
      ? { user: existingUser, created: false }
      : await admin.auth.admin.createUser({
          email,
          password: temporaryPassword,
          email_confirm: true,
          user_metadata: {
            full_name: spName,
            schedule_name: spName,
            role: "sp",
            organization_role: "sp",
            organization_id: organizationId,
            sp_id: spId,
            linked_sp_id: spId,
            sp_link_sp_id: spId,
            sp_link_status: "linked",
            sp_link_matched_by: "saved_link",
            sp_link_name: spName,
          },
        }).then((result) => {
          if (result.error || !result.data.user) throw result.error || new Error("Could not create SP auth user.");
          return { user: result.data.user, created: true };
        });

    const membershipResult = await upsertSpMembership(admin, {
      user: userResult.user,
      organizationId,
      spId,
      currentUserId: organizationContext.user.id,
    });
    if (!membershipResult.ok) {
      return applyOrganizationAuthCookies(
        jsonNoStore({ ok: false, error: membershipResult.error }, { status: 409 }),
        organizationContext
      );
    }

    const linkedUser = await updateAuthMetadata(admin, userResult.user, { organizationId, spId, spName });
    const profileWarning = await upsertProfile(admin, linkedUser, sp);
    await upsertCommunicationPreference(admin, organizationId, spId);

    return applyOrganizationAuthCookies(
      jsonNoStore({
        ok: true,
        action: userResult.created ? "created" : "linked_existing",
        sp_id: spId,
        sp_name: spName,
        user_id: linkedUser.id,
        email,
        role: "sp",
        organization_role: "sp",
        temporary_password: temporaryPassword || null,
        login_url: "/login",
        message: userResult.created
          ? "Created a separate SP portal login. Share the temporary password through a safe testing channel."
          : "Linked an existing SP auth user to this SP profile.",
        warning: [membershipResult.warning, profileWarning].filter(Boolean).join(" ") || null,
      }),
      organizationContext
    );
  } catch (error) {
    return safeErrorJson(
      "server_error",
      error instanceof Error ? error.message : "Could not create or link this SP portal login.",
      500,
      organizationContext
    );
  }
}

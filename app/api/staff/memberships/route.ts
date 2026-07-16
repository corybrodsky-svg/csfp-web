import { createSupabaseAdminClient } from "../../../lib/supabaseAdminClient";
import { sanitizePublicErrorMessage } from "../../../lib/safeErrorMessage";
import {
  applyOrganizationAuthCookies,
  forbiddenJson,
  getOrganizationContext,
  jsonNoStore,
  normalizeOrganizationRole,
  requireActiveOrganization,
  unauthorizedJson,
  type OrganizationRole,
} from "../../../lib/organizationAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ADDABLE_ROLES = new Set<OrganizationRole>(["org_admin", "sim_ops", "faculty", "sp", "viewer"]);

type OrganizationRow = {
  id?: string | null;
  name?: string | null;
  status?: string | null;
};

type MembershipRow = {
  id?: string | null;
  organization_id?: string | null;
  user_id?: string | null;
  role?: string | null;
  status?: string | null;
  sp_id?: string | null;
  approved_at?: string | null;
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function safeErrorMessage(value: unknown, fallback: string) {
  return sanitizePublicErrorMessage(value, fallback);
}

function isMissingMembershipSpIdColumn(error: unknown) {
  const source = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown } | null;
  const text = [source?.code, source?.message, source?.details, source?.hint].map(asText).join(" ").toLowerCase();
  return text.includes("42703") || (text.includes("organization_memberships") && text.includes("sp_id"));
}

export async function POST(request: Request) {
  const context = await getOrganizationContext();

  if (!context.user) return unauthorizedJson(context);
  if (!requireActiveOrganization(context)) return forbiddenJson("No active organization membership.", context);
  if (context.role !== "platform_owner") {
    return forbiddenJson("Only platform owners can add memberships across organizations.", context);
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, error: "Membership management requires a configured Supabase service role." }, { status: 500 }),
      context
    );
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const userId = asText(body?.user_id ?? body?.userId);
  const organizationId = asText(body?.organization_id ?? body?.organizationId);
  const role = normalizeOrganizationRole(body?.role ?? body?.organization_role);
  const spId = asText(body?.sp_id ?? body?.spId);

  if (!userId || !organizationId) {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, error: "User and target organization are required." }, { status: 400 }),
      context
    );
  }

  if (!ADDABLE_ROLES.has(role)) {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, error: "That role cannot be assigned through membership management." }, { status: 400 }),
      context
    );
  }

  const { data: organization, error: organizationError } = await admin
    .from("organizations")
    .select("id,name,status")
    .eq("id", organizationId)
    .maybeSingle<OrganizationRow>();

  if (organizationError) {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, error: safeErrorMessage(organizationError.message, "Could not validate the target organization.") }, { status: 500 }),
      context
    );
  }

  if (!asText(organization?.id) || asText(organization?.status).toLowerCase() !== "active") {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, error: "Target organization is not active." }, { status: 400 }),
      context
    );
  }

  if (spId) {
    if (role !== "sp") {
      return applyOrganizationAuthCookies(
        jsonNoStore({ ok: false, error: "SP record selection is only allowed for SP memberships." }, { status: 400 }),
        context
      );
    }

    const { data: sp, error: spError } = await admin
      .from("sps")
      .select("id,organization_id")
      .eq("id", spId)
      .eq("organization_id", organizationId)
      .maybeSingle<{ id?: string | null; organization_id?: string | null }>();

    if (spError) {
      return applyOrganizationAuthCookies(
        jsonNoStore({ ok: false, error: safeErrorMessage(spError.message, "Could not validate the target SP record.") }, { status: 500 }),
        context
      );
    }

    if (!asText(sp?.id)) {
      return applyOrganizationAuthCookies(
        jsonNoStore({ ok: false, error: "Selected SP record does not belong to the target organization." }, { status: 400 }),
        context
      );
    }
  }

  const payload = {
    organization_id: organizationId,
    user_id: userId,
    role,
    status: "active",
    approved_by: context.user.id,
    approved_at: new Date().toISOString(),
    sp_id: role === "sp" ? spId || null : null,
  };

  const result = await admin
    .from("organization_memberships")
    .upsert(payload, { onConflict: "organization_id,user_id" })
    .select("id,organization_id,user_id,role,status,sp_id,approved_at")
    .maybeSingle<MembershipRow>();

  if (result.error && isMissingMembershipSpIdColumn(result.error)) {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, error: "organization_memberships.sp_id is required before SP memberships can be managed safely." }, { status: 500 }),
      context
    );
  }

  if (result.error) {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, error: safeErrorMessage(result.error.message, "Could not save the membership.") }, { status: 500 }),
      context
    );
  }

  return applyOrganizationAuthCookies(
    jsonNoStore({
      ok: true,
      membership: result.data,
      organization,
    }),
    context
  );
}

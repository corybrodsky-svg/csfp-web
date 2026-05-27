import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "../../../../lib/supabaseAdminClient";
import {
  createSupabaseUserClient,
  getOrganizationContext,
  requireActiveOrganization,
  roleCanOperateOrganization,
} from "../../../../lib/organizationAuth";
import {
  buildSpCommunicationPreferencePayload,
  getInvalidSpCommunicationPreferenceField,
  getSpCommunicationPreference,
  isMissingPreferenceSchemaError,
  normalizeSpCommunicationPreferenceRow,
} from "../../../../lib/spCommunicationPreferences";
import {
  getRouteId,
  getSupabaseError,
  logShiftRouteFailure,
  safeErrorJson,
  safeJson,
} from "../../../../lib/spShiftFoundation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function canOperateCurrentOrganization(context: Awaited<ReturnType<typeof getOrganizationContext>>) {
  return Boolean(
    roleCanOperateOrganization(context.role) ||
      context.legacyRole === "super_admin" ||
      context.legacyRole === "admin" ||
      context.legacyRole === "sim_op"
  );
}

async function loadSpInOrganization(db: SupabaseClient, spId: string, organizationId: string, scopeByOrganization: boolean) {
  let query = db
    .from("sps")
    .select("id,organization_id,first_name,last_name,full_name")
    .eq("id", spId)
    .limit(1);
  if (scopeByOrganization) query = query.eq("organization_id", organizationId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data as Record<string, unknown> | null;
}

async function isSpLinkedToAnyAuthUser(admin: SupabaseClient | null, spId: string) {
  if (!admin) return false;

  try {
    for (let page = 1; page <= 5; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) return false;
      const users = data.users || [];
      if (
        users.some((user) => {
          const metadata = user.user_metadata || {};
          return (
            asText(metadata.sp_id) === spId ||
            asText(metadata.linked_sp_id) === spId ||
            asText(metadata.sp_link_sp_id) === spId
          );
        })
      ) {
        return true;
      }
      if (users.length < 1000) return false;
    }
  } catch {
    return false;
  }

  return false;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id?: string | string[] }> }
) {
  const params = await context.params;
  const spId = getRouteId(params);
  if (!spId) return safeErrorJson("bad_request", "Missing SP id.", 400);

  const organizationContext = await getOrganizationContext();
  if (!organizationContext.user) return safeErrorJson("unauthorized", "Authentication is required.", 401, organizationContext);
  if (!requireActiveOrganization(organizationContext)) {
    return safeErrorJson("forbidden", "No active organization membership.", 403, organizationContext);
  }
  if (!canOperateCurrentOrganization(organizationContext)) {
    return safeErrorJson("forbidden", "Only admins and Sim Ops can read SP communication preferences.", 403, organizationContext);
  }

  const organizationId = asText(organizationContext.activeOrganization?.id);
  const admin = createSupabaseAdminClient();
  const db = admin || createSupabaseUserClient(organizationContext.accessToken);

  try {
    const sp = await loadSpInOrganization(db, spId, organizationId, Boolean(organizationContext.schemaAvailable));
    if (!sp) return safeErrorJson("not_found", "SP was not found in this organization.", 404, organizationContext);

    const linked = await isSpLinkedToAnyAuthUser(admin, spId);
    const { preference } = await getSpCommunicationPreference(db, { organizationId, spId, linked });
    return safeJson({ ok: true, preference }, undefined, organizationContext);
  } catch (error) {
    logShiftRouteFailure("api/sps/[id]/communication-preference GET", error, {
      spId,
      organizationId,
      userEmail: organizationContext.user.email,
    });
    return safeErrorJson("server_error", "Could not load SP communication preference.", 500, organizationContext, getSupabaseError(error));
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id?: string | string[] }> }
) {
  const params = await context.params;
  const spId = getRouteId(params);
  if (!spId) return safeErrorJson("bad_request", "Missing SP id.", 400);

  const organizationContext = await getOrganizationContext();
  if (!organizationContext.user) return safeErrorJson("unauthorized", "Authentication is required.", 401, organizationContext);
  if (!requireActiveOrganization(organizationContext)) {
    return safeErrorJson("forbidden", "No active organization membership.", 403, organizationContext);
  }
  if (!canOperateCurrentOrganization(organizationContext)) {
    return safeErrorJson("forbidden", "Only admins and Sim Ops can update SP communication preferences.", 403, organizationContext);
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return safeErrorJson("bad_request", "JSON body is required.", 400, organizationContext);
  const invalidField = getInvalidSpCommunicationPreferenceField(body);
  if (invalidField) return safeErrorJson("bad_request", `Invalid ${invalidField}.`, 400, organizationContext);

  const organizationId = asText(organizationContext.activeOrganization?.id);
  const admin = createSupabaseAdminClient();
  const db = admin || createSupabaseUserClient(organizationContext.accessToken);

  try {
    const sp = await loadSpInOrganization(db, spId, organizationId, Boolean(organizationContext.schemaAvailable));
    if (!sp) return safeErrorJson("not_found", "SP was not found in this organization.", 404, organizationContext);

    const linked = await isSpLinkedToAnyAuthUser(admin, spId);
    const { preference: current } = await getSpCommunicationPreference(db, { organizationId, spId, linked });
    const payload = buildSpCommunicationPreferencePayload({ ...current, ...body }, { organizationId, spId, fallback: current });
    const { data, error } = await db
      .from("sp_communication_preferences")
      .upsert(payload, { onConflict: "organization_id,sp_id" })
      .select("id,organization_id,sp_id,preferred_mode,portal_status,onboarding_status,last_invited_at,notes,created_at,updated_at")
      .single();

    if (error) throw error;
    return safeJson(
      { ok: true, preference: normalizeSpCommunicationPreferenceRow(data as Record<string, unknown>, current) },
      undefined,
      organizationContext
    );
  } catch (error) {
    logShiftRouteFailure("api/sps/[id]/communication-preference PATCH", error, {
      spId,
      organizationId,
      userEmail: organizationContext.user.email,
      payloadKeys: Object.keys(body).sort(),
    });
    if (isMissingPreferenceSchemaError(error)) {
      return safeErrorJson("schema_missing", "Communication preference tables are not installed yet.", 500, organizationContext);
    }
    return safeErrorJson("server_error", "Could not save SP communication preference.", 500, organizationContext, getSupabaseError(error));
  }
}

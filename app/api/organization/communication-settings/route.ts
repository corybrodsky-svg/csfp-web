import { createSupabaseAdminClient } from "../../../lib/supabaseAdminClient";
import {
  createSupabaseUserClient,
  getOrganizationContext,
  requireActiveOrganization,
  roleCanOperateOrganization,
} from "../../../lib/organizationAuth";
import {
  buildOrganizationCommunicationSettingsPayload,
  getInvalidOrganizationCommunicationSettingsField,
  getOrganizationCommunicationSettings,
  isMissingPreferenceSchemaError,
  normalizeOrganizationCommunicationSettingsRow,
} from "../../../lib/spCommunicationPreferences";
import {
  getSupabaseError,
  logShiftRouteFailure,
  safeErrorJson,
  safeJson,
} from "../../../lib/spShiftFoundation";

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

export async function GET() {
  const context = await getOrganizationContext();
  if (!context.user) return safeErrorJson("unauthorized", "Authentication is required.", 401, context);
  if (!requireActiveOrganization(context)) return safeErrorJson("forbidden", "No active organization membership.", 403, context);
  if (!canOperateCurrentOrganization(context)) {
    return safeErrorJson("forbidden", "Only admins and Sim Ops can read communication settings.", 403, context);
  }

  const organizationId = asText(context.activeOrganization?.id);
  const db = createSupabaseAdminClient() || createSupabaseUserClient(context.accessToken);

  try {
    const { settings } = await getOrganizationCommunicationSettings(db, organizationId);
    return safeJson({ ok: true, settings }, undefined, context);
  } catch (error) {
    logShiftRouteFailure("api/organization/communication-settings GET", error, {
      userEmail: context.user.email,
      organizationId,
    });
    return safeErrorJson("server_error", "Could not load communication settings.", 500, context, getSupabaseError(error));
  }
}

export async function PATCH(request: Request) {
  const context = await getOrganizationContext();
  if (!context.user) return safeErrorJson("unauthorized", "Authentication is required.", 401, context);
  if (!requireActiveOrganization(context)) return safeErrorJson("forbidden", "No active organization membership.", 403, context);
  if (!canOperateCurrentOrganization(context)) {
    return safeErrorJson("forbidden", "Only admins and Sim Ops can update communication settings.", 403, context);
  }

  const organizationId = asText(context.activeOrganization?.id);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return safeErrorJson("bad_request", "JSON body is required.", 400, context);
  const invalidField = getInvalidOrganizationCommunicationSettingsField(body);
  if (invalidField) return safeErrorJson("bad_request", `Invalid ${invalidField}.`, 400, context);
  const db = createSupabaseAdminClient() || createSupabaseUserClient(context.accessToken);

  try {
    const { settings: current } = await getOrganizationCommunicationSettings(db, organizationId);
    const payload = buildOrganizationCommunicationSettingsPayload({ ...current, ...body }, organizationId);
    const { data, error } = await db
      .from("organization_communication_settings")
      .upsert(payload, { onConflict: "organization_id" })
      .select(
        "id,organization_id,default_sp_communication_mode,allow_sp_portal,allow_email_workflow,allow_microsoft_forms_workflow,allow_manual_workflow,default_ms_forms_url,default_reply_to_email,sp_onboarding_message,created_at,updated_at"
      )
      .single();

    if (error) throw error;
    return safeJson(
      { ok: true, settings: normalizeOrganizationCommunicationSettingsRow(data as Record<string, unknown>, organizationId) },
      undefined,
      context
    );
  } catch (error) {
    logShiftRouteFailure("api/organization/communication-settings PATCH", error, {
      userEmail: context.user.email,
      organizationId,
      payloadKeys: Object.keys(body).sort(),
    });
    if (isMissingPreferenceSchemaError(error)) {
      return safeErrorJson("schema_missing", "Communication preference tables are not installed yet.", 500, context);
    }
    return safeErrorJson("server_error", "Could not save communication settings.", 500, context, getSupabaseError(error));
  }
}

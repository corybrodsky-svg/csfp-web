import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "../../../../lib/supabaseAdminClient";
import {
  createSupabaseUserClient,
  getOrganizationContext,
  requireActiveOrganization,
  roleCanOperateOrganization,
} from "../../../../lib/organizationAuth";
import {
  buildPortalInviteMessage,
  buildPortalInviteUrl,
  generatePortalInviteToken,
  getPortalInviteExpiresAt,
  getSpInviteDisplayName,
  getSpInviteEmail,
  hashPortalInviteToken,
  isMissingPortalInviteSchemaError,
} from "../../../../lib/spPortalInvites";
import {
  getSupabaseError,
  getRouteId,
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
    .select("id,organization_id,first_name,last_name,full_name,working_email,email")
    .eq("id", spId)
    .limit(1);
  if (scopeByOrganization) query = query.eq("organization_id", organizationId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data as Record<string, unknown> | null;
}

async function markExpiredInvites(db: SupabaseClient, organizationId: string, spId: string) {
  const nowIso = new Date().toISOString();
  const { error } = await db
    .from("sp_portal_invites")
    .update({ status: "expired" })
    .eq("organization_id", organizationId)
    .eq("sp_id", spId)
    .eq("status", "active")
    .lt("expires_at", nowIso);
  if (error && !isMissingPortalInviteSchemaError(error)) throw error;
}

function sanitizeInvite(row: Record<string, unknown>) {
  return {
    id: asText(row.id),
    status: asText(row.status) || "active",
    expires_at: asText(row.expires_at) || null,
    accepted_at: asText(row.accepted_at) || null,
    revoked_at: asText(row.revoked_at) || null,
    created_at: asText(row.created_at) || null,
  };
}

async function upsertCommunicationPreferenceInviteState(db: SupabaseClient, organizationId: string, spId: string) {
  const nowIso = new Date().toISOString();
  const { error } = await db
    .from("sp_communication_preferences")
    .upsert(
      {
        organization_id: organizationId,
        sp_id: spId,
        preferred_mode: "portal",
        portal_status: "invited",
        onboarding_status: "invited",
        last_invited_at: nowIso,
      },
      { onConflict: "organization_id,sp_id" }
    );
  if (error) throw error;
}

async function updatePreferenceAfterRevoke(db: SupabaseClient, organizationId: string, spId: string) {
  const { data: activeInvites, error: activeError } = await db
    .from("sp_portal_invites")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("sp_id", spId)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .limit(1);
  if (activeError) throw activeError;
  if ((activeInvites || []).length > 0) return;

  const { data: preference, error: preferenceError } = await db
    .from("sp_communication_preferences")
    .select("id,organization_id,sp_id,preferred_mode,portal_status,onboarding_status,last_invited_at,notes,created_at,updated_at")
    .eq("organization_id", organizationId)
    .eq("sp_id", spId)
    .maybeSingle();
  if (preferenceError) throw preferenceError;
  if (asText((preference as Record<string, unknown> | null)?.portal_status) === "linked") return;

  const { error: updateError } = await db
    .from("sp_communication_preferences")
    .upsert(
      {
        organization_id: organizationId,
        sp_id: spId,
        preferred_mode: asText((preference as Record<string, unknown> | null)?.preferred_mode) || "email",
        portal_status: "not_invited",
        onboarding_status: "not_started",
        last_invited_at: asText((preference as Record<string, unknown> | null)?.last_invited_at) || null,
      },
      { onConflict: "organization_id,sp_id" }
    );
  if (updateError) throw updateError;
}

async function resolveAdminRequest(spId: string) {
  const context = await getOrganizationContext();
  if (!context.user) return { error: safeErrorJson("unauthorized", "Authentication is required.", 401, context) };
  if (!requireActiveOrganization(context)) {
    return { error: safeErrorJson("forbidden", "No active organization membership.", 403, context) };
  }
  if (!canOperateCurrentOrganization(context)) {
    return { error: safeErrorJson("forbidden", "Only admins and Sim Ops can manage SP portal invites.", 403, context) };
  }

  const organizationId = asText(context.activeOrganization?.id);
  const db = createSupabaseAdminClient() || createSupabaseUserClient(context.accessToken);
  const sp = await loadSpInOrganization(db, spId, organizationId, Boolean(context.schemaAvailable));
  if (!sp) return { error: safeErrorJson("not_found", "SP was not found in this organization.", 404, context) };

  return { context, db, organizationId, sp };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id?: string | string[] }> }
) {
  const params = await context.params;
  const spId = getRouteId(params);
  if (!spId) return safeErrorJson("bad_request", "Missing SP id.", 400);

  try {
    const resolved = await resolveAdminRequest(spId);
    if (resolved.error) return resolved.error;
    const { context: organizationContext, db, organizationId } = resolved;
    await markExpiredInvites(db, organizationId, spId);

    const { data, error } = await db
      .from("sp_portal_invites")
      .select("id,status,expires_at,accepted_at,revoked_at,created_at")
      .eq("organization_id", organizationId)
      .eq("sp_id", spId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw error;
    return safeJson({ ok: true, invites: ((data || []) as Record<string, unknown>[]).map(sanitizeInvite) }, undefined, organizationContext);
  } catch (error) {
    logShiftRouteFailure("api/sps/[id]/portal-invites GET", error, { spId });
    if (isMissingPortalInviteSchemaError(error)) {
      return safeErrorJson("schema_missing", "SP portal invite tables are not installed yet.", 500);
    }
    return safeErrorJson("server_error", "Could not load SP portal invites.", 500, undefined, getSupabaseError(error));
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id?: string | string[] }> }
) {
  const params = await context.params;
  const spId = getRouteId(params);
  if (!spId) return safeErrorJson("bad_request", "Missing SP id.", 400);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  try {
    const resolved = await resolveAdminRequest(spId);
    if (resolved.error) return resolved.error;
    const { context: organizationContext, db, organizationId, sp } = resolved;
    await markExpiredInvites(db, organizationId, spId);

    const nowIso = new Date().toISOString();
    const { error: revokeError } = await db
      .from("sp_portal_invites")
      .update({ status: "revoked", revoked_at: nowIso })
      .eq("organization_id", organizationId)
      .eq("sp_id", spId)
      .eq("status", "active");
    if (revokeError) throw revokeError;

    const rawToken = generatePortalInviteToken();
    const tokenHash = hashPortalInviteToken(rawToken);
    const expiresAt = getPortalInviteExpiresAt(body.expiresInDays);
    const inviteEmail = getSpInviteEmail(sp);
    const { data, error } = await db
      .from("sp_portal_invites")
      .insert({
        organization_id: organizationId,
        sp_id: spId,
        invite_email: inviteEmail,
        token_hash: tokenHash,
        status: "active",
        expires_at: expiresAt,
        created_by: organizationContext.user?.id || null,
      })
      .select("id,status,expires_at,created_at")
      .single();
    if (error) throw error;

    await upsertCommunicationPreferenceInviteState(db, organizationId, spId);

    const inviteUrl = buildPortalInviteUrl(new URL(request.url).origin, rawToken);
    const inviteMessage = buildPortalInviteMessage({
      spName: getSpInviteDisplayName(sp),
      organizationName: organizationContext.activeOrganization?.name,
      inviteUrl,
    });

    return safeJson(
      {
        ok: true,
        invite: {
          id: asText((data as Record<string, unknown>).id),
          status: asText((data as Record<string, unknown>).status),
          expires_at: asText((data as Record<string, unknown>).expires_at),
          invite_url: inviteUrl,
          invite_message: inviteMessage,
        },
      },
      undefined,
      organizationContext
    );
  } catch (error) {
    logShiftRouteFailure("api/sps/[id]/portal-invites POST", error, { spId });
    if (isMissingPortalInviteSchemaError(error)) {
      return safeErrorJson("schema_missing", "SP portal invite tables are not installed yet.", 500);
    }
    return safeErrorJson("server_error", "Could not create SP portal invite.", 500, undefined, getSupabaseError(error));
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id?: string | string[] }> }
) {
  const params = await context.params;
  const spId = getRouteId(params);
  if (!spId) return safeErrorJson("bad_request", "Missing SP id.", 400);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || asText(body.action) !== "revoke") {
    return safeErrorJson("bad_request", "Supported action is revoke.", 400);
  }

  try {
    const resolved = await resolveAdminRequest(spId);
    if (resolved.error) return resolved.error;
    const { context: organizationContext, db, organizationId } = resolved;
    await markExpiredInvites(db, organizationId, spId);

    const inviteId = asText(body.inviteId);
    let activeInviteQuery = db
      .from("sp_portal_invites")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("sp_id", spId)
      .eq("status", "active");
    if (inviteId) activeInviteQuery = activeInviteQuery.eq("id", inviteId);
    const { data: activeInvite, error: activeInviteError } = await activeInviteQuery
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (activeInviteError) throw activeInviteError;
    const activeInviteId = asText((activeInvite as Record<string, unknown> | null)?.id);
    if (!activeInviteId) {
      return safeErrorJson("not_found", "No active invite was found to revoke.", 404, organizationContext);
    }

    const { data, error } = await db
      .from("sp_portal_invites")
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("id", activeInviteId)
      .select("id,status,expires_at,revoked_at")
      .single();
    if (error) throw error;
    const revokedInvite = data as Record<string, unknown>;

    await updatePreferenceAfterRevoke(db, organizationId, spId);

    return safeJson({ ok: true, invite: sanitizeInvite(revokedInvite) }, undefined, organizationContext);
  } catch (error) {
    logShiftRouteFailure("api/sps/[id]/portal-invites PATCH", error, { spId });
    if (isMissingPortalInviteSchemaError(error)) {
      return safeErrorJson("schema_missing", "SP portal invite tables are not installed yet.", 500);
    }
    return safeErrorJson("server_error", "Could not revoke SP portal invite.", 500, undefined, getSupabaseError(error));
  }
}

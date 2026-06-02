import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "../../../../lib/supabaseAdminClient";
import {
  getCommunicationBadge,
  getDefaultSpCommunicationPreference,
  getOrganizationCommunicationSettings,
  isMissingPreferenceSchemaError,
  normalizeSpCommunicationPreferenceRow,
} from "../../../../lib/spCommunicationPreferences";
import { sanitizePublicErrorMessage } from "../../../../lib/safeErrorMessage";
import {
  isMissingPortalInviteSchemaError,
  isPortalInviteExpired,
  normalizePortalInviteStatus,
} from "../../../../lib/spPortalInvites";
import {
  getRouteId,
  getSupabaseError,
  logShiftRouteFailure,
  resolveShiftRouteAccess,
  safeErrorJson,
  safeJson,
} from "../../../../lib/spShiftFoundation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type CoverageCounts = {
  total: number;
  portal: number;
  email: number;
  microsoft_forms: number;
  phone: number;
  manual: number;
  do_not_contact: number;
  needs_help: number;
  invited: number;
  linked: number;
  not_invited: number;
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function getDisplayName(sp: Record<string, unknown> | null | undefined, fallback: string) {
  return (
    asText(sp?.full_name) ||
    [asText(sp?.first_name), asText(sp?.last_name)].filter(Boolean).join(" ") ||
    fallback
  );
}

function getEmptyCounts(): CoverageCounts {
  return {
    total: 0,
    portal: 0,
    email: 0,
    microsoft_forms: 0,
    phone: 0,
    manual: 0,
    do_not_contact: 0,
    needs_help: 0,
    invited: 0,
    linked: 0,
    not_invited: 0,
  };
}

async function getLinkedSpIds(admin: SupabaseClient | null, spIds: string[]) {
  const targetIds = new Set(spIds.map(asText).filter(Boolean));
  const linked = new Set<string>();
  if (!admin || targetIds.size === 0) return linked;

  try {
    for (let page = 1; page <= 5; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) return linked;
      const users = data.users || [];
      users.forEach((user) => {
        const metadata = user.user_metadata || {};
        const spId = asText(metadata.sp_id) || asText(metadata.linked_sp_id) || asText(metadata.sp_link_sp_id);
        if (targetIds.has(spId)) linked.add(spId);
      });
      if (linked.size === targetIds.size || users.length < 1000) return linked;
    }
  } catch {
    return linked;
  }

  return linked;
}

async function loadPortalInviteRows(db: SupabaseClient, organizationId: string, spIds: string[]) {
  if (!organizationId || !spIds.length) return [] as Record<string, unknown>[];
  const nowIso = new Date().toISOString();
  const expireResult = await db
    .from("sp_portal_invites")
    .update({ status: "expired" })
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .in("sp_id", spIds)
    .lt("expires_at", nowIso);
  if (expireResult.error) {
    throw expireResult.error;
  }

  const { data, error } = await db
    .from("sp_portal_invites")
    .select("id,sp_id,status,expires_at,created_at")
    .eq("organization_id", organizationId)
    .in("sp_id", spIds)
    .order("created_at", { ascending: false });
  if (error) {
    throw error;
  }
  return (data || []) as Record<string, unknown>[];
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id?: string | string[] }> }
) {
  const params = await context.params;
  const eventId = getRouteId(params);
  if (!eventId) return safeErrorJson("bad_request", "Missing event id.", 400);

  const access = await resolveShiftRouteAccess(eventId);
  if (access instanceof Response) return access;
  if (!access.isManager) {
    return safeErrorJson("forbidden", "Only admins and Sim Ops can read SP communication coverage.", 403, access.context);
  }

  const organizationId = asText(access.event.organization_id) || asText(access.context.activeOrganization?.id);
  const admin = createSupabaseAdminClient();

  try {
    const settingsResult = await getOrganizationCommunicationSettings(access.db, organizationId);
    if (!settingsResult.schemaAvailable) {
      return safeErrorJson(
        "migration_required",
        "Communication preferences are not configured yet.",
        503,
        access.context,
        {
          setup_notice: "communication_preferences_migration_required",
          route: "/api/events/[id]/communication-coverage",
          eventId,
          activeOrgId: asText(access.context.activeOrganization?.id),
          role: access.context.role || access.context.legacyRole,
        }
      );
    }
    const { settings } = settingsResult;
    let assignmentsQuery = access.db
      .from("event_sps")
      .select("id,event_id,sp_id,status,confirmed,organization_id")
      .eq("event_id", eventId);
    if (access.context.schemaAvailable && organizationId) assignmentsQuery = assignmentsQuery.eq("organization_id", organizationId);
    const { data: assignments, error: assignmentsError } = await assignmentsQuery;
    if (assignmentsError) throw assignmentsError;

    const assignedSpIds = Array.from(
      new Set(((assignments || []) as Array<Record<string, unknown>>).map((assignment) => asText(assignment.sp_id)).filter(Boolean))
    );
    if (!assignedSpIds.length) {
      return safeJson({ ok: true, settings, counts: getEmptyCounts(), sps: [] }, undefined, access.context);
    }

    let spsQuery = access.db
      .from("sps")
      .select("id,organization_id,first_name,last_name,full_name")
      .in("id", assignedSpIds);
    if (access.context.schemaAvailable && organizationId) spsQuery = spsQuery.eq("organization_id", organizationId);
    const { data: sps, error: spsError } = await spsQuery;
    if (spsError) throw spsError;

    const spsById = new Map(((sps || []) as Record<string, unknown>[]).map((sp) => [asText(sp.id), sp]));
    const visibleSpIds = assignedSpIds.filter((spId) => spsById.has(spId));
    const linkedSpIds = await getLinkedSpIds(admin, visibleSpIds);

    let preferenceRows = [] as Record<string, unknown>[];
    const preferencesResult = await access.db
      .from("sp_communication_preferences")
      .select("id,organization_id,sp_id,preferred_mode,portal_status,onboarding_status,last_invited_at,created_at,updated_at")
      .eq("organization_id", organizationId)
      .in("sp_id", visibleSpIds);
    if (preferencesResult.error) {
      if (isMissingPreferenceSchemaError(preferencesResult.error)) {
        return safeErrorJson(
          "migration_required",
          "Communication preferences are not configured yet.",
          503,
          access.context,
          {
            setup_notice: "communication_preferences_migration_required",
            route: "/api/events/[id]/communication-coverage",
            eventId,
            activeOrgId: asText(access.context.activeOrganization?.id),
            role: access.context.role || access.context.legacyRole,
          }
        );
      }
      throw preferencesResult.error;
    } else {
      preferenceRows = (preferencesResult.data || []) as Record<string, unknown>[];
    }

    const inviteRows = await loadPortalInviteRows(access.db, organizationId, visibleSpIds);
    const invitesBySpId = new Map<string, Record<string, unknown>[]>();
    inviteRows.forEach((row) => {
      const spId = asText(row.sp_id);
      if (!spId) return;
      invitesBySpId.set(spId, [...(invitesBySpId.get(spId) || []), row]);
    });

    const preferenceBySpId = new Map(preferenceRows.map((row) => [asText(row.sp_id), row]));
    const counts = getEmptyCounts();
    const spsPayload = visibleSpIds
      .map((spId) => {
        const fallback = getDefaultSpCommunicationPreference({ organizationId, spId, linked: linkedSpIds.has(spId) });
        const preference = normalizeSpCommunicationPreferenceRow(preferenceBySpId.get(spId), fallback);
        const badge = getCommunicationBadge(preference);
        const invites = invitesBySpId.get(spId) || [];
        const latestInvite = invites[0] || null;
        const activeInvite = invites.find((invite) => normalizePortalInviteStatus(invite.status) === "active" && !isPortalInviteExpired(invite.expires_at)) || null;
        counts.total += 1;
        counts[preference.preferred_mode] += 1;
        if (preference.portal_status === "needs_help" || preference.onboarding_status === "needs_help") counts.needs_help += 1;
        if (preference.portal_status === "invited" || preference.onboarding_status === "invited") counts.invited += 1;
        if (preference.portal_status === "linked") counts.linked += 1;
        if (preference.portal_status === "not_invited") counts.not_invited += 1;

        return {
          sp_id: spId,
          display_name: getDisplayName(spsById.get(spId), "Assigned SP"),
          preferred_mode: preference.preferred_mode,
          portal_status: preference.portal_status,
          onboarding_status: preference.onboarding_status,
          badge_label: badge.label,
          latest_invite_id: asText(latestInvite?.id) || null,
          latest_invite_status: latestInvite ? normalizePortalInviteStatus(latestInvite.status) : null,
          latest_invite_expires_at: asText(latestInvite?.expires_at) || null,
          has_active_invite: Boolean(activeInvite),
        };
      })
      .sort((a, b) => a.display_name.localeCompare(b.display_name));

    return safeJson({ ok: true, settings, counts, sps: spsPayload }, undefined, access.context);
  } catch (error) {
    const supabaseDiagnostics = getSupabaseError(error);
    logShiftRouteFailure("api/events/[id]/communication-coverage GET", error, {
      eventId,
      organizationId,
      userEmail: access.context.user?.email,
    });
    if (isMissingPreferenceSchemaError(error) || isMissingPortalInviteSchemaError(error)) {
      return safeErrorJson(
        "migration_required",
        "Communication preferences are not configured yet.",
        503,
        access.context,
        {
          setup_notice: "communication_preferences_migration_required",
          route: "/api/events/[id]/communication-coverage",
          eventId,
          activeOrgId: asText(access.context.activeOrganization?.id),
          role: access.context.role || access.context.legacyRole,
          code: supabaseDiagnostics.code,
          details: sanitizePublicErrorMessage(supabaseDiagnostics.details, ""),
          hint: sanitizePublicErrorMessage(supabaseDiagnostics.hint, ""),
          message: sanitizePublicErrorMessage(supabaseDiagnostics.message, "Communication preferences are not configured yet."),
        }
      );
    }
    return safeErrorJson(
      "server_error",
      "Could not load SP communication coverage.",
      500,
      access.context,
      {
        route: "/api/events/[id]/communication-coverage",
        eventId,
        activeOrgId: asText(access.context.activeOrganization?.id),
        role: access.context.role || access.context.legacyRole,
        code: supabaseDiagnostics.code,
        details: sanitizePublicErrorMessage(supabaseDiagnostics.details, ""),
        hint: sanitizePublicErrorMessage(supabaseDiagnostics.hint, ""),
        message: sanitizePublicErrorMessage(supabaseDiagnostics.message, "Could not load SP communication coverage."),
      }
    );
  }
}

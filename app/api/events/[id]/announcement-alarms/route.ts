import { NextResponse } from "next/server";
import { parseAnnouncementAlertSettings, serializeAnnouncementAlertSettings } from "../../../../lib/announcementCues";
import { upsertEventMetadata } from "../../../../lib/eventMetadata";
import {
  applyOrganizationAuthCookies,
  createSupabaseUserClient,
  getOrganizationContext,
  jsonNoStore,
  noActiveOrganizationJson,
  requireActiveOrganization,
  roleCanOperateOrganization,
  unauthorizedJson,
  type OrganizationContext,
} from "../../../../lib/organizationAuth";
import { sanitizeScheduleWorkflowNotes } from "../../../../lib/scheduleWorkflowNotes";
import { createSupabaseAdminClient } from "../../../../lib/supabaseAdminClient";
import { parseTrainingEventMetadata } from "../../../../lib/trainingEventNotes";

export const dynamic = "force-dynamic";

type EventAlarmAccess = {
  context: OrganizationContext;
  db: ReturnType<typeof createSupabaseUserClient>;
  event: {
    id: string;
    notes?: string | null;
    organization_id?: string | null;
  };
};

type SupabaseErrorLike = {
  message?: string | null;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
};

const DEFAULT_ANNOUNCEMENT_ALARM_SETTINGS = parseAnnouncementAlertSettings("");

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function getRouteId(params: unknown) {
  const raw =
    params && typeof params === "object" && "id" in params
      ? (params as { id?: string | string[] }).id
      : "";
  if (Array.isArray(raw)) return raw[0] || "";
  return typeof raw === "string" ? raw : "";
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

function getSupabaseError(error: unknown) {
  const source = toSupabaseError(error);
  return {
    message: asText(source.message),
    code: asText(source.code),
    details: asText(source.details),
    hint: asText(source.hint),
  };
}

function isMissingColumnError(error: unknown, columnName: string) {
  const source = toSupabaseError(error);
  const code = asText(source.code).toLowerCase();
  const text = [source.message, source.details, source.hint].map(asText).join(" ").toLowerCase();
  const target = columnName.toLowerCase();
  return code === "42703" || (text.includes(target) && (text.includes("does not exist") || text.includes("schema cache") || text.includes("column")));
}

function isMissingOrganizationColumnError(error: unknown) {
  return isMissingColumnError(error, "organization_id");
}

function isOperatorContext(context: OrganizationContext) {
  return Boolean(
    roleCanOperateOrganization(context.role) ||
      context.legacyRole === "super_admin" ||
      context.legacyRole === "admin" ||
      context.legacyRole === "sim_op"
  );
}

function isPlatformOwnerContext(context: OrganizationContext) {
  return Boolean(
    context.isPlatformOwner ||
      context.role === "platform_owner" ||
      context.legacyRole === "super_admin"
  );
}

function safeJson(body: Record<string, unknown>, init?: ResponseInit, context?: OrganizationContext | null) {
  return applyOrganizationAuthCookies(jsonNoStore(body, init), context || null);
}

function safeErrorJson(error: string, message: string, status: number, context?: OrganizationContext | null) {
  return safeJson(
    {
      ok: false,
      error,
      message,
      status,
    },
    { status },
    context || null
  );
}

function logAnnouncementAlarmFailure(stage: string, error: unknown, extra?: Record<string, unknown>) {
  console.error("[announcement-alarms]", {
    stage,
    ...getSupabaseError(error),
    ...(extra || {}),
  });
}

function getSafeAnnouncementAlarmUpdates(rawUpdates: unknown) {
  if (!rawUpdates || typeof rawUpdates !== "object") return null;

  const source = rawUpdates as Record<string, unknown>;
  const updates: Record<string, boolean | string> = {};

  if (typeof source.liveModeActive === "boolean") {
    updates.liveModeActive = source.liveModeActive;
  }
  if (typeof source.muteAlerts === "boolean") {
    updates.muteAlerts = source.muteAlerts;
  }
  if (typeof source.notificationsEnabled === "boolean") {
    updates.notificationsEnabled = source.notificationsEnabled;
  }
  if (typeof source.lastStartedAt === "string") {
    updates.lastStartedAt = asText(source.lastStartedAt);
  }

  return Object.keys(updates).length ? updates : null;
}

function readAnnouncementAlertSettings(notes?: string | null) {
  const currentNotes = sanitizeScheduleWorkflowNotes(notes ?? "");
  const metadata = parseTrainingEventMetadata(currentNotes);
  return parseAnnouncementAlertSettings(metadata.announcement_alert_settings);
}

async function resolveAnnouncementAlarmAccess(eventId: string): Promise<EventAlarmAccess | NextResponse> {
  const context = await getOrganizationContext();
  if (!context.user) return unauthorizedJson(context);
  if (!requireActiveOrganization(context)) return noActiveOrganizationJson(context);
  if (!isOperatorContext(context)) {
    return safeErrorJson("forbidden", "You do not have access to announcement alarm settings.", 403, context);
  }

  const admin = createSupabaseAdminClient();
  const db = admin || createSupabaseUserClient(context.accessToken);
  const activeOrganizationId = asText(context.activeOrganization?.id);
  const platformOwner = isPlatformOwnerContext(context);

  const runEventQuery = async (includeOrganizationColumn: boolean) => {
    let query = db
      .from("events")
      .select(includeOrganizationColumn ? "id,notes,organization_id" : "id,notes")
      .eq("id", eventId);

    if (includeOrganizationColumn && context.schemaAvailable && !platformOwner) {
      query = query.or(`organization_id.eq.${activeOrganizationId},organization_id.is.null`);
    }

    const result = await query.maybeSingle();
    return {
      data: result.data as EventAlarmAccess["event"] | null,
      error: result.error,
    };
  };

  let eventResult = await runEventQuery(context.schemaAvailable);
  if (eventResult.error && context.schemaAvailable && isMissingOrganizationColumnError(eventResult.error)) {
    logAnnouncementAlarmFailure("event-organization-column-fallback", eventResult.error, {
      eventId,
      userEmail: context.user.email,
    });
    eventResult = await runEventQuery(false);
  }

  if (eventResult.error) {
    logAnnouncementAlarmFailure("event-load", eventResult.error, {
      eventId,
      userEmail: context.user.email,
      role: context.role,
      legacyRole: context.legacyRole,
      adminClientUsed: Boolean(admin),
    });
    return safeErrorJson("server_error", "Announcement alarm settings could not be loaded.", 500, context);
  }

  if (!eventResult.data) {
    return safeErrorJson("not_found", "Event was not found.", 404, context);
  }

  return {
    context,
    db,
    event: eventResult.data,
  };
}

export async function GET(
  _request: Request,
  context: { params: Promise<unknown> }
) {
  const params = await context.params;
  const eventId = getRouteId(params);
  if (!eventId) return safeErrorJson("bad_request", "Missing event id.", 400);

  const access = await resolveAnnouncementAlarmAccess(eventId);
  if (access instanceof NextResponse) return access;

  return safeJson(
    {
      ok: true,
      alert_settings: readAnnouncementAlertSettings(access.event.notes) || DEFAULT_ANNOUNCEMENT_ALARM_SETTINGS,
    },
    undefined,
    access.context
  );
}

export async function PATCH(
  request: Request,
  context: { params: Promise<unknown> }
) {
  const params = await context.params;
  const eventId = getRouteId(params);
  if (!eventId) return safeErrorJson("bad_request", "Missing event id.", 400);

  const access = await resolveAnnouncementAlarmAccess(eventId);
  if (access instanceof NextResponse) return access;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const alertUpdates = getSafeAnnouncementAlarmUpdates(body?.alert_settings);
  if (!alertUpdates) {
    return safeErrorJson("bad_request", "No announcement alarm settings were provided.", 400, access.context);
  }

  try {
    const currentNotes = sanitizeScheduleWorkflowNotes(access.event.notes ?? "");
    const currentAlertSettings = readAnnouncementAlertSettings(currentNotes);
    const nextAlertSettings = {
      ...currentAlertSettings,
      ...alertUpdates,
    };

    const nextNotes = upsertEventMetadata(currentNotes, {
      training: {
        announcement_alert_settings: serializeAnnouncementAlertSettings(nextAlertSettings),
      },
    });

    const { error: updateError } = await access.db
      .from("events")
      .update({ notes: nextNotes })
      .eq("id", eventId);

    if (updateError) {
      logAnnouncementAlarmFailure("event-update", updateError, {
        eventId,
        userEmail: access.context.user?.email,
        role: access.context.role,
        legacyRole: access.context.legacyRole,
      });
      return safeErrorJson("server_error", "Announcement alarm settings could not be loaded.", 500, access.context);
    }

    return safeJson({ ok: true, alert_settings: nextAlertSettings }, undefined, access.context);
  } catch (error) {
    logAnnouncementAlarmFailure("patch-unhandled", error, {
      eventId,
      userEmail: access.context.user?.email,
      role: access.context.role,
      legacyRole: access.context.legacyRole,
    });
    return safeErrorJson("server_error", "Announcement alarm settings could not be loaded.", 500, access.context);
  }
}

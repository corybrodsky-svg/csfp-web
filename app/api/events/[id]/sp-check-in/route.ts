import { NextResponse } from "next/server";
import {
  getRouteId,
  getSupabaseError,
  logShiftRouteFailure,
  resolveShiftRouteAccess,
  safeErrorJson,
  safeJson,
  SP_ATTENDANCE_SELECT,
} from "../../../../lib/spShiftFoundation";
import {
  buildSpPortalCheckInSummary,
  buildSpPortalCheckInWindow,
  getHaversineDistanceMeters,
  getSpPortalCheckInGeofence,
  parseSpPortalCheckInMetadata,
  upsertSpPortalCheckInMetadata,
} from "../../../../lib/spPortalCheckIn";
import { parseTrainingEventMetadata } from "../../../../lib/trainingEventNotes";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function asFiniteNumber(value: unknown) {
  const numeric = Number(asText(value));
  return Number.isFinite(numeric) ? numeric : null;
}

function isConfirmedWorkAssignment(assignment: Record<string, unknown>) {
  const status = asText(assignment.status || assignment.assignment_status).toLowerCase();
  if (status === "declined" || status === "no_show" || status === "cancelled" || status === "canceled") return false;
  if (assignment.confirmed === true) return true;
  return ["confirmed", "scheduled", "assigned", "backup", "confirmed_primary", "confirmed_backup"].includes(status);
}

function mapAttendanceForPortal(row: Record<string, unknown>, checkIn: ReturnType<typeof buildSpPortalCheckInSummary>) {
  return {
    id: asText(row.id),
    status: asText(row.status) || "not_arrived",
    checked_in_at: asText(row.checked_in_at) || null,
    checked_out_at: asText(row.checked_out_at) || null,
    updated_at: asText(row.updated_at) || null,
    checkIn,
  };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id?: string | string[] }> }
) {
  const params = await context.params;
  const eventId = getRouteId(params);
  if (!eventId) return safeErrorJson("bad_request", "Missing event id.", 400);

  const access = await resolveShiftRouteAccess(eventId);
  if (access instanceof NextResponse) return access;
  if (!access.linkedSpId) {
    return safeErrorJson("forbidden", "Your SP account is not linked yet.", 403, access.context);
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return safeErrorJson("bad_request", "JSON body is required.", 400, access.context);

  const assignmentId = asText(body.assignmentId || body.assignment_id);
  const latitude = asFiniteNumber(body.latitude || body.lat);
  const longitude = asFiniteNumber(body.longitude || body.lng || body.lon);
  const accuracyMeters = asFiniteNumber(body.accuracyMeters || body.accuracy_meters || body.accuracy);

  if (!assignmentId) return safeErrorJson("bad_request", "assignmentId is required.", 400, access.context);
  if (latitude === null || longitude === null) {
    return safeErrorJson("bad_request", "Browser location is required to check in.", 400, access.context);
  }

  try {
    const eventOrgId = asText(access.event.organization_id);
    const activeOrgId = asText(access.context.activeOrganization?.id);
    if (eventOrgId && activeOrgId && eventOrgId !== activeOrgId && !access.context.isPlatformOwner) {
      return safeErrorJson("forbidden", "This event belongs to a different organization.", 403, access.context);
    }

    const { data: assignment, error: assignmentError } = await access.db
      .from("event_sps")
      .select("id,event_id,sp_id,organization_id,status,assignment_status,confirmed")
      .eq("id", assignmentId)
      .eq("event_id", eventId)
      .eq("sp_id", access.linkedSpId)
      .maybeSingle();
    if (assignmentError) throw assignmentError;
    if (!assignment) {
      return safeErrorJson("not_found", "Confirmed assignment was not found for this SP.", 404, access.context);
    }

    const assignmentRow = assignment as Record<string, unknown>;
    const assignmentOrgId = asText(assignmentRow.organization_id);
    if (eventOrgId && assignmentOrgId && eventOrgId !== assignmentOrgId) {
      return safeErrorJson("forbidden", "This assignment belongs to a different organization.", 403, access.context);
    }
    if (!isConfirmedWorkAssignment(assignmentRow)) {
      return safeErrorJson("forbidden", "Only confirmed or scheduled assignments can use portal check-in.", 403, access.context);
    }

    const [eventResult, sessionsResult, existingResult] = await Promise.all([
      access.db
        .from("events")
        .select("id,name,date_text,notes,organization_id")
        .eq("id", eventId)
        .maybeSingle(),
      access.db
        .from("event_sessions")
        .select("session_date,start_time,end_time")
        .eq("event_id", eventId)
        .order("session_date", { ascending: true })
        .order("start_time", { ascending: true }),
      access.db
        .from("event_sp_attendance")
        .select(SP_ATTENDANCE_SELECT)
        .eq("event_id", eventId)
        .eq("sp_id", access.linkedSpId)
        .maybeSingle(),
    ]);
    if (eventResult.error) throw eventResult.error;
    if (sessionsResult.error) throw sessionsResult.error;
    if (existingResult.error) throw existingResult.error;

    const eventRow = (eventResult.data || {}) as Record<string, unknown>;
    const sessions = (sessionsResult.data || []) as Record<string, unknown>[];
    const firstSession = sessions[0] || null;
    const lastSession = sessions[sessions.length - 1] || firstSession;
    const metadata = parseTrainingEventMetadata(asText(eventRow.notes));
    const eventTiming = {
      date: asText(firstSession?.session_date) || asText(metadata.event_session_date) || asText(eventRow.date_text) || null,
      start_time: asText(firstSession?.start_time) || asText(metadata.event_start_time) || null,
      end_time: asText(lastSession?.end_time) || asText(metadata.event_end_time) || null,
    };

    const window = buildSpPortalCheckInWindow(eventTiming, Date.now(), metadata);
    if (!window.canCheckIn) {
      return safeErrorJson("check_in_window_closed", window.message, 409, access.context);
    }

    const geofence = getSpPortalCheckInGeofence(metadata);
    if (!geofence.ready || geofence.latitude === null || geofence.longitude === null) {
      return safeErrorJson(
        "check_in_location_not_configured",
        "Check-in location is not set up yet. Please check in with the simulation team.",
        409,
        access.context
      );
    }

    const now = new Date().toISOString();
    const distanceMeters = getHaversineDistanceMeters(
      { latitude, longitude },
      { latitude: geofence.latitude, longitude: geofence.longitude }
    );
    const locationVerified = distanceMeters <= geofence.radiusMeters;
    const existing = (existingResult.data || null) as Record<string, unknown> | null;
    const existingMetadata = parseSpPortalCheckInMetadata(asText(existing?.notes));
    const nextStatus = locationVerified ? "checked_in" : "not_arrived";
    const checkedInAt = locationVerified
      ? asText(existing?.checked_in_at) || now
      : asText(existing?.checked_in_at) && asText(existing?.status) === "checked_in"
        ? asText(existing?.checked_in_at)
        : "";
    const nextNotes = upsertSpPortalCheckInMetadata(existing?.notes as string | null | undefined, {
      checkInMethod: locationVerified ? "location_verified" : "location_failed",
      locationVerified,
      distanceMeters,
      accuracyMeters,
      checkedInAt: checkedInAt || null,
      attemptedAt: now,
      updatedAt: now,
      failureReason: locationVerified ? "" : "outside_range",
      manualOverride: existingMetadata.manualOverride || "",
    });
    const payload: Record<string, unknown> = {
      event_id: eventId,
      sp_id: access.linkedSpId,
      status: nextStatus,
      notes: nextNotes || null,
      updated_at: now,
    };
    if (!existing) payload.created_at = now;
    if (locationVerified) {
      payload.checked_in_at = checkedInAt || now;
      payload.checked_in_by = access.context.user?.id || null;
    } else if (!asText(existing?.checked_in_at)) {
      payload.checked_in_at = null;
      payload.checked_in_by = null;
    }

    const { data: saved, error: saveError } = await access.db
      .from("event_sp_attendance")
      .upsert(payload, { onConflict: "event_id,sp_id" })
      .select(SP_ATTENDANCE_SELECT)
      .single();
    if (saveError) throw saveError;

    if (locationVerified) {
      await access.db
        .from("event_sps")
        .update({
          event_checked_in_at: checkedInAt || now,
          event_attendance_status: "arrived",
          attendance_note: "Portal location check-in verified.",
        })
        .eq("id", assignmentId)
        .eq("event_id", eventId)
        .eq("sp_id", access.linkedSpId);
    }

    const savedRow = saved as Record<string, unknown>;
    const checkIn = buildSpPortalCheckInSummary(savedRow, eventTiming, metadata);
    return safeJson(
      {
        ok: true,
        checkedIn: locationVerified,
        message: locationVerified
          ? "Checked in - location verified"
          : "We could not verify that you are at the event location.",
        attendance: mapAttendanceForPortal(savedRow, checkIn),
        checkIn,
      },
      undefined,
      access.context
    );
  } catch (error) {
    logShiftRouteFailure("api/events/[id]/sp-check-in POST", error, {
      eventId,
      assignmentId,
      userEmail: access.context.user?.email,
    });
    return safeErrorJson("server_error", "Could not save SP check-in.", 500, access.context, getSupabaseError(error));
  }
}

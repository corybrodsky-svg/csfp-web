import { NextResponse } from "next/server";
import {
  getRouteId,
  getSupabaseError,
  loadSpDirectory,
  logShiftRouteFailure,
  normalizeAttendanceStatus,
  resolveShiftRouteAccess,
  safeErrorJson,
  safeJson,
  SP_ATTENDANCE_SELECT,
  withSpDirectoryRows,
} from "../../../../lib/spShiftFoundation";
import {
  normalizeSpPortalCheckInMethod,
  upsertSpPortalCheckInMetadata,
} from "../../../../lib/spPortalCheckIn";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id?: string | string[] }> }
) {
  const params = await context.params;
  const eventId = getRouteId(params);
  if (!eventId) return safeErrorJson("bad_request", "Missing event id.", 400);

  const access = await resolveShiftRouteAccess(eventId);
  if (access instanceof NextResponse) return access;

  try {
    let query = access.db
      .from("event_sp_attendance")
      .select(SP_ATTENDANCE_SELECT)
      .eq("event_id", eventId)
      .order("updated_at", { ascending: false });

    if (!access.isManager) {
      if (!access.linkedSpId) return safeErrorJson("forbidden", "Your SP account is not linked yet.", 403, access.context);
      query = query.eq("sp_id", access.linkedSpId);
    }

    const { data, error } = await query;
    if (error) throw error;
    const records = (data || []) as Record<string, unknown>[];
    const spRows = access.isManager ? await loadSpDirectory(access.db, records.map((record) => asText(record.sp_id))) : [];
    return safeJson({ ok: true, records: access.isManager ? withSpDirectoryRows(records, spRows) : records }, undefined, access.context);
  } catch (error) {
    logShiftRouteFailure("api/events/[id]/sp-attendance GET", error, { eventId, userEmail: access.context.user?.email });
    return safeErrorJson("server_error", "Could not load SP attendance.", 500, access.context, getSupabaseError(error));
  }
}

async function upsertAttendance(request: Request, context: { params: Promise<{ id?: string | string[] }> }) {
  const params = await context.params;
  const eventId = getRouteId(params);
  if (!eventId) return safeErrorJson("bad_request", "Missing event id.", 400);

  const access = await resolveShiftRouteAccess(eventId);
  if (access instanceof NextResponse) return access;
  if (!access.isManager) return safeErrorJson("forbidden", "Only admins and Sim Ops can update SP attendance.", 403, access.context);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return safeErrorJson("bad_request", "JSON body is required.", 400, access.context);
  const spId = asText(body.spId || body.sp_id);
  const status = normalizeAttendanceStatus(body.status);
  const checkInMethod = normalizeSpPortalCheckInMethod(body.checkInMethod || body.check_in_method);
  const manualOverride = asText(body.manualOverride || body.manual_override);
  if (!spId) return safeErrorJson("bad_request", "spId is required.", 400, access.context);
  if (!status) return safeErrorJson("bad_request", "Unsupported SP attendance status.", 400, access.context);

  try {
    const { data: existing, error: existingError } = await access.db
      .from("event_sp_attendance")
      .select(SP_ATTENDANCE_SELECT)
      .eq("event_id", eventId)
      .eq("sp_id", spId)
      .maybeSingle();
    if (existingError) throw existingError;

    const now = new Date().toISOString();
    const existingRow = (existing as Record<string, unknown> | null) || null;
    const notesProvided = Object.prototype.hasOwnProperty.call(body, "notes");
    const baseNotes = notesProvided ? asText(body.notes) : asText(existingRow?.notes);
    const nextCheckedInAt =
      status === "checked_in"
        ? asText(existingRow?.checked_in_at) || now
        : status === "not_arrived" || status === "no_show" || status === "excused"
          ? ""
          : asText(existingRow?.checked_in_at);
    const nextNotes = checkInMethod
      ? upsertSpPortalCheckInMetadata(baseNotes, {
          checkInMethod,
          locationVerified: checkInMethod === "location_verified",
          checkedInAt: nextCheckedInAt || null,
          updatedAt: now,
          failureReason: "",
          manualOverride: manualOverride || (checkInMethod === "manual" ? (status === "checked_in" ? "checked_in" : "not_checked_in") : ""),
        })
      : baseNotes;
    const payload: Record<string, unknown> = {
      event_id: eventId,
      sp_id: spId,
      status,
      notes: nextNotes || null,
      updated_at: now,
    };
    if (status === "checked_in" && !asText(existingRow?.checked_in_at)) {
      payload.checked_in_at = nextCheckedInAt || now;
      payload.checked_in_by = access.context.user?.id || null;
    }
    if (status === "not_arrived" || status === "no_show" || status === "excused") {
      payload.checked_in_at = null;
      payload.checked_in_by = null;
      if (status === "not_arrived") {
        payload.checked_out_at = null;
        payload.checked_out_by = null;
      }
    }
    if (status === "checked_out" && !asText(existingRow?.checked_out_at)) {
      payload.checked_out_at = now;
      payload.checked_out_by = access.context.user?.id || null;
    }
    if (!existing) payload.created_at = now;

    const { data, error } = await access.db
      .from("event_sp_attendance")
      .upsert(payload, { onConflict: "event_id,sp_id" })
      .select(SP_ATTENDANCE_SELECT)
      .single();
    if (error) throw error;

    const assignmentUpdate =
      status === "checked_in"
        ? {
            event_checked_in_at: asText((data as Record<string, unknown>).checked_in_at) || now,
            event_attendance_status: "arrived",
            attendance_note: checkInMethod === "manual" ? "Manual portal check-in override." : "SP checked in.",
          }
        : status === "not_arrived"
          ? {
              event_checked_in_at: null,
              event_attendance_status: "expected",
              attendance_note: checkInMethod === "manual" ? "Manual portal check-in cleared." : null,
            }
          : null;
    if (assignmentUpdate) {
      await access.db
        .from("event_sps")
        .update(assignmentUpdate)
        .eq("event_id", eventId)
        .eq("sp_id", spId);
    }
    return safeJson({ ok: true, record: data }, undefined, access.context);
  } catch (error) {
    logShiftRouteFailure("api/events/[id]/sp-attendance write", error, {
      eventId,
      spId,
      userEmail: access.context.user?.email,
      role: access.context.legacyRole,
      payloadKeys: Object.keys(body).sort(),
    });
    return safeErrorJson("server_error", "Could not save SP attendance.", 500, access.context, getSupabaseError(error));
  }
}

export async function POST(request: Request, context: { params: Promise<{ id?: string | string[] }> }) {
  return upsertAttendance(request, context);
}

export async function PATCH(request: Request, context: { params: Promise<{ id?: string | string[] }> }) {
  return upsertAttendance(request, context);
}

import { NextResponse } from "next/server";
import {
  getRouteId,
  getSupabaseError,
  logShiftRouteFailure,
  safeErrorJson,
  safeJson,
  resolveShiftRouteAccess,
} from "../../../../lib/spShiftFoundation";
import {
  normalizeSpPortalAcknowledgmentKey,
  parseSpPortalAcknowledgments,
  upsertSpPortalAcknowledgment,
  type SpPortalAcknowledgmentKey,
} from "../../../../lib/spPortalAcknowledgments";
import { parseTrainingEventMetadata } from "../../../../lib/trainingEventNotes";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function isYesLike(value: unknown) {
  const text = asText(value).toLowerCase();
  return text === "yes" || text === "true" || text === "1" || text === "enabled" || text === "released" || text === "ready";
}

function isAcknowledgmentReleased(
  key: SpPortalAcknowledgmentKey,
  metadata: ReturnType<typeof parseTrainingEventMetadata>,
  assignment: Record<string, unknown>
) {
  if (key === "event_details") return true;
  if (key === "schedule") return isYesLike(metadata.schedule_preview_enabled_for_sps);
  if (key === "role_case") return isYesLike(metadata.sp_portal_release_role_case) && Boolean(asText(assignment.role_name) || asText(metadata.case_name) || asText(metadata.sp_portal_role_case_note));
  if (key === "training") return isYesLike(metadata.sp_portal_release_training_details);
  if (key === "materials") return isYesLike(metadata.sp_portal_release_case_files) || isYesLike(metadata.sp_portal_release_training_materials);
  if (key === "arrival") return isYesLike(metadata.sp_portal_release_arrival_instructions);
  return false;
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
  const key = normalizeSpPortalAcknowledgmentKey(body.key);
  const checked = body.checked === true;
  if (!assignmentId) return safeErrorJson("bad_request", "assignmentId is required.", 400, access.context);
  if (!key) return safeErrorJson("bad_request", "Unsupported acknowledgment item.", 400, access.context);

  try {
    const eventOrgId = asText(access.event.organization_id);
    const activeOrgId = asText(access.context.activeOrganization?.id);
    if (eventOrgId && activeOrgId && eventOrgId !== activeOrgId && !access.context.isPlatformOwner) {
      return safeErrorJson("forbidden", "This event belongs to a different organization.", 403, access.context);
    }

    const { data: assignment, error: assignmentError } = await access.db
      .from("event_sps")
      .select("id,event_id,sp_id,organization_id,status,assignment_status,confirmed,notes")
      .eq("id", assignmentId)
      .eq("event_id", eventId)
      .eq("sp_id", access.linkedSpId)
      .maybeSingle();
    if (assignmentError) throw assignmentError;
    if (!assignment) {
      return safeErrorJson("not_found", "Confirmed assignment was not found for this SP.", 404, access.context);
    }

    const assignmentOrgId = asText((assignment as Record<string, unknown>).organization_id);
    if (eventOrgId && assignmentOrgId && eventOrgId !== assignmentOrgId) {
      return safeErrorJson("forbidden", "This assignment belongs to a different organization.", 403, access.context);
    }
    const assignmentStatus = asText((assignment as Record<string, unknown>).status || (assignment as Record<string, unknown>).assignment_status).toLowerCase();
    const assignmentConfirmed = (assignment as Record<string, unknown>).confirmed === true;
    if (
      !assignmentConfirmed &&
      !["confirmed", "scheduled", "assigned", "backup", "confirmed_primary", "confirmed_backup"].includes(assignmentStatus)
    ) {
      return safeErrorJson("forbidden", "Only confirmed or scheduled assignments can be acknowledged.", 403, access.context);
    }

    const { data: eventRow, error: eventNotesError } = await access.db
      .from("events")
      .select("notes")
      .eq("id", eventId)
      .maybeSingle();
    if (eventNotesError) throw eventNotesError;
    const metadata = parseTrainingEventMetadata(asText((eventRow as Record<string, unknown> | null)?.notes));
    if (!isAcknowledgmentReleased(key, metadata, assignment as Record<string, unknown>)) {
      return safeErrorJson("forbidden", "That SP portal item is not released for this event.", 403, access.context);
    }

    const now = new Date().toISOString();
    const notes = asText((assignment as Record<string, unknown>).notes);
    const nextNotes = upsertSpPortalAcknowledgment(notes, key, checked, now);
    const { data: saved, error: saveError } = await access.db
      .from("event_sps")
      .update({ notes: nextNotes })
      .eq("id", assignmentId)
      .eq("event_id", eventId)
      .eq("sp_id", access.linkedSpId)
      .select("id,notes")
      .maybeSingle();
    if (saveError) throw saveError;

    return safeJson(
      {
        ok: true,
        assignmentId,
        acknowledgments: parseSpPortalAcknowledgments(asText((saved as Record<string, unknown> | null)?.notes) || nextNotes),
      },
      undefined,
      access.context
    );
  } catch (error) {
    logShiftRouteFailure("api/events/[id]/sp-portal-acknowledgments POST", error, {
      eventId,
      assignmentId,
      acknowledgmentKey: key,
      userEmail: access.context.user?.email,
    });
    return safeErrorJson("server_error", "Could not save SP portal acknowledgment.", 500, access.context, getSupabaseError(error));
  }
}

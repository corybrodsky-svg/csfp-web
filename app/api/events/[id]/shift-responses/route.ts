import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getRouteId,
  getSupabaseError,
  loadSpDirectory,
  logShiftRouteFailure,
  normalizeShiftResponse,
  normalizeShiftSource,
  resolveShiftRouteAccess,
  safeErrorJson,
  safeJson,
  SHIFT_RESPONSE_SELECT,
  withSpDirectoryRows,
} from "../../../../lib/spShiftFoundation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

async function assertOpeningBelongsToEvent(db: SupabaseClient, eventId: string, openingId: string) {
  const { data, error } = await db
    .from("event_shift_openings")
    .select("id,event_id,status,visibility")
    .eq("event_id", eventId)
    .eq("id", openingId)
    .maybeSingle();
  if (error) throw error;
  return data as Record<string, unknown> | null;
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
      .from("event_shift_responses")
      .select(SHIFT_RESPONSE_SELECT)
      .eq("event_id", eventId)
      .order("updated_at", { ascending: false });

    if (!access.isManager) {
      if (!access.linkedSpId) return safeErrorJson("forbidden", "Your SP account is not linked yet.", 403, access.context);
      query = query.eq("sp_id", access.linkedSpId);
    }

    const { data, error } = await query;
    if (error) throw error;

    const responses = (data || []) as Record<string, unknown>[];
    const spRows = access.isManager ? await loadSpDirectory(access.db, responses.map((response) => asText(response.sp_id))) : [];
    return safeJson(
      { ok: true, responses: access.isManager ? withSpDirectoryRows(responses, spRows) : responses },
      undefined,
      access.context
    );
  } catch (error) {
    logShiftRouteFailure("api/events/[id]/shift-responses GET", error, { eventId, userEmail: access.context.user?.email });
    return safeErrorJson("server_error", "Could not load SP shift responses.", 500, access.context, getSupabaseError(error));
  }
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

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return safeErrorJson("bad_request", "JSON body is required.", 400, access.context);
  const openingId = asText(body.openingId || body.opening_id);
  const response = normalizeShiftResponse(body.response);
  if (!openingId) return safeErrorJson("bad_request", "openingId is required.", 400, access.context);
  if (!response) return safeErrorJson("bad_request", "Response must be no_response, available, maybe, declined, accepted, or withdrawn.", 400, access.context);

  const spId = access.isManager ? asText(body.spId || body.sp_id || access.linkedSpId) : access.linkedSpId;
  if (!spId) return safeErrorJson("forbidden", "A linked SP record is required to save this response.", 403, access.context);
  if (!access.isManager && asText(body.spId || body.sp_id) && asText(body.spId || body.sp_id) !== spId) {
    return safeErrorJson("forbidden", "SP users cannot submit responses for another SP.", 403, access.context);
  }

  try {
    const opening = await assertOpeningBelongsToEvent(access.db, eventId, openingId);
    if (!opening) return safeErrorJson("not_found", "Shift opening was not found.", 404, access.context, { openingId });
    if (!access.isManager && asText(opening.status) !== "open") {
      return safeErrorJson("forbidden", "This shift opening is no longer open.", 403, access.context, { openingId });
    }

    const now = new Date().toISOString();
    const payload = {
      event_id: eventId,
      opening_id: openingId,
      sp_id: spId,
      response,
      source: normalizeShiftSource(body.source, access.isManager ? "manual" : "portal"),
      message: asText(body.message) || null,
      responded_at: now,
      updated_at: now,
    };

    const { data, error } = await access.db
      .from("event_shift_responses")
      .upsert(payload, { onConflict: "opening_id,sp_id" })
      .select(SHIFT_RESPONSE_SELECT)
      .single();
    if (error) throw error;
    return safeJson({ ok: true, response: data }, undefined, access.context);
  } catch (error) {
    logShiftRouteFailure("api/events/[id]/shift-responses POST", error, {
      eventId,
      openingId,
      userEmail: access.context.user?.email,
      role: access.context.legacyRole,
      payloadKeys: Object.keys(body).sort(),
    });
    return safeErrorJson("server_error", "Could not save SP shift response.", 500, access.context, getSupabaseError(error));
  }
}

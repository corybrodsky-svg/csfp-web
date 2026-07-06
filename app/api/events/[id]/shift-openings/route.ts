import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getRouteId,
  getSupabaseError,
  logShiftRouteFailure,
  normalizeOpeningStatus,
  normalizeOpeningVisibility,
  normalizeShiftSource,
  PORTAL_VISIBILITIES,
  resolveShiftRouteAccess,
  safeErrorJson,
  safeJson,
  SHIFT_OPENING_SELECT,
} from "../../../../lib/spShiftFoundation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function asPositiveInteger(value: unknown, fallback: number) {
  const parsed = Number.parseInt(asText(value), 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : fallback;
}

function parseStringList(value: unknown) {
  const source = Array.isArray(value) ? value : asText(value).split(",");
  return Array.from(new Set(source.map((item) => asText(item)).filter(Boolean)));
}

function editableOpeningPayload(body: Record<string, unknown>, eventId: string, organizationId: string | null, partial = false) {
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  const setText = (sourceKey: string, column = sourceKey) => {
    if (!partial || Object.prototype.hasOwnProperty.call(body, sourceKey)) {
      payload[column] = asText(body[sourceKey]) || null;
    }
  };

  if (!partial || Object.prototype.hasOwnProperty.call(body, "title")) {
    payload.title = asText(body.title) || "Standardized Patient Shift";
  }
  setText("shift_date");
  setText("start_time");
  setText("end_time");
  setText("location");
  setText("room");
  setText("requirements");
  setText("notes");
  if (!partial || Object.prototype.hasOwnProperty.call(body, "status")) payload.status = normalizeOpeningStatus(body.status);
  if (!partial || Object.prototype.hasOwnProperty.call(body, "visibility")) payload.visibility = normalizeOpeningVisibility(body.visibility);
  if (!partial || Object.prototype.hasOwnProperty.call(body, "needed_count")) {
    payload.needed_count = asPositiveInteger(body.needed_count, 1);
  }
  if (!partial) {
    payload.event_id = eventId;
    payload.organization_id = organizationId;
    payload.created_at = new Date().toISOString();
  }

  return payload;
}

async function loadResponseCounts(db: SupabaseClient, openingIds: string[]) {
  if (!openingIds.length) return new Map<string, Record<string, number>>();
  const { data, error } = await db
    .from("event_shift_responses")
    .select("opening_id,response")
    .in("opening_id", openingIds);
  if (error) throw error;

  const counts = new Map<string, Record<string, number>>();
  (data || []).forEach((row) => {
    const openingId = asText((row as Record<string, unknown>).opening_id);
    const response = asText((row as Record<string, unknown>).response).toLowerCase();
    if (!openingId) return;
    const current = counts.get(openingId) || { no_response: 0, available: 0, accepted: 0, maybe: 0, declined: 0, withdrawn: 0 };
    if (Object.prototype.hasOwnProperty.call(current, response)) current[response] += 1;
    counts.set(openingId, current);
  });
  return counts;
}

async function createOpeningOutreachRecipients(
  db: SupabaseClient,
  eventId: string,
  openingId: string,
  spIds: string[],
  sourceValue: unknown
) {
  const uniqueSpIds = parseStringList(spIds);
  if (!uniqueSpIds.length) {
    return { contactedCount: 0, createdCount: 0, existingCount: 0 };
  }

  const { data: existingRows, error: existingError } = await db
    .from("event_shift_responses")
    .select("sp_id")
    .eq("opening_id", openingId)
    .in("sp_id", uniqueSpIds);
  if (existingError) throw existingError;

  const existingSpIds = new Set((existingRows || []).map((row) => asText((row as Record<string, unknown>).sp_id)).filter(Boolean));
  const missingSpIds = uniqueSpIds.filter((spId) => !existingSpIds.has(spId));
  if (!missingSpIds.length) {
    return { contactedCount: uniqueSpIds.length, createdCount: 0, existingCount: existingSpIds.size };
  }

  const now = new Date().toISOString();
  const source = normalizeShiftSource(sourceValue, "email");
  const { error } = await db
    .from("event_shift_responses")
    .insert(
      missingSpIds.map((spId) => ({
        event_id: eventId,
        opening_id: openingId,
        sp_id: spId,
        response: "no_response",
        source,
        message: "CFSP Portal + Email outreach recorded. Test-safe mode: email would be sent manually or by configured email service.",
        responded_at: null,
        created_at: now,
        updated_at: now,
      }))
    );
  if (error) throw error;

  return {
    contactedCount: uniqueSpIds.length,
    createdCount: missingSpIds.length,
    existingCount: existingSpIds.size,
  };
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
      .from("event_shift_openings")
      .select(SHIFT_OPENING_SELECT)
      .eq("event_id", eventId)
      .order("shift_date", { ascending: true })
      .order("start_time", { ascending: true });

    if (!access.isManager) {
      query = query.eq("status", "open").in("visibility", Array.from(PORTAL_VISIBILITIES));
    }

    const { data, error } = await query;
    if (error) throw error;

    const openings = ((data || []) as Record<string, unknown>[]);
    const counts = await loadResponseCounts(access.db, openings.map((opening) => asText(opening.id)).filter(Boolean));
    const withCounts = openings.map((opening) => ({
      ...opening,
      response_counts: counts.get(asText(opening.id)) || { no_response: 0, available: 0, accepted: 0, maybe: 0, declined: 0, withdrawn: 0 },
    }));

    return safeJson({ ok: true, openings: withCounts }, undefined, access.context);
  } catch (error) {
    logShiftRouteFailure("api/events/[id]/shift-openings GET", error, { eventId, userEmail: access.context.user?.email });
    return safeErrorJson("server_error", "Could not load SP shift openings.", 500, access.context, getSupabaseError(error));
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
  if (!access.isManager) return safeErrorJson("forbidden", "Only admins and Sim Ops can create SP shift openings.", 403, access.context);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return safeErrorJson("bad_request", "JSON body is required.", 400, access.context);
  const neededCount = asPositiveInteger(body.needed_count, 0);
  if (neededCount < 1) return safeErrorJson("bad_request", "needed_count must be at least 1.", 400, access.context);
  const missingFields = [
    !asText(body.shift_date) ? "shift_date" : "",
    !asText(body.start_time) ? "start_time" : "",
    !asText(body.end_time) ? "end_time" : "",
  ].filter(Boolean);
  if (missingFields.length) {
    return safeErrorJson(
      "bad_request",
      `Shift opening requires ${missingFields.join(", ")}.`,
      400,
      access.context,
      { missingFields }
    );
  }

  try {
    const organizationId = asText(access.event.organization_id) || null;
    const { data, error } = await access.db
      .from("event_shift_openings")
      .insert(editableOpeningPayload(body, eventId, organizationId))
      .select(SHIFT_OPENING_SELECT)
      .single();
    if (error) throw error;
    const openingId = asText((data as Record<string, unknown>)?.id);
    const contactedSpIds = parseStringList(body.contactedSpIds || body.contacted_sp_ids || body.cfspSelectedSpIds || body.cfsp_selected_sp_ids);
    const outreach = openingId
      ? await createOpeningOutreachRecipients(
          access.db,
          eventId,
          openingId,
          contactedSpIds,
          body.outreachSource || body.outreach_source || "email"
        )
      : { contactedCount: 0, createdCount: 0, existingCount: 0 };
    return safeJson({ ok: true, opening: data, outreach }, { status: 201 }, access.context);
  } catch (error) {
    logShiftRouteFailure("api/events/[id]/shift-openings POST", error, {
      eventId,
      userEmail: access.context.user?.email,
      payloadKeys: Object.keys(body).sort(),
    });
    return safeErrorJson("server_error", "Could not create SP shift opening.", 500, access.context, getSupabaseError(error));
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id?: string | string[] }> }
) {
  const params = await context.params;
  const eventId = getRouteId(params);
  if (!eventId) return safeErrorJson("bad_request", "Missing event id.", 400);

  const access = await resolveShiftRouteAccess(eventId);
  if (access instanceof NextResponse) return access;
  if (!access.isManager) return safeErrorJson("forbidden", "Only admins and Sim Ops can update SP shift openings.", 403, access.context);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const openingId = asText(body?.openingId || body?.opening_id || body?.id);
  if (!openingId) return safeErrorJson("bad_request", "openingId is required.", 400, access.context);

  try {
    const { data, error } = await access.db
      .from("event_shift_openings")
      .update(editableOpeningPayload(body || {}, eventId, null, true))
      .eq("event_id", eventId)
      .eq("id", openingId)
      .select(SHIFT_OPENING_SELECT)
      .single();
    if (error) throw error;
    return safeJson({ ok: true, opening: data }, undefined, access.context);
  } catch (error) {
    logShiftRouteFailure("api/events/[id]/shift-openings PATCH", error, { eventId, openingId, userEmail: access.context.user?.email });
    return safeErrorJson("server_error", "Could not update SP shift opening.", 500, access.context, getSupabaseError(error));
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id?: string | string[] }> }
) {
  const params = await context.params;
  const eventId = getRouteId(params);
  if (!eventId) return safeErrorJson("bad_request", "Missing event id.", 400);

  const access = await resolveShiftRouteAccess(eventId);
  if (access instanceof NextResponse) return access;
  if (!access.isManager) return safeErrorJson("forbidden", "Only admins and Sim Ops can close SP shift openings.", 403, access.context);

  const url = new URL(request.url);
  const body = request.method === "DELETE" ? ((await request.json().catch(() => null)) as Record<string, unknown> | null) : null;
  const openingId = asText(url.searchParams.get("openingId") || body?.openingId || body?.opening_id || body?.id);
  if (!openingId) return safeErrorJson("bad_request", "openingId is required.", 400, access.context);

  try {
    const { data, error } = await access.db
      .from("event_shift_openings")
      .update({ status: "closed", updated_at: new Date().toISOString() })
      .eq("event_id", eventId)
      .eq("id", openingId)
      .select(SHIFT_OPENING_SELECT)
      .single();
    if (error) throw error;
    return safeJson({ ok: true, opening: data }, undefined, access.context);
  } catch (error) {
    logShiftRouteFailure("api/events/[id]/shift-openings DELETE", error, { eventId, openingId, userEmail: access.context.user?.email });
    return safeErrorJson("server_error", "Could not close SP shift opening.", 500, access.context, getSupabaseError(error));
  }
}

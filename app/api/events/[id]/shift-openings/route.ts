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
import {
  getOpenShiftOfferIdentity,
} from "../../../../lib/spOpenShiftOffers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ShiftOpeningCreateStage =
  | "select_existing_opening"
  | "update_existing_opening"
  | "insert_opening"
  | "select_existing_recipients"
  | "insert_outreach_recipients";

class ShiftOpeningCreateError extends Error {
  stage: ShiftOpeningCreateStage;
  table: "event_shift_openings" | "event_shift_responses";
  cause: unknown;

  constructor(stage: ShiftOpeningCreateStage, table: "event_shift_openings" | "event_shift_responses", cause: unknown) {
    super(`Could not create CFSP open shift offers at ${stage}.`);
    this.name = "ShiftOpeningCreateError";
    this.stage = stage;
    this.table = table;
    this.cause = cause;
  }
}

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

function getMissingOptionalColumn(error: unknown, optionalColumns: string[]) {
  const supabaseError = getSupabaseError(error);
  const text = [supabaseError.message, supabaseError.details, supabaseError.hint].join(" ").toLowerCase();
  if (supabaseError.code !== "PGRST204" && supabaseError.code !== "42703") return "";
  return optionalColumns.find((column) => text.includes(column.toLowerCase())) || "";
}

type InsertPayload = Record<string, unknown> | Record<string, unknown>[];

function stripColumnFromPayload(payload: InsertPayload, column: string): InsertPayload {
  if (Array.isArray(payload)) {
    return payload.map((row) => {
      const next = { ...row };
      delete next[column];
      return next;
    });
  }
  const next = { ...payload };
  delete next[column];
  return next;
}

async function insertWithOptionalColumnFallback({
  db,
  table,
  payload,
  optionalColumns,
  select,
  single = false,
}: {
  db: SupabaseClient;
  table: "event_shift_openings" | "event_shift_responses";
  payload: InsertPayload;
  optionalColumns: string[];
  select?: string;
  single?: boolean;
}) {
  let nextPayload = payload;
  const remainingOptionalColumns = new Set(optionalColumns);

  for (;;) {
    let query: any = db.from(table).insert(nextPayload as any);
    if (select) query = query.select(select);
    const result = single ? await query.single() : await query;
    if (!result.error) return result;

    const missingColumn = getMissingOptionalColumn(result.error, Array.from(remainingOptionalColumns));
    if (!missingColumn) return result;
    remainingOptionalColumns.delete(missingColumn);
    nextPayload = stripColumnFromPayload(nextPayload, missingColumn);
  }
}

async function updateOpeningWithOptionalColumnFallback({
  db,
  openingId,
  eventId,
  payload,
  optionalColumns,
}: {
  db: SupabaseClient;
  openingId: string;
  eventId: string;
  payload: Record<string, unknown>;
  optionalColumns: string[];
}) {
  let nextPayload = payload;
  const remainingOptionalColumns = new Set(optionalColumns);

  for (;;) {
    const result = await db
      .from("event_shift_openings")
      .update(nextPayload as any)
      .eq("event_id", eventId)
      .eq("id", openingId)
      .select(SHIFT_OPENING_SELECT)
      .single();
    if (!result.error) return result;

    const missingColumn = getMissingOptionalColumn(result.error, Array.from(remainingOptionalColumns));
    if (!missingColumn) return result;
    remainingOptionalColumns.delete(missingColumn);
    nextPayload = stripColumnFromPayload(nextPayload, missingColumn) as Record<string, unknown>;
  }
}

export function editableOpeningPayload(
  body: Record<string, unknown>,
  eventId: string,
  organizationId: string | null,
  partial = false,
  userId: string | null = null
) {
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
    const selectedCount = Math.max(
      asPositiveInteger(body.selected_count, 0),
      parseStringList(body.contactedSpIds || body.contacted_sp_ids || body.cfspSelectedSpIds || body.cfsp_selected_sp_ids).length
    );
    payload.event_id = eventId;
    payload.organization_id = organizationId;
    payload.created_by = userId;
    payload.selected_count = selectedCount;
    payload.created_at = new Date().toISOString();
  }

  return payload;
}

export function openingUpdatePayloadFromCreatePayload(payload: Record<string, unknown>) {
  const next = { ...payload };
  delete next.event_id;
  delete next.organization_id;
  delete next.created_by;
  delete next.created_at;
  next.updated_at = new Date().toISOString();
  return next;
}

function getOpeningIdentityInputFromRecord(record: Record<string, unknown>) {
  return {
    event_id: record.event_id,
    organization_id: record.organization_id,
    shift_date: record.shift_date,
    start_time: record.start_time,
    end_time: record.end_time,
    location: record.location,
    room: record.room,
    status: record.status,
    visibility: record.visibility,
    notes: record.notes,
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

export function getOpeningIdentityForPayload(payload: Record<string, unknown>) {
  return getOpenShiftOfferIdentity({
    ...getOpeningIdentityInputFromRecord(payload),
    outreachStatus: "active",
  });
}

async function findExistingOpeningForCreatePayload(
  db: SupabaseClient,
  eventId: string,
  organizationId: string | null,
  payload: Record<string, unknown>
) {
  const targetIdentity = getOpeningIdentityForPayload(payload);
  let query = db
    .from("event_shift_openings")
    .select(SHIFT_OPENING_SELECT)
    .eq("event_id", eventId)
    .eq("shift_date", asText(payload.shift_date));

  if (organizationId) query = query.eq("organization_id", organizationId);

  const { data, error } = await query;
  if (error) throw new ShiftOpeningCreateError("select_existing_opening", "event_shift_openings", error);

  return ((data || []) as Record<string, unknown>[]).find(
    (row) => getOpeningIdentityForPayload(row) === targetIdentity
  ) || null;
}

export function buildOpeningOutreachRecipientPayloads({
  eventId,
  openingId,
  spIds,
  organizationId,
  userId,
  sourceValue,
  now = new Date().toISOString(),
}: {
  eventId: string;
  openingId: string;
  spIds: string[];
  organizationId: string | null;
  userId: string | null;
  sourceValue: unknown;
  now?: string;
}) {
  const source = normalizeShiftSource(sourceValue, "email");
  return spIds.map((spId) => ({
    event_id: eventId,
    opening_id: openingId,
    sp_id: spId,
    organization_id: organizationId,
    created_by: userId,
    response: "no_response",
    source,
    message: "CFSP Portal + Email outreach recorded. Test-safe mode: email would be sent manually or by configured email service.",
    responded_at: null,
    created_at: now,
    updated_at: now,
  }));
}

export function getCreateErrorDiagnostics(
  error: unknown,
  fallbackStage: ShiftOpeningCreateStage,
  fallbackTable: "event_shift_openings" | "event_shift_responses",
  extra: Record<string, unknown> = {}
) {
  const stage = error instanceof ShiftOpeningCreateError ? error.stage : fallbackStage;
  const table = error instanceof ShiftOpeningCreateError ? error.table : fallbackTable;
  const source = error instanceof ShiftOpeningCreateError ? error.cause : error;
  const supabaseError = getSupabaseError(source);
  return {
    operation: stage,
    table,
    supabase: supabaseError,
    ...extra,
  };
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
  sourceValue: unknown,
  organizationId: string | null,
  userId: string | null
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
  if (existingError) throw new ShiftOpeningCreateError("select_existing_recipients", "event_shift_responses", existingError);

  const existingSpIds = new Set((existingRows || []).map((row) => asText((row as Record<string, unknown>).sp_id)).filter(Boolean));
  const missingSpIds = uniqueSpIds.filter((spId) => !existingSpIds.has(spId));
  if (!missingSpIds.length) {
    return { contactedCount: uniqueSpIds.length, createdCount: 0, existingCount: existingSpIds.size };
  }

  const now = new Date().toISOString();
  const { error } = await insertWithOptionalColumnFallback({
    db,
    table: "event_shift_responses",
    payload: buildOpeningOutreachRecipientPayloads({ eventId, openingId, spIds: missingSpIds, organizationId, userId, sourceValue, now }),
    optionalColumns: ["created_by", "organization_id"],
  });
  if (error) throw new ShiftOpeningCreateError("insert_outreach_recipients", "event_shift_responses", error);

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
  const contactedSpIds = parseStringList(body.contactedSpIds || body.contacted_sp_ids || body.cfspSelectedSpIds || body.cfsp_selected_sp_ids);
  const contactedEmails = parseStringList(body.contactedEmails || body.contacted_emails || body.selectedEmails || body.selected_emails);
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
    const createdBy = asText(access.context.user?.id) || null;
    const openingPayload = editableOpeningPayload(body, eventId, organizationId, false, createdBy);
    const existingOpening = await findExistingOpeningForCreatePayload(access.db, eventId, organizationId, openingPayload);
    const existingOpeningId = asText(existingOpening?.id);
    let data: unknown = null;
    let action: "created" | "updated_existing" = "created";

    if (existingOpeningId) {
      const { data: updatedOpening, error } = await updateOpeningWithOptionalColumnFallback({
        db: access.db,
        openingId: existingOpeningId,
        eventId,
        payload: openingUpdatePayloadFromCreatePayload(openingPayload),
        optionalColumns: ["selected_count"],
      });
      if (error) throw new ShiftOpeningCreateError("update_existing_opening", "event_shift_openings", error);
      data = updatedOpening;
      action = "updated_existing";
    } else {
      const { data: insertedOpening, error } = await insertWithOptionalColumnFallback({
        db: access.db,
        table: "event_shift_openings",
        payload: openingPayload,
        optionalColumns: ["created_by", "selected_count"],
        select: SHIFT_OPENING_SELECT,
        single: true,
      });
      if (error) throw new ShiftOpeningCreateError("insert_opening", "event_shift_openings", error);
      data = insertedOpening;
    }

    const openingId = asText((data as Record<string, unknown> | null)?.id);
    if (!openingId) {
      throw new ShiftOpeningCreateError(
        action === "updated_existing" ? "update_existing_opening" : "insert_opening",
        "event_shift_openings",
        new Error("event_shift_openings save returned no opening id.")
      );
    }
    const outreach = openingId
      ? await createOpeningOutreachRecipients(
          access.db,
          eventId,
          openingId,
          contactedSpIds,
          body.outreachSource || body.outreach_source || "email",
          organizationId,
          createdBy
        )
      : { contactedCount: 0, createdCount: 0, existingCount: 0 };
    return safeJson(
      {
        ok: true,
        model: "one_event_shift_opening_with_recipient_rows",
        action,
        idempotent: action === "updated_existing",
        opening: data,
        outreach: {
          ...outreach,
          selectedSpCount: contactedSpIds.length,
          selectedEmailCount: contactedEmails.length,
        },
        diagnostics: {
          eventId,
          organizationId,
          createdByPresent: Boolean(createdBy),
          neededCount,
          selectedSpCount: contactedSpIds.length,
          selectedEmailCount: contactedEmails.length,
          rlsMode: access.usesAdminClient ? "service_role" : "user_scoped_rls",
        },
      },
      { status: action === "updated_existing" ? 200 : 201 },
      access.context
    );
  } catch (error) {
    const diagnostics = getCreateErrorDiagnostics(error, "insert_opening", "event_shift_openings", {
      model: "one_event_shift_opening_with_recipient_rows",
      eventId,
      organizationId: asText(access.event.organization_id) || null,
      userId: asText(access.context.user?.id) || null,
      role: access.context.role || access.context.legacyRole || "",
      activeOrgId: asText(access.context.activeOrganization?.id) || null,
      neededCount,
      selectedSpCount: contactedSpIds.length,
      selectedEmailCount: contactedEmails.length,
      rlsMode: access.usesAdminClient ? "service_role" : "user_scoped_rls",
    });
    logShiftRouteFailure("api/events/[id]/shift-openings POST", error, {
      eventId,
      organizationId: asText(access.event.organization_id) || null,
      userId: asText(access.context.user?.id) || null,
      userEmail: access.context.user?.email,
      isManager: access.isManager,
      role: access.context.role || access.context.legacyRole || "",
      activeOrgId: asText(access.context.activeOrganization?.id) || null,
      rlsMode: access.usesAdminClient ? "service_role" : "user_scoped_rls",
      operation: diagnostics.operation,
      table: diagnostics.table,
      supabase: diagnostics.supabase,
      model: asText((diagnostics as Record<string, unknown>).model),
      neededCount,
      selectedSpCount: contactedSpIds.length,
      selectedEmailCount: contactedEmails.length,
      payloadKeys: Object.keys(body).sort(),
    });
    return safeErrorJson(
      "server_error",
      `Could not create CFSP open shift offers (${diagnostics.operation} on ${diagnostics.table}).`,
      500,
      access.context,
      diagnostics
    );
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

import { NextResponse } from "next/server";
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
import { createSupabaseAdminClient } from "../../../../lib/supabaseAdminClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function getRouteId(params: { id?: string | string[] }) {
  const raw = params.id;
  if (Array.isArray(raw)) return raw[0] || "";
  return typeof raw === "string" ? raw : "";
}

type SupabaseErrorLike = {
  message?: string | null;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
};

type LearnerAttendanceAccess = {
  context: OrganizationContext;
  db: ReturnType<typeof createSupabaseUserClient>;
  eventOrganizationId: string;
  writeOrganizationId: string;
};

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
  return safeJson({ ok: false, error, message, status }, { status }, context || null);
}

function logLearnerAttendanceFailure(stage: string, error: unknown, extra?: Record<string, unknown>) {
  console.error("[learner-attendance]", {
    stage,
    ...getSupabaseError(error),
    ...(extra || {}),
  });
}

async function resolveLearnerAttendanceAccess(eventId: string, options?: { requireOperator?: boolean }): Promise<LearnerAttendanceAccess | NextResponse> {
  const context = await getOrganizationContext();
  if (!context.user) return unauthorizedJson(context);
  if (!requireActiveOrganization(context)) return noActiveOrganizationJson(context);
  if (options?.requireOperator && !isOperatorContext(context)) {
    return safeErrorJson("forbidden", "Only Sim Ops or admin accounts can update learner attendance.", 403, context);
  }

  const admin = createSupabaseAdminClient();
  const db = admin || createSupabaseUserClient(context.accessToken);
  const activeOrganizationId = asText(context.activeOrganization?.id);
  const platformOwner = isPlatformOwnerContext(context);

  const runEventQuery = async (includeOrganizationColumn: boolean) => {
    let query = db
      .from("events")
      .select(includeOrganizationColumn ? "id,organization_id" : "id")
      .eq("id", eventId);

    if (includeOrganizationColumn && context.schemaAvailable && !platformOwner) {
      query = query.or(`organization_id.eq.${activeOrganizationId},organization_id.is.null`);
    }

    const result = await query.maybeSingle();
    return {
      data: result.data as { id?: string | null; organization_id?: string | null } | null,
      error: result.error,
    };
  };

  let eventResult = await runEventQuery(context.schemaAvailable);
  if (eventResult.error && context.schemaAvailable && isMissingOrganizationColumnError(eventResult.error)) {
    logLearnerAttendanceFailure("event-organization-column-fallback", eventResult.error, {
      eventId,
      userEmail: context.user.email,
    });
    eventResult = await runEventQuery(false);
  }

  if (eventResult.error) {
    logLearnerAttendanceFailure("event-load", eventResult.error, {
      eventId,
      userEmail: context.user.email,
      role: context.role,
      legacyRole: context.legacyRole,
      adminClientUsed: Boolean(admin),
    });
    return safeErrorJson("server_error", "Learner attendance could not be loaded.", 500, context);
  }

  if (!eventResult.data) {
    if (admin && context.schemaAvailable && !platformOwner) {
      const unscopedEventResult = await db
        .from("events")
        .select("id,organization_id")
        .eq("id", eventId)
        .maybeSingle();
      if (unscopedEventResult.error) {
        logLearnerAttendanceFailure("event-unscoped-access-check", unscopedEventResult.error, {
          eventId,
          userEmail: context.user.email,
        });
        return safeErrorJson("server_error", "Learner attendance could not be loaded.", 500, context);
      }
      if (unscopedEventResult.data) {
        return safeErrorJson("forbidden", "You do not have access to this event.", 403, context);
      }
    }
    return safeErrorJson("not_found", "Event was not found.", 404, context);
  }

  const eventOrganizationId = asText(eventResult.data.organization_id);
  const writeOrganizationId = eventOrganizationId || activeOrganizationId;
  return {
    context,
    db,
    eventOrganizationId,
    writeOrganizationId,
  };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id?: string | string[] }> }
) {
  const params = await context.params;
  const eventId = getRouteId(params);
  if (!eventId) return safeErrorJson("bad_request", "Missing event id.", 400);

  const access = await resolveLearnerAttendanceAccess(eventId);
  if (access instanceof NextResponse) return access;

  const { data, error } = await access.db
    .from("event_learner_attendance")
    .select("id,event_id,session_id,round_id,room,learner_name,learner_email,status,checked_in_at,note,created_at,updated_at")
    .eq("event_id", eventId)
    .order("learner_name", { ascending: true });

  if (error) {
    logLearnerAttendanceFailure("attendance-load", error, { eventId, userEmail: access.context.user?.email });
    return safeErrorJson("server_error", "Could not load learner attendance.", 500, access.context);
  }

  return safeJson({ ok: true, records: data || [] }, undefined, access.context);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id?: string | string[] }> }
) {
  const params = await context.params;
  const eventId = getRouteId(params);
  if (!eventId) return safeErrorJson("bad_request", "Missing event id.", 400);

  const access = await resolveLearnerAttendanceAccess(eventId, { requireOperator: true });
  if (access instanceof NextResponse) return access;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const learnerName = asText(body?.learner_name);
  if (!learnerName) {
    return safeErrorJson("bad_request", "Learner name is required.", 400, access.context);
  }

  const status = asText(body?.status) || "expected";
  const payload: Record<string, unknown> = {
    event_id: eventId,
    ...(access.writeOrganizationId ? { organization_id: access.writeOrganizationId } : {}),
    session_id: asText(body?.session_id) || null,
    round_id: asText(body?.round_id) || null,
    room: asText(body?.room) || null,
    learner_name: learnerName,
    learner_email: asText(body?.learner_email) || null,
    status,
    checked_in_at: status === "expected" ? null : asText(body?.checked_in_at) || new Date().toISOString(),
    note: asText(body?.note) || null,
    updated_at: new Date().toISOString(),
  };

  let existingQuery = access.db
    .from("event_learner_attendance")
    .select("id")
    .eq("event_id", eventId)
    .eq("learner_name", learnerName);
  existingQuery = payload.round_id ? existingQuery.eq("round_id", String(payload.round_id)) : existingQuery.is("round_id", null);
  existingQuery = payload.room ? existingQuery.eq("room", String(payload.room)) : existingQuery.is("room", null);

  const { data: existing, error: existingError } = await existingQuery.maybeSingle();
  if (existingError) {
    logLearnerAttendanceFailure("attendance-existing-load", existingError, {
      eventId,
      learnerName,
      userEmail: access.context.user?.email,
    });
    return safeErrorJson("server_error", "Could not load learner attendance.", 500, access.context);
  }

  const query = existing?.id
    ? access.db
        .from("event_learner_attendance")
        .update(payload)
        .eq("id", existing.id)
        .select("id,event_id,session_id,round_id,room,learner_name,learner_email,status,checked_in_at,note,created_at,updated_at")
        .single()
    : access.db
        .from("event_learner_attendance")
        .insert(payload)
        .select("id,event_id,session_id,round_id,room,learner_name,learner_email,status,checked_in_at,note,created_at,updated_at")
        .single();

  const { data, error } = await query;
  if (error) {
    logLearnerAttendanceFailure("attendance-save", error, {
      eventId,
      learnerName,
      userEmail: access.context.user?.email,
      role: access.context.role,
      legacyRole: access.context.legacyRole,
      eventOrganizationId: access.eventOrganizationId || null,
      writeOrganizationId: access.writeOrganizationId || null,
    });
    return safeErrorJson("server_error", "Could not update learner attendance.", 500, access.context);
  }

  return safeJson({ ok: true, record: data }, undefined, access.context);
}

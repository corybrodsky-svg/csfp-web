import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "../../../lib/supabaseAdminClient";
import { sanitizePublicErrorMessage } from "../../../lib/safeErrorMessage";
import { parseEventMetadata } from "../../../lib/eventMetadata";
import {
  applyOrganizationAuthCookies,
  forbiddenJson,
  getOrganizationContext,
  jsonNoStore,
  unauthorizedJson,
} from "../../../lib/organizationAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SupabaseErrorLike = {
  message?: string | null;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
};

type EventDebugRow = {
  id: string;
  name: string | null;
  status: string | null;
  date_text: string | null;
  organization_id?: string | null;
  notes: string | null;
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function exactError(error: unknown) {
  const source = (error || {}) as SupabaseErrorLike;
  return {
    message: sanitizePublicErrorMessage(source.message || error, "Event write debug query failed."),
    code: asText(source.code) || null,
    details: sanitizePublicErrorMessage(source.details || "", ""),
    hint: sanitizePublicErrorMessage(source.hint || "", ""),
  };
}

function canViewDebug(context: { role: string | null; legacyRole: string; isPlatformOwner: boolean }) {
  return Boolean(
    context.isPlatformOwner ||
      context.role === "platform_owner" ||
      context.role === "org_admin" ||
      context.legacyRole === "super_admin" ||
      context.legacyRole === "admin"
  );
}

function canWriteEvent(context: { role: string | null; legacyRole: string; isPlatformOwner: boolean }) {
  return Boolean(
    context.isPlatformOwner ||
      context.role === "platform_owner" ||
      context.role === "org_admin" ||
      context.role === "sim_ops" ||
      context.legacyRole === "super_admin" ||
      context.legacyRole === "admin" ||
      context.legacyRole === "sim_op"
  );
}

function parseLearners(raw: unknown) {
  const text = asText(raw);
  if (!text) return [] as string[];
  const candidates = [text];
  try {
    candidates.unshift(decodeURIComponent(text));
  } catch {
    // Already decoded.
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) return parsed.map(asText).filter(Boolean);
    } catch {
      // Continue.
    }
  }
  return text.split(/\r?\n|,/g).map(asText).filter(Boolean);
}

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext();
  if (!context.user) return unauthorizedJson(context);
  if (!canViewDebug(context)) return forbiddenJson("Only admins can view event write diagnostics.", context);

  const eventId = asText(request.nextUrl.searchParams.get("id"));
  if (!eventId) {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, error: "bad_request", message: "Missing event id." }, { status: 400 }),
      context
    );
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, error: "server_error", message: "Event write debug requires a Supabase service role." }, { status: 500 }),
      context
    );
  }

  const activeOrgId = asText(context.activeOrganization?.id) || null;
  const userEmail = asText(context.profile?.email) || asText(context.user.email) || null;
  const base = {
    eventId,
    userEmail,
    role: context.role,
    legacyRole: context.legacyRole,
    activeOrgId,
    canWriteEvent: canWriteEvent(context),
  };

  const scoped = await admin
    .from("events")
    .select("id,name,status,date_text,organization_id,notes")
    .eq("id", eventId)
    .or(`organization_id.eq.${activeOrgId},organization_id.is.null`)
    .maybeSingle()
    .returns<EventDebugRow>();
  if (scoped.error) {
    return applyOrganizationAuthCookies(jsonNoStore({ ok: false, ...base, exactError: exactError(scoped.error) }, { status: 500 }), context);
  }

  const legacyNull = await admin
    .from("events")
    .select("id,name,status,date_text,organization_id,notes")
    .eq("id", eventId)
    .is("organization_id", null)
    .maybeSingle()
    .returns<EventDebugRow>();
  if (legacyNull.error) {
    return applyOrganizationAuthCookies(jsonNoStore({ ok: false, ...base, exactError: exactError(legacyNull.error) }, { status: 500 }), context);
  }

  const allOrg = context.isPlatformOwner || context.role === "platform_owner" || context.legacyRole === "super_admin"
    ? await admin
        .from("events")
        .select("id,name,status,date_text,organization_id,notes")
        .eq("id", eventId)
        .maybeSingle()
        .returns<EventDebugRow>()
    : { data: null, error: null };
  if (allOrg.error) {
    return applyOrganizationAuthCookies(jsonNoStore({ ok: false, ...base, exactError: exactError(allOrg.error) }, { status: 500 }), context);
  }

  const event = scoped.data || legacyNull.data || allOrg.data || null;
  const eventSpsCount = await admin.from("event_sps").select("id", { count: "exact", head: true }).eq("event_id", eventId);
  const eventSessionsCount = await admin.from("event_sessions").select("id", { count: "exact", head: true }).eq("event_id", eventId);
  if (eventSpsCount.error) {
    return applyOrganizationAuthCookies(jsonNoStore({ ok: false, ...base, exactError: exactError(eventSpsCount.error) }, { status: 500 }), context);
  }
  if (eventSessionsCount.error) {
    return applyOrganizationAuthCookies(jsonNoStore({ ok: false, ...base, exactError: exactError(eventSessionsCount.error) }, { status: 500 }), context);
  }

  const metadata = parseEventMetadata(event?.notes).training;
  const learners = parseLearners(metadata.schedule_learner_roster);
  const hasSnapshot = Boolean(asText(metadata.schedule_builder_snapshot));
  const hasMetadataRoster = learners.length > 0;

  return applyOrganizationAuthCookies(
    jsonNoStore({
      ok: true,
      ...base,
      canReadEvent: Boolean(event),
      eventFoundByActiveOrg: Boolean(scoped.data && asText(scoped.data.organization_id) === activeOrgId),
      eventFoundByLegacyNullOrg: Boolean(legacyNull.data),
      eventFoundByAllOrgPlatformOwnerFallback: Boolean(allOrg.data),
      event_sps_count: eventSpsCount.count || 0,
      event_sessions_count: eventSessionsCount.count || 0,
      scheduleBuilderDraftStoredIn: hasSnapshot ? "event.notes.schedule_builder_snapshot" : hasMetadataRoster ? "event.notes.schedule_learner_roster" : "none",
      learnerListExists: hasMetadataRoster,
      learnerCount: learners.length,
      sampleLearnerNames: learners.slice(0, 8),
      event: event
        ? {
            id: event.id,
            name: event.name,
            status: event.status,
            date_text: event.date_text,
            organization_id: event.organization_id || null,
          }
        : null,
    }),
    context
  );
}

import { createSupabaseAdminClient } from "../../../lib/supabaseAdminClient";
import {
  applyOrganizationAuthCookies,
  forbiddenJson,
  getOrganizationContext,
  jsonNoStore,
  unauthorizedJson,
} from "../../../lib/organizationAuth";
import { sanitizePublicErrorMessage } from "../../../lib/safeErrorMessage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SupabaseErrorLike = {
  message?: string | null;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
};

type EventDebugSampleRow = {
  id: string;
  name: string | null;
  date_text: string | null;
  status: string | null;
  organization_id?: string | null;
  created_at: string | null;
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function canViewDashboardEventDebug(args: {
  role: string | null | undefined;
  legacyRole: string | null | undefined;
  isPlatformOwner: boolean | null | undefined;
}) {
  return Boolean(
    args.isPlatformOwner ||
      args.role === "platform_owner" ||
      args.role === "org_admin" ||
      args.legacyRole === "super_admin" ||
      args.legacyRole === "admin"
  );
}

function isMissingOrganizationColumnError(error: unknown) {
  const source = (error || {}) as SupabaseErrorLike;
  const text = [source.code, source.message, source.details, source.hint].map(asText).join(" ").toLowerCase();
  return text.includes("42703") || (text.includes("organization_id") && text.includes("does not exist"));
}

function safeError(error: unknown) {
  return sanitizePublicErrorMessage(error, "Could not load dashboard event diagnostics.");
}

function exactError(error: unknown) {
  const source = (error || {}) as SupabaseErrorLike;
  return {
    message: asText(source.message) || safeError(error),
    code: asText(source.code) || null,
    details: asText(source.details) || null,
    hint: asText(source.hint) || null,
  };
}

function isPlatformOrSuperAdmin(args: {
  role: string | null | undefined;
  legacyRole: string | null | undefined;
  isPlatformOwner: boolean | null | undefined;
}) {
  return Boolean(args.isPlatformOwner || args.role === "platform_owner" || args.legacyRole === "super_admin");
}

export async function GET() {
  const context = await getOrganizationContext();
  if (!context.user) return unauthorizedJson(context);
  if (!canViewDashboardEventDebug(context)) {
    return forbiddenJson("Only admins and platform owners can view dashboard event diagnostics.", context);
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return applyOrganizationAuthCookies(
      jsonNoStore(
        { ok: false, error: "Dashboard event diagnostics require a configured Supabase service role." },
        { status: 500 }
      ),
      context
    );
  }

  const activeOrganizationId = asText(context.activeOrganization?.id) || null;
  const email = asText(context.profile?.email) || asText(context.user.email) || null;
  const canReadAllOrganizations = isPlatformOrSuperAdmin(context);
  const base = {
    userEmail: email,
    authenticatedUserEmail: email,
    role: context.role,
    resolvedRole: context.role,
    legacyRole: context.legacyRole,
    isPlatformOwner: context.isPlatformOwner,
    isSuperAdmin: context.legacyRole === "super_admin",
    isAdmin: context.legacyRole === "admin" || context.role === "org_admin",
    activeOrgId: activeOrganizationId,
    activeOrganizationId,
    activeOrganizationName: asText(context.activeOrganization?.name) || null,
  };

  const columnCheck = await admin.from("events").select("organization_id").limit(1);
  if (columnCheck.error && isMissingOrganizationColumnError(columnCheck.error)) {
    const { count, error } = await admin.from("events").select("id", { count: "exact", head: true });
    if (error) {
      return applyOrganizationAuthCookies(
        jsonNoStore({ ok: false, ...base, error: safeError(error), exactError: exactError(error) }, { status: 500 }),
        context
      );
    }

    const { data: sampleRows, error: sampleError } = await admin
      .from("events")
      .select("id,name,date_text,status,created_at")
      .order("created_at", { ascending: false })
      .limit(12)
      .returns<Omit<EventDebugSampleRow, "organization_id">[]>();
    if (sampleError) {
      return applyOrganizationAuthCookies(
        jsonNoStore({ ok: false, ...base, error: safeError(sampleError), exactError: exactError(sampleError) }, { status: 500 }),
        context
      );
    }

    return applyOrganizationAuthCookies(
      jsonNoStore({
        ok: true,
        ...base,
        schemaSupportsOrganizationId: false,
        totalEventsVisibleUnderNormalQuery: count || 0,
        eventsReturned: count || 0,
        legacyNullOrganizationEventCount: null,
        legacyNullOrganizationEventsVisible: null,
        allEventsCountForPlatformOwner: canReadAllOrganizations ? count || 0 : null,
        sampleEvents: (sampleRows || []).map((event) => ({ ...event, organization_id: null })),
        message: "events.organization_id is not present; all event rows are legacy-unscoped in this environment.",
      }),
      context
    );
  }

  if (columnCheck.error) {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, ...base, error: safeError(columnCheck.error), exactError: exactError(columnCheck.error) }, { status: 500 }),
      context
    );
  }

  let visibleQuery = admin.from("events").select("id", { count: "exact", head: true });
  if (activeOrganizationId) {
    visibleQuery = visibleQuery.or(`organization_id.eq.${activeOrganizationId},organization_id.is.null`);
  }
  const visibleResult = await visibleQuery;
  if (visibleResult.error) {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, ...base, error: safeError(visibleResult.error), exactError: exactError(visibleResult.error) }, { status: 500 }),
      context
    );
  }

  const legacyResult = await admin
    .from("events")
    .select("id", { count: "exact", head: true })
    .is("organization_id", null);
  if (legacyResult.error) {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, ...base, error: safeError(legacyResult.error), exactError: exactError(legacyResult.error) }, { status: 500 }),
      context
    );
  }

  const allEventsResult = canReadAllOrganizations
    ? await admin.from("events").select("id", { count: "exact", head: true })
    : { count: null, error: null };
  if (allEventsResult.error) {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, ...base, error: safeError(allEventsResult.error), exactError: exactError(allEventsResult.error) }, { status: 500 }),
      context
    );
  }

  let sampleQuery = admin
    .from("events")
    .select("id,name,date_text,status,organization_id,created_at")
    .order("created_at", { ascending: false })
    .limit(12);
  if (!canReadAllOrganizations && activeOrganizationId) {
    sampleQuery = sampleQuery.or(`organization_id.eq.${activeOrganizationId},organization_id.is.null`);
  }
  const sampleResult = await sampleQuery.returns<EventDebugSampleRow[]>();
  if (sampleResult.error) {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, ...base, error: safeError(sampleResult.error), exactError: exactError(sampleResult.error) }, { status: 500 }),
      context
    );
  }

  return applyOrganizationAuthCookies(
    jsonNoStore({
      ok: true,
      ...base,
      schemaSupportsOrganizationId: true,
      totalEventsVisibleUnderNormalQuery: visibleResult.count || 0,
      eventsReturned: visibleResult.count || 0,
      legacyNullOrganizationEventCount: legacyResult.count || 0,
      legacyNullOrganizationEventsVisible: legacyResult.count || 0,
      allEventsCountForPlatformOwner: allEventsResult.count,
      sampleEvents: (sampleResult.data || []).map((event) => ({
        id: event.id,
        name: event.name,
        date_text: event.date_text,
        status: event.status,
        organization_id: event.organization_id || null,
        created_at: event.created_at,
      })),
    }),
    context
  );
}

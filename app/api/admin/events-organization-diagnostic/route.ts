import { createSupabaseAdminClient } from "../../../lib/supabaseAdminClient";
import { sanitizePublicErrorMessage } from "../../../lib/safeErrorMessage";
import {
  applyOrganizationAuthCookies,
  forbiddenJson,
  getOrganizationContext,
  jsonNoStore,
  unauthorizedJson,
} from "../../../lib/organizationAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SupabaseAdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type SupabaseErrorLike = {
  message?: string | null;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
};

type OrganizationRow = {
  id: string;
  name: string | null;
  slug: string | null;
};

type EventOrgRow = {
  organization_id: string | null;
};

type EventSampleRow = {
  id: string;
  name: string | null;
  date_text: string | null;
  organization_id: string | null;
  created_at: string | null;
};

type EventBasicSampleRow = {
  id: string;
  name: string | null;
  date_text: string | null;
  created_at: string | null;
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
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

function logDiagnosticFailure(stage: string, error: unknown, extra?: Record<string, unknown>) {
  const source = toSupabaseError(error);
  console.error("[api/admin/events-organization-diagnostic] failed", {
    stage,
    message: source.message || "",
    code: source.code || "",
    details: source.details || "",
    hint: source.hint || "",
    ...(extra || {}),
  });
}

function safeErrorMessage(value: unknown, fallback: string) {
  return sanitizePublicErrorMessage(value, fallback);
}

function isMissingOrganizationColumnError(error: unknown) {
  const source = toSupabaseError(error);
  const code = asText(source.code).toLowerCase();
  const message = asText(source.message).toLowerCase();
  if (code === "42703") return true;
  return message.includes("organization_id") && message.includes("does not exist");
}

function canRunDiagnostics(args: {
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

async function loadEventOrganizationCounts(admin: SupabaseAdminClient) {
  const { count: totalCount, error: countError } = await admin
    .from("events")
    .select("id", { count: "exact", head: true });

  if (countError) {
    return {
      ok: false as const,
      totalEvents: 0,
      countsByOrganizationId: new Map<string, number>(),
      nullCount: 0,
      error: countError,
    };
  }

  const countsByOrganizationId = new Map<string, number>();
  let nullCount = 0;
  const pageSize = 1000;
  const maxRows = 200_000;

  for (let offset = 0; offset < Math.min(totalCount || 0, maxRows); offset += pageSize) {
    const { data, error } = await admin
      .from("events")
      .select("organization_id")
      .range(offset, offset + pageSize - 1)
      .returns<EventOrgRow[]>();

    if (error) {
      return {
        ok: false as const,
        totalEvents: totalCount || 0,
        countsByOrganizationId,
        nullCount,
        error,
      };
    }

    const rows = data || [];
    if (!rows.length) break;

    rows.forEach((row) => {
      const organizationId = asText(row.organization_id);
      if (!organizationId) {
        nullCount += 1;
        return;
      }
      countsByOrganizationId.set(organizationId, (countsByOrganizationId.get(organizationId) || 0) + 1);
    });

    if (rows.length < pageSize) break;
  }

  return {
    ok: true as const,
    totalEvents: totalCount || 0,
    countsByOrganizationId,
    nullCount,
    error: null,
  };
}

export async function GET() {
  const context = await getOrganizationContext();
  if (!context.user) return unauthorizedJson(context);
  if (!canRunDiagnostics(context)) {
    return forbiddenJson("Only admins and platform owners can run event organization diagnostics.", context);
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return applyOrganizationAuthCookies(
      jsonNoStore(
        { ok: false, error: "Event diagnostics require a configured Supabase service role." },
        { status: 500 }
      ),
      context
    );
  }

  const activeOrganizationId = asText(context.activeOrganization?.id) || null;
  const activeOrganizationName = asText(context.activeOrganization?.name) || null;

  const { data: knownOrganizations, error: organizationsError } = await admin
    .from("organizations")
    .select("id,name,slug")
    .order("name", { ascending: true })
    .returns<OrganizationRow[]>();

  if (organizationsError) {
    logDiagnosticFailure("organizations-query", organizationsError);
    return applyOrganizationAuthCookies(
      jsonNoStore(
        { ok: false, error: safeErrorMessage(organizationsError, "Could not load organization diagnostics.") },
        { status: 500 }
      ),
      context
    );
  }

  const organizationIdCheck = await admin
    .from("events")
    .select("organization_id")
    .limit(1)
    .returns<EventOrgRow[]>();
  if (organizationIdCheck.error && isMissingOrganizationColumnError(organizationIdCheck.error)) {
    const { count: totalEventsWithoutOrganization, error: countError } = await admin
      .from("events")
      .select("id", { count: "exact", head: true });
    if (countError) {
      logDiagnosticFailure("events-count-no-org-column", countError);
      return applyOrganizationAuthCookies(
        jsonNoStore(
          { ok: false, error: safeErrorMessage(countError, "Could not load event diagnostics.") },
          { status: 500 }
        ),
        context
      );
    }

    const { data: sampleWithoutOrganization, error: sampleError } = await admin
      .from("events")
      .select("id,name,date_text,created_at")
      .order("created_at", { ascending: false })
      .limit(25)
      .returns<EventBasicSampleRow[]>();

    if (sampleError) {
      logDiagnosticFailure("events-sample-no-org-column", sampleError);
      return applyOrganizationAuthCookies(
        jsonNoStore(
          { ok: false, error: safeErrorMessage(sampleError, "Could not load event diagnostics.") },
          { status: 500 }
        ),
        context
      );
    }

    return applyOrganizationAuthCookies(
      jsonNoStore({
        ok: true,
        schemaSupportsOrganizationId: false,
        message:
          "events.organization_id column is not available in this environment. Organization grouping cannot be computed yet.",
        totalEvents: totalEventsWithoutOrganization || 0,
        activeOrganizationId,
        activeOrganizationName,
        countWithNullOrganizationId: null,
        countsByOrganizationId: [],
        knownOrganizations: (knownOrganizations || []).map((organization) => ({
          id: organization.id,
          name: asText(organization.name) || "Organization",
          slug: asText(organization.slug) || null,
        })),
        sampleEvents: (sampleWithoutOrganization || []).map((event) => ({
          id: event.id,
          name: event.name,
          date_text: event.date_text,
          organization_id: null,
          created_at: event.created_at,
        })),
        sampleEventsByOrganization: {},
      }),
      context
    );
  }

  if (organizationIdCheck.error) {
    logDiagnosticFailure("events-org-column-check", organizationIdCheck.error);
    return applyOrganizationAuthCookies(
      jsonNoStore(
        { ok: false, error: safeErrorMessage(organizationIdCheck.error, "Could not load event diagnostics.") },
        { status: 500 }
      ),
      context
    );
  }

  const countsResult = await loadEventOrganizationCounts(admin);
  if (!countsResult.ok) {
    logDiagnosticFailure("events-counts-query", countsResult.error);
    return applyOrganizationAuthCookies(
      jsonNoStore(
        { ok: false, error: safeErrorMessage(countsResult.error, "Could not load event diagnostics.") },
        { status: 500 }
      ),
      context
    );
  }

  const { data: sampleEvents, error: sampleEventsError } = await admin
    .from("events")
    .select("id,name,date_text,organization_id,created_at")
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<EventSampleRow[]>();

  if (sampleEventsError) {
    logDiagnosticFailure("events-sample-query", sampleEventsError);
    return applyOrganizationAuthCookies(
      jsonNoStore(
        { ok: false, error: safeErrorMessage(sampleEventsError, "Could not load event diagnostics.") },
        { status: 500 }
      ),
      context
    );
  }

  const organizationNameById = new Map(
    (knownOrganizations || []).map((organization) => [
      organization.id,
      {
        name: asText(organization.name) || "Organization",
        slug: asText(organization.slug) || null,
      },
    ])
  );
  const countsByOrganizationId = Array.from(countsResult.countsByOrganizationId.entries())
    .map(([organizationId, count]) => {
      const knownOrganization = organizationNameById.get(organizationId);
      return {
        organization_id: organizationId,
        count,
        organization_name: knownOrganization?.name || null,
        organization_slug: knownOrganization?.slug || null,
      };
    })
    .sort((a, b) => b.count - a.count || asText(a.organization_name).localeCompare(asText(b.organization_name)));

  const sampleEventsByOrganization = (sampleEvents || []).reduce<Record<string, EventSampleRow[]>>((groups, event) => {
    const key = asText(event.organization_id) || "__NULL__";
    const next = groups[key] || [];
    if (next.length < 8) {
      next.push(event);
      groups[key] = next;
    }
    return groups;
  }, {});

  const message =
    countsResult.totalEvents === 0
      ? "No events found in the production events table."
      : undefined;

  return applyOrganizationAuthCookies(
    jsonNoStore({
      ok: true,
      schemaSupportsOrganizationId: true,
      message,
      totalEvents: countsResult.totalEvents,
      activeOrganizationId,
      activeOrganizationName,
      countWithNullOrganizationId: countsResult.nullCount,
      countsByOrganizationId,
      knownOrganizations: (knownOrganizations || []).map((organization) => ({
        id: organization.id,
        name: asText(organization.name) || "Organization",
        slug: asText(organization.slug) || null,
      })),
      sampleEvents: sampleEvents || [],
      sampleEventsByOrganization,
    }),
    context
  );
}

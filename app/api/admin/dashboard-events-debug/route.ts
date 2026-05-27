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
  const base = {
    authenticatedUserEmail: email,
    role: context.role,
    legacyRole: context.legacyRole,
    isPlatformOwner: context.isPlatformOwner,
    activeOrganizationId,
    activeOrganizationName: asText(context.activeOrganization?.name) || null,
  };

  const columnCheck = await admin.from("events").select("organization_id").limit(1);
  if (columnCheck.error && isMissingOrganizationColumnError(columnCheck.error)) {
    const { count, error } = await admin.from("events").select("id", { count: "exact", head: true });
    if (error) {
      return applyOrganizationAuthCookies(
        jsonNoStore({ ok: false, ...base, error: safeError(error) }, { status: 500 }),
        context
      );
    }

    return applyOrganizationAuthCookies(
      jsonNoStore({
        ok: true,
        ...base,
        schemaSupportsOrganizationId: false,
        eventsReturned: count || 0,
        legacyNullOrganizationEventsVisible: null,
        message: "events.organization_id is not present; all event rows are legacy-unscoped in this environment.",
      }),
      context
    );
  }

  if (columnCheck.error) {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, ...base, error: safeError(columnCheck.error) }, { status: 500 }),
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
      jsonNoStore({ ok: false, ...base, error: safeError(visibleResult.error) }, { status: 500 }),
      context
    );
  }

  const legacyResult = await admin
    .from("events")
    .select("id", { count: "exact", head: true })
    .is("organization_id", null);
  if (legacyResult.error) {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, ...base, error: safeError(legacyResult.error) }, { status: 500 }),
      context
    );
  }

  return applyOrganizationAuthCookies(
    jsonNoStore({
      ok: true,
      ...base,
      schemaSupportsOrganizationId: true,
      eventsReturned: visibleResult.count || 0,
      legacyNullOrganizationEventsVisible: legacyResult.count || 0,
    }),
    context
  );
}

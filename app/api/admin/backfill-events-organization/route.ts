import { createSupabaseAdminClient } from "../../../lib/supabaseAdminClient";
import { sanitizePublicErrorMessage } from "../../../lib/safeErrorMessage";
import {
  applyOrganizationAuthCookies,
  forbiddenJson,
  getOrganizationContext,
  jsonNoStore,
  noActiveOrganizationJson,
  requireActiveOrganization,
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

function logBackfillFailure(stage: string, error: unknown, extra?: Record<string, unknown>) {
  const source = toSupabaseError(error);
  console.error("[api/admin/backfill-events-organization] failed", {
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

function canRunBackfill(args: {
  role: string | null | undefined;
  legacyRole: string | null | undefined;
  isPlatformOwner: boolean | null | undefined;
}) {
  return Boolean(
    args.isPlatformOwner ||
      args.role === "platform_owner" ||
      args.legacyRole === "super_admin"
  );
}

async function loadPreview(admin: SupabaseAdminClient) {
  const { count, error: countError } = await admin
    .from("events")
    .select("id", { count: "exact", head: true })
    .is("organization_id", null);

  if (countError) {
    return {
      ok: false as const,
      count: 0,
      sampleEvents: [] as Array<{
        id: string;
        name: string | null;
        date_text: string | null;
        status: string | null;
        created_at: string | null;
      }>,
      error: countError,
    };
  }

  const { data: sampleEvents, error: sampleError } = await admin
    .from("events")
    .select("id,name,date_text,status,created_at")
    .is("organization_id", null)
    .order("created_at", { ascending: false })
    .limit(25);

  if (sampleError) {
    return {
      ok: false as const,
      count: count || 0,
      sampleEvents: [] as Array<{
        id: string;
        name: string | null;
        date_text: string | null;
        status: string | null;
        created_at: string | null;
      }>,
      error: sampleError,
    };
  }

  return {
    ok: true as const,
    count: count || 0,
    sampleEvents:
      (sampleEvents || []) as Array<{
        id: string;
        name: string | null;
        date_text: string | null;
        status: string | null;
        created_at: string | null;
      }>,
    error: null,
  };
}

export async function GET(request: Request) {
  const context = await getOrganizationContext();
  if (!context.user) return unauthorizedJson(context);
  if (!requireActiveOrganization(context)) return noActiveOrganizationJson(context);
  if (!canRunBackfill(context)) {
    return forbiddenJson("Only platform owners can backfill legacy events.", context);
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return applyOrganizationAuthCookies(
      jsonNoStore(
        { ok: false, error: "Backfill requires a configured Supabase service role." },
        { status: 500 }
      ),
      context
    );
  }

  const mode = new URL(request.url).searchParams.get("mode") || "preview";
  if (mode !== "preview") {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, error: "Unsupported mode. Use mode=preview." }, { status: 400 }),
      context
    );
  }

  const preview = await loadPreview(admin);
  if (!preview.ok) {
    if (isMissingOrganizationColumnError(preview.error)) {
      logBackfillFailure("preview-no-organization-column", preview.error);
      return applyOrganizationAuthCookies(
        jsonNoStore({
          ok: true,
          mode: "preview",
          schemaSupportsOrganizationId: false,
          activeOrganization: context.activeOrganization,
          nullOrganizationEventCount: 0,
          sampleEvents: [],
          warning:
            "events.organization_id is not available yet. Backfill is not required until org migration is complete.",
        }),
        context
      );
    }

    logBackfillFailure("preview-query", preview.error);
    return applyOrganizationAuthCookies(
      jsonNoStore(
        { ok: false, error: safeErrorMessage(preview.error, "Could not preview legacy events.") },
        { status: 500 }
      ),
      context
    );
  }

  return applyOrganizationAuthCookies(
    jsonNoStore({
      ok: true,
      mode: "preview",
      schemaSupportsOrganizationId: true,
      activeOrganization: context.activeOrganization,
      nullOrganizationEventCount: preview.count,
      sampleEvents: preview.sampleEvents,
    }),
    context
  );
}

export async function POST() {
  const context = await getOrganizationContext();
  if (!context.user) return unauthorizedJson(context);
  if (!requireActiveOrganization(context)) return noActiveOrganizationJson(context);
  if (!canRunBackfill(context)) {
    return forbiddenJson("Only platform owners can backfill legacy events.", context);
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return applyOrganizationAuthCookies(
      jsonNoStore(
        { ok: false, error: "Backfill requires a configured Supabase service role." },
        { status: 500 }
      ),
      context
    );
  }

  const activeOrganizationId = context.activeOrganization!.id;
  const preview = await loadPreview(admin);
  if (!preview.ok) {
    if (isMissingOrganizationColumnError(preview.error)) {
      logBackfillFailure("apply-no-organization-column", preview.error);
      return applyOrganizationAuthCookies(
        jsonNoStore({
          ok: true,
          schemaSupportsOrganizationId: false,
          activeOrganization: context.activeOrganization,
          updatedCount: 0,
          warning:
            "events.organization_id is not available yet. Backfill was skipped.",
        }),
        context
      );
    }

    logBackfillFailure("apply-preview-query", preview.error);
    return applyOrganizationAuthCookies(
      jsonNoStore(
        { ok: false, error: safeErrorMessage(preview.error, "Could not prepare event backfill.") },
        { status: 500 }
      ),
      context
    );
  }

  if (preview.count === 0) {
    return applyOrganizationAuthCookies(
      jsonNoStore({
        ok: true,
        activeOrganization: context.activeOrganization,
        previewCount: 0,
        updatedCount: 0,
        remainingNullCount: 0,
      }),
      context
    );
  }

  const { data: updatedRows, error: updateError } = await admin
    .from("events")
    .update({ organization_id: activeOrganizationId })
    .is("organization_id", null)
    .select("id");

  if (updateError) {
    logBackfillFailure("apply-update-query", updateError, { activeOrganizationId });
    return applyOrganizationAuthCookies(
      jsonNoStore(
        { ok: false, error: safeErrorMessage(updateError, "Could not backfill legacy events.") },
        { status: 500 }
      ),
      context
    );
  }

  const { count: remainingNullCount, error: remainingError } = await admin
    .from("events")
    .select("id", { count: "exact", head: true })
    .is("organization_id", null);

  if (remainingError) {
    logBackfillFailure("apply-remaining-query", remainingError, { activeOrganizationId });
  }

  return applyOrganizationAuthCookies(
    jsonNoStore({
      ok: true,
      activeOrganization: context.activeOrganization,
      previewCount: preview.count,
      updatedCount: Array.isArray(updatedRows) ? updatedRows.length : 0,
      remainingNullCount: remainingError ? null : remainingNullCount || 0,
    }),
    context
  );
}

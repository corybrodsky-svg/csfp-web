import { NextRequest } from "next/server";
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

type EventDebugRow = {
  id: string;
  name: string | null;
  date_text: string | null;
  status: string | null;
  organization_id?: string | null;
  created_at: string | null;
};

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

function exactError(error: unknown) {
  const source = (error || {}) as SupabaseErrorLike;
  return {
    message: sanitizePublicErrorMessage(source.message || error, "Event debug query failed."),
    code: asText(source.code) || null,
    details: sanitizePublicErrorMessage(source.details || "", ""),
    hint: sanitizePublicErrorMessage(source.hint || "", ""),
  };
}

function isMissingOrganizationColumnError(error: unknown) {
  const source = (error || {}) as SupabaseErrorLike;
  const text = [source.code, source.message, source.details, source.hint].map(asText).join(" ").toLowerCase();
  return text.includes("42703") || (text.includes("organization_id") && text.includes("does not exist"));
}

function canViewEventDebug(args: {
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

function canReadAllOrganizations(args: {
  role: string | null | undefined;
  legacyRole: string | null | undefined;
  isPlatformOwner: boolean | null | undefined;
}) {
  return Boolean(args.isPlatformOwner || args.role === "platform_owner" || args.legacyRole === "super_admin");
}

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext();
  if (!context.user) return unauthorizedJson(context);
  if (!canViewEventDebug(context)) {
    return forbiddenJson("Only admins and platform owners can view event diagnostics.", context);
  }

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
      jsonNoStore({ ok: false, error: "server_error", message: "Event debug requires a Supabase service role." }, { status: 500 }),
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
  };

  const columnCheck = await admin.from("events").select("organization_id").eq("id", eventId).limit(1);
  if (columnCheck.error && isMissingOrganizationColumnError(columnCheck.error)) {
    const unscoped = await admin
      .from("events")
      .select("id,name,date_text,status,created_at")
      .eq("id", eventId)
      .maybeSingle()
      .returns<Omit<EventDebugRow, "organization_id">>();
    if (unscoped.error) {
      return applyOrganizationAuthCookies(
        jsonNoStore({ ok: false, ...base, exactError: exactError(unscoped.error) }, { status: 500 }),
        context
      );
    }
    return applyOrganizationAuthCookies(
      jsonNoStore({
        ok: true,
        ...base,
        schemaSupportsOrganizationId: false,
        scopedFound: Boolean(unscoped.data),
        legacyNullFound: null,
        allOrgFound: canReadAllOrganizations(context) ? Boolean(unscoped.data) : null,
        event: unscoped.data ? { ...unscoped.data, organization_id: null } : null,
      }),
      context
    );
  }

  if (columnCheck.error) {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, ...base, exactError: exactError(columnCheck.error) }, { status: 500 }),
      context
    );
  }

  const scoped = await admin
    .from("events")
    .select("id,name,date_text,status,organization_id,created_at")
    .eq("id", eventId)
    .or(`organization_id.eq.${activeOrgId},organization_id.is.null`)
    .maybeSingle()
    .returns<EventDebugRow>();
  if (scoped.error) {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, ...base, exactError: exactError(scoped.error) }, { status: 500 }),
      context
    );
  }

  const legacyNull = await admin
    .from("events")
    .select("id,name,date_text,status,organization_id,created_at")
    .eq("id", eventId)
    .is("organization_id", null)
    .maybeSingle()
    .returns<EventDebugRow>();
  if (legacyNull.error) {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, ...base, exactError: exactError(legacyNull.error) }, { status: 500 }),
      context
    );
  }

  const allOrg = canReadAllOrganizations(context)
    ? await admin
        .from("events")
        .select("id,name,date_text,status,organization_id,created_at")
        .eq("id", eventId)
        .maybeSingle()
        .returns<EventDebugRow>()
    : { data: null, error: null };
  if (allOrg.error) {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, ...base, exactError: exactError(allOrg.error) }, { status: 500 }),
      context
    );
  }

  return applyOrganizationAuthCookies(
    jsonNoStore({
      ok: true,
      ...base,
      schemaSupportsOrganizationId: true,
      scopedFound: Boolean(scoped.data),
      legacyNullFound: Boolean(legacyNull.data),
      allOrgFound: canReadAllOrganizations(context) ? Boolean(allOrg.data) : null,
      event: scoped.data || legacyNull.data || allOrg.data || null,
    }),
    context
  );
}

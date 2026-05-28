import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "./supabaseAdminClient";
import {
  applyOrganizationAuthCookies,
  createSupabaseUserClient,
  getOrganizationContext,
  jsonNoStore,
  roleCanOperateOrganization,
  type OrganizationContext,
} from "./organizationAuth";
import { resolveSpAccountLink } from "./spAccountLinking";
import { sanitizePublicErrorMessage } from "./safeErrorMessage";

export const SHIFT_OPENING_SELECT =
  "id,event_id,organization_id,title,shift_date,start_time,end_time,location,room,needed_count,status,visibility,requirements,notes,created_at,updated_at";

export const SHIFT_RESPONSE_SELECT =
  "id,event_id,opening_id,sp_id,response,source,message,responded_at,created_at,updated_at";

export const SP_ATTENDANCE_SELECT =
  "id,event_id,sp_id,status,notes,checked_in_at,checked_out_at,checked_in_by,checked_out_by,created_at,updated_at";

export const VALID_SHIFT_RESPONSES = new Set(["available", "maybe", "declined", "accepted", "withdrawn"]);
export const VALID_SHIFT_SOURCES = new Set(["portal", "email", "microsoft_forms", "manual", "import"]);
export const VALID_ATTENDANCE_STATUSES = new Set(["not_arrived", "arrived", "checked_in", "checked_out", "no_show", "excused"]);
export const PORTAL_VISIBILITIES = new Set(["portal_only", "portal_and_email"]);

export type ShiftRouteAccess = {
  context: OrganizationContext;
  db: SupabaseClient;
  event: Record<string, unknown>;
  linkedSpId: string | null;
  isManager: boolean;
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function getRouteId(params: { id?: string | string[] }) {
  const raw = params.id;
  if (Array.isArray(raw)) return raw[0] || "";
  return typeof raw === "string" ? raw : "";
}

export function getSupabaseError(error: unknown) {
  const source = error && typeof error === "object" ? (error as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown }) : {};
  return {
    message: asText(source.message),
    code: asText(source.code),
    details: asText(source.details),
    hint: asText(source.hint),
  };
}

export function safeJson(body: Record<string, unknown>, init?: ResponseInit, context?: OrganizationContext | null) {
  return applyOrganizationAuthCookies(jsonNoStore(body, init), context || null);
}

export function safeErrorJson(
  error: string,
  message: string,
  status: number,
  context?: OrganizationContext | null,
  diagnostics?: Record<string, unknown>
) {
  const safeDiagnostics = diagnostics
    ? Object.fromEntries(
        Object.entries(diagnostics).map(([key, value]) => [
          key,
          key === "message" || key === "details" || key === "hint" || key === "error"
            ? sanitizePublicErrorMessage(value, "")
            : value,
        ])
      )
    : null;
  return safeJson(
    {
      ok: false,
      error,
      message: sanitizePublicErrorMessage(message, "Request temporarily unavailable."),
      status,
      ...(safeDiagnostics ? { diagnostics: safeDiagnostics } : {}),
    },
    { status },
    context
  );
}

export function logShiftRouteFailure(route: string, error: unknown, extra?: Record<string, unknown>) {
  const supabaseError = getSupabaseError(error);
  console.error(`[${route}] failed`, {
    message: supabaseError.message,
    code: supabaseError.code,
    details: supabaseError.details,
    hint: supabaseError.hint,
    ...(extra || {}),
  });
}

export function isManagerContext(context: OrganizationContext) {
  return Boolean(
    roleCanOperateOrganization(context.role) ||
      context.legacyRole === "super_admin" ||
      context.legacyRole === "admin" ||
      context.legacyRole === "sim_op"
  );
}

export function normalizeShiftResponse(value: unknown) {
  const response = asText(value).toLowerCase().replace(/[\s-]+/g, "_");
  return VALID_SHIFT_RESPONSES.has(response) ? response : "";
}

export function normalizeShiftSource(value: unknown, fallback = "portal") {
  const source = asText(value).toLowerCase().replace(/[\s-]+/g, "_") || fallback;
  return VALID_SHIFT_SOURCES.has(source) ? source : fallback;
}

export function normalizeAttendanceStatus(value: unknown) {
  const status = asText(value).toLowerCase().replace(/[\s-]+/g, "_");
  return VALID_ATTENDANCE_STATUSES.has(status) ? status : "";
}

export function normalizeOpeningStatus(value: unknown) {
  const status = asText(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (status === "open" || status === "closed" || status === "draft" || status === "filled" || status === "cancelled") return status;
  return "open";
}

export function normalizeOpeningVisibility(value: unknown) {
  const visibility = asText(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (visibility === "portal_only" || visibility === "email_only" || visibility === "portal_and_email" || visibility === "private") {
    return visibility;
  }
  return "portal_and_email";
}

export async function resolveShiftRouteAccess(eventId: string): Promise<ShiftRouteAccess | NextResponse> {
  const context = await getOrganizationContext();
  if (!context.user) return safeErrorJson("unauthorized", "Authentication is required.", 401, context);

  const admin = createSupabaseAdminClient();
  const db = admin || createSupabaseUserClient(context.accessToken);
  const isManager = isManagerContext(context);
  const { data: event, error: eventError } = await db
    .from("events")
    .select("id,name,organization_id")
    .eq("id", eventId)
    .maybeSingle();

  if (eventError) {
    logShiftRouteFailure("sp-shift-access", eventError, { eventId, userEmail: context.user.email });
    return safeErrorJson("server_error", "Could not load event for SP shift workflow.", 500, context, getSupabaseError(eventError));
  }

  if (!event) return safeErrorJson("not_found", "Event was not found.", 404, context, { eventId });

  const eventOrgId = asText((event as Record<string, unknown>).organization_id);
  const activeOrgId = asText(context.activeOrganization?.id);
  const managerCanRead =
    isManager && (context.isPlatformOwner || !eventOrgId || !activeOrgId || eventOrgId === activeOrgId);

  const profile = context.profile;
  const link =
    context.legacyRole === "sp" || context.role === "sp"
      ? await resolveSpAccountLink({ user: context.user, profile, accessToken: context.accessToken })
      : null;
  const linkedSpId = asText(link?.sp_id) || null;

  if (!managerCanRead && !linkedSpId) {
    return safeErrorJson("forbidden", "You do not have access to this event shift workflow.", 403, context, { eventId });
  }

  return {
    context,
    db,
    event: event as Record<string, unknown>,
    linkedSpId,
    isManager,
  };
}

export function withSpDirectoryRows<T extends Record<string, unknown>>(records: T[], sps: Record<string, unknown>[]) {
  const byId = new Map(sps.map((sp) => [asText(sp.id), sp]));
  return records.map((record) => {
    const sp = byId.get(asText(record.sp_id)) || null;
    return {
      ...record,
      sp,
      sp_name:
        asText(sp?.full_name) ||
        [asText(sp?.first_name), asText(sp?.last_name)].filter(Boolean).join(" ") ||
        "",
      sp_email: asText(sp?.working_email) || asText(sp?.email) || "",
    };
  });
}

export async function loadSpDirectory(db: SupabaseClient, spIds: string[]) {
  const ids = Array.from(new Set(spIds.map(asText).filter(Boolean)));
  if (!ids.length) return [] as Record<string, unknown>[];
  const { data, error } = await db
    .from("sps")
    .select("id,first_name,last_name,full_name,working_email,email")
    .in("id", ids);
  if (error) return [] as Record<string, unknown>[];
  return (data || []) as Record<string, unknown>[];
}

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "../../../../../lib/supabaseAdminClient";
import { supabaseKey, supabaseUrl } from "../../../../../lib/supabaseServerClient";
import {
  forbiddenJson,
  getOrganizationContext,
  noActiveOrganizationJson,
  requireActiveOrganization,
  roleCanOperateOrganization,
  unauthorizedJson,
} from "../../../../../lib/organizationAuth";
import { sanitizePublicErrorMessage } from "../../../../../lib/safeErrorMessage";

export const dynamic = "force-dynamic";

type SupabaseErrorLike = {
  message?: string | null;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
};

type SelectionInput = {
  spId?: unknown;
  email?: unknown;
  name?: unknown;
  assignmentType?: unknown;
};

type AssignmentRow = {
  id: string;
  event_id: string | null;
  sp_id: string | null;
  status?: string | null;
  assignment_status?: string | null;
  role_name?: string | null;
  confirmed?: boolean | null;
  notes?: string | null;
  last_contacted_at?: string | null;
  contact_method?: string | null;
  created_at?: string | null;
  training_attended?: boolean | null;
  training_checked_in_at?: string | null;
  event_checked_in_at?: string | null;
  event_attendance_status?: string | null;
  attendance_note?: string | null;
};

const HIRE_CONFIRMATION_BLOCK = "CFSP_HIRE_CONFIRMATION_SELECTION";
const assignmentSelectWithAttendance =
  "id,event_id,sp_id,status,assignment_status,role_name,confirmed,notes,last_contacted_at,contact_method,created_at,training_attended,training_checked_in_at,event_checked_in_at,event_attendance_status,attendance_note";
const assignmentSelectBase =
  "id,event_id,sp_id,status,assignment_status,role_name,confirmed,notes,last_contacted_at,contact_method,created_at";

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeEmail(value: unknown) {
  return asText(value).toLowerCase();
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

function publicError(error: unknown, fallback: string) {
  const source = toSupabaseError(error);
  return sanitizePublicErrorMessage(source.message || (error instanceof Error ? error.message : error), fallback);
}

function exactSupabaseError(error: unknown) {
  const source = toSupabaseError(error);
  return {
    message: source.message || (error instanceof Error ? error.message : ""),
    code: source.code || "",
    details: source.details || "",
    hint: source.hint || "",
  };
}

function logStaffingSelection(stage: string, error: unknown, extra?: Record<string, unknown>) {
  const source = toSupabaseError(error);
  console.error("[staffing-save] hire confirmation selection failed", {
    stage,
    message: source.message || (error instanceof Error ? error.message : ""),
    code: source.code || "",
    details: source.details || "",
    hint: source.hint || "",
    ...(extra || {}),
  });
}

function getRouteId(params: { id?: string | string[] }) {
  const raw = params.id;
  if (Array.isArray(raw)) return raw[0] || "";
  return typeof raw === "string" ? raw : "";
}

function isMissingColumnError(error: unknown, columnName: string) {
  const source = toSupabaseError(error);
  const code = asText(source.code).toLowerCase();
  const text = [source.message, source.details, source.hint].map(asText).join(" ").toLowerCase();
  const target = columnName.toLowerCase();
  return code === "42703" || (text.includes(target) && (text.includes("does not exist") || text.includes("schema cache") || text.includes("column")));
}

function createViewerScopedClient(accessToken: string) {
  if (!supabaseUrl || !supabaseKey) throw new Error("Missing Supabase configuration.");
  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

function canUsePrivilegedEventWrite(context: {
  role: string | null | undefined;
  legacyRole: string | null | undefined;
  isPlatformOwner: boolean | null | undefined;
}) {
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

function canMutateEventForActiveOrganization(
  context: {
    role: string | null | undefined;
    legacyRole: string | null | undefined;
    isPlatformOwner: boolean | null | undefined;
    schemaAvailable: boolean;
    activeOrganization?: { id?: string | null } | null;
  },
  eventOrganizationId: string
) {
  if (!context.schemaAvailable) return true;
  const activeOrganizationId = asText(context.activeOrganization?.id);
  if (eventOrganizationId && activeOrganizationId && eventOrganizationId === activeOrganizationId) return true;
  if (!eventOrganizationId) {
    return Boolean(context.isPlatformOwner || context.role === "platform_owner" || context.legacyRole === "super_admin");
  }
  return false;
}

function normalizeAssignmentStatus(assignment: AssignmentRow | null | undefined) {
  const status = asText(assignment?.status) || asText(assignment?.assignment_status) || asText(assignment?.role_name);
  return status.toLowerCase();
}

function isConfirmedAssignment(assignment: AssignmentRow | null | undefined) {
  return assignment?.confirmed === true || normalizeAssignmentStatus(assignment) === "confirmed";
}

function isUnavailableAssignment(assignment: AssignmentRow | null | undefined) {
  const status = normalizeAssignmentStatus(assignment);
  return status === "declined" || status === "no_show";
}

function normalizeAssignmentRow(row: AssignmentRow): AssignmentRow {
  const status = asText(row.status) || asText(row.assignment_status) || asText(row.role_name) || "";
  return {
    ...row,
    status: status || null,
    confirmed: typeof row.confirmed === "boolean" ? row.confirmed : status.toLowerCase() === "confirmed",
  };
}

function upsertHireConfirmationBlock(notes: unknown, detail: Record<string, unknown>) {
  const text = asText(notes);
  const block = `[${HIRE_CONFIRMATION_BLOCK}]${JSON.stringify(detail)}[/${HIRE_CONFIRMATION_BLOCK}]`;
  const pattern = new RegExp(`\\[${HIRE_CONFIRMATION_BLOCK}\\][\\s\\S]*?\\[\\/${HIRE_CONFIRMATION_BLOCK}\\]`, "g");
  if (pattern.test(text)) return text.replace(pattern, block).trim();
  return [text, block].filter(Boolean).join("\n\n").trim();
}

function parseSelectionPayload(value: unknown) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value
    .map((entry) => {
      const source = (entry || {}) as SelectionInput;
      const spId = asText(source.spId);
      const assignmentType = asText(source.assignmentType).toLowerCase() === "backup" ? "backup" : "primary";
      if (!spId || seen.has(spId)) return null;
      seen.add(spId);
      return {
        spId,
        email: normalizeEmail(source.email),
        name: asText(source.name),
        assignmentType: assignmentType as "primary" | "backup",
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
}

async function loadAssignments(client: ReturnType<typeof createViewerScopedClient>, eventId: string, organizationId?: string) {
  let primaryQuery = client.from("event_sps").select(assignmentSelectWithAttendance).eq("event_id", eventId);
  if (organizationId) primaryQuery = primaryQuery.eq("organization_id", organizationId);
  const primary = await primaryQuery;
  if (!primary.error) return { assignments: ((primary.data || []) as AssignmentRow[]).map(normalizeAssignmentRow), error: null };

  let fallbackQuery = client.from("event_sps").select(assignmentSelectBase).eq("event_id", eventId);
  if (organizationId) fallbackQuery = fallbackQuery.eq("organization_id", organizationId);
  const fallback = await fallbackQuery;
  return { assignments: ((fallback.data || []) as AssignmentRow[]).map(normalizeAssignmentRow), error: fallback.error };
}

async function validateSps(client: ReturnType<typeof createViewerScopedClient>, spIds: string[], activeOrganizationId: string) {
  const primary = await client.from("sps").select("id,organization_id,status,email,working_email,first_name,last_name,full_name").in("id", spIds);
  if (!primary.error) {
    const rows = (primary.data || []) as Array<Record<string, unknown>>;
    const validIds = new Set(
      rows
        .filter((row) => {
          const organizationId = asText(row.organization_id);
          return !organizationId || organizationId === activeOrganizationId;
        })
        .map((row) => asText(row.id))
        .filter(Boolean)
    );
    return { validIds, error: null };
  }

  if (!isMissingColumnError(primary.error, "organization_id")) return { validIds: new Set<string>(), error: primary.error };

  const fallback = await client.from("sps").select("id,status,email,working_email,first_name,last_name,full_name").in("id", spIds);
  return {
    validIds: new Set(((fallback.data || []) as Array<Record<string, unknown>>).map((row) => asText(row.id)).filter(Boolean)),
    error: fallback.error,
  };
}

export async function POST(request: Request, context: { params: Promise<{ id?: string | string[] }> }) {
  const organizationContext = await getOrganizationContext();
  if (!organizationContext.user) return unauthorizedJson(organizationContext);
  if (!requireActiveOrganization(organizationContext)) return noActiveOrganizationJson(organizationContext);
  if (!roleCanOperateOrganization(organizationContext.role)) {
    return forbiddenJson("Only Sim Ops or admin accounts can manage event staffing.", organizationContext);
  }

  try {
    const activeOrganizationId = organizationContext.activeOrganization!.id;
    const params = await context.params;
    const eventId = getRouteId(params);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const selected = parseSelectionPayload(body?.selected);

    if (!eventId || !selected.length) {
      return NextResponse.json({ ok: false, error: "Select at least one SP for Hire Confirmation." }, { status: 400 });
    }

    const adminClient = canUsePrivilegedEventWrite(organizationContext) ? createSupabaseAdminClient() : null;
    const client = adminClient || createViewerScopedClient(organizationContext.accessToken);

    const eventCheck = await client.from("events").select("id,organization_id").eq("id", eventId).maybeSingle();
    let eventOrganizationId = "";
    if (eventCheck.error && isMissingColumnError(eventCheck.error, "organization_id")) {
      const fallbackEventCheck = await client.from("events").select("id").eq("id", eventId).maybeSingle();
      if (fallbackEventCheck.error || !fallbackEventCheck.data) {
        logStaffingSelection("event-fallback-check", fallbackEventCheck.error || "not_found", { eventId, activeOrganizationId });
        return NextResponse.json({ ok: false, error: "Could not validate event before saving staffing." }, { status: fallbackEventCheck.error ? 500 : 404 });
      }
    } else if (eventCheck.error || !eventCheck.data) {
      logStaffingSelection("event-check", eventCheck.error || "not_found", { eventId, activeOrganizationId });
      return NextResponse.json({ ok: false, error: "Could not validate event before saving staffing." }, { status: eventCheck.error ? 500 : 404 });
    } else {
      eventOrganizationId = asText((eventCheck.data as { organization_id?: unknown }).organization_id);
    }

    if (!canMutateEventForActiveOrganization(organizationContext, eventOrganizationId)) {
      return forbiddenJson("You do not have permission to update this event staffing.", organizationContext);
    }

    const selectedSpIds = selected.map((entry) => entry.spId);
    const spValidation = await validateSps(client, selectedSpIds, activeOrganizationId);
    if (spValidation.error) {
      logStaffingSelection("sp-validation", spValidation.error, { eventId, selectedCount: selected.length });
      return NextResponse.json({ ok: false, error: "Could not validate selected SP records." }, { status: 500 });
    }

    const validSelections = selected.filter((entry) => spValidation.validIds.has(entry.spId));
    if (!validSelections.length) {
      return NextResponse.json({ ok: false, error: "No selected SPs could be validated for this organization." }, { status: 400 });
    }

    const existingResult = await loadAssignments(client, eventId, eventOrganizationId || undefined);
    if (existingResult.error) {
      logStaffingSelection("assignment-load", existingResult.error, { eventId });
      return NextResponse.json({ ok: false, error: "Could not load existing staffing before saving selections." }, { status: 500 });
    }

    const existingBySpId = new Map<string, AssignmentRow>();
    existingResult.assignments.forEach((assignment) => {
      const spId = asText(assignment.sp_id);
      if (spId && !existingBySpId.has(spId)) existingBySpId.set(spId, assignment);
    });

    const now = new Date().toISOString();
    const updated: string[] = [];
    const inserted: string[] = [];
    const skippedConfirmed: string[] = [];
    const skippedUnavailable: string[] = [];

    for (const selection of validSelections) {
      const existing = existingBySpId.get(selection.spId) || null;
      if (isConfirmedAssignment(existing)) {
        skippedConfirmed.push(selection.spId);
        continue;
      }
      if (isUnavailableAssignment(existing)) {
        skippedUnavailable.push(selection.spId);
        continue;
      }

      const status = selection.assignmentType === "backup" ? "backup" : "contacted";
      const roleName = selection.assignmentType;
      const notes = upsertHireConfirmationBlock(existing?.notes, {
        source: asText(body?.source) || "hire_confirmation",
        confirmation_status: "pending",
        assignment_type: selection.assignmentType,
        email: selection.email,
        name: selection.name,
        selected_at: now,
      });
      const updatePayload = {
        status,
        assignment_status: status,
        role_name: roleName,
        confirmed: false,
        notes: notes || null,
        last_contacted_at: now,
        contact_method: "email",
      };

      if (existing?.id) {
        const updateResult = await client.from("event_sps").update(updatePayload).eq("event_id", eventId).eq("sp_id", selection.spId);
        if (updateResult.error) {
          logStaffingSelection("assignment-update", updateResult.error, { eventId, spId: selection.spId });
          return NextResponse.json({ ok: false, error: publicError(updateResult.error, "Could not save pending staffing selections.") }, { status: 500 });
        }
        updated.push(selection.spId);
      } else {
        const insertPayload = {
          event_id: eventId,
          ...(eventOrganizationId ? { organization_id: eventOrganizationId } : {}),
          sp_id: selection.spId,
          ...updatePayload,
        };
        let insertResult = await client.from("event_sps").insert(insertPayload);
        if (insertResult.error && eventOrganizationId && isMissingColumnError(insertResult.error, "organization_id")) {
          const fallbackInsertPayload = { ...insertPayload };
          delete fallbackInsertPayload.organization_id;
          insertResult = await client.from("event_sps").insert(fallbackInsertPayload);
        }
        if (insertResult.error) {
          logStaffingSelection("assignment-insert", insertResult.error, { eventId, spId: selection.spId });
          return NextResponse.json({ ok: false, error: publicError(insertResult.error, "Could not save pending staffing selections.") }, { status: 500 });
        }
        inserted.push(selection.spId);
      }
    }

    const refreshed = await loadAssignments(client, eventId, eventOrganizationId || undefined);
    if (refreshed.error) {
      logStaffingSelection("assignment-refresh", refreshed.error, { eventId });
      return NextResponse.json({ ok: false, error: "Selections were saved, but CFSP could not reload staffing yet." }, { status: 500 });
    }

    const pendingPrimary = validSelections.filter((entry) => entry.assignmentType === "primary" && !skippedConfirmed.includes(entry.spId) && !skippedUnavailable.includes(entry.spId)).length;
    const pendingBackup = validSelections.filter((entry) => entry.assignmentType === "backup" && !skippedConfirmed.includes(entry.spId) && !skippedUnavailable.includes(entry.spId)).length;

    return NextResponse.json({
      ok: true,
      assignments: refreshed.assignments,
      summary: {
        selected: pendingPrimary + pendingBackup,
        primaryPending: pendingPrimary,
        backupPending: pendingBackup,
        inserted: inserted.length,
        updated: updated.length,
        skippedConfirmed: skippedConfirmed.length,
        skippedUnavailable: skippedUnavailable.length,
      },
    });
  } catch (error) {
    logStaffingSelection("catch", error, { exactError: exactSupabaseError(error) });
    return NextResponse.json({ ok: false, error: "Could not save pending Hire Confirmation selections." }, { status: 500 });
  }
}

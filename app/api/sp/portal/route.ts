import { createSupabaseAdminClient } from "../../../lib/supabaseAdminClient";
import {
  createSupabaseUserClient,
  getOrganizationContext,
  requireActiveOrganization,
} from "../../../lib/organizationAuth";
import { persistSpAccountLink, resolveSpAccountLink, type SpAccountLink } from "../../../lib/spAccountLinking";
import {
  getSpCommunicationPreference,
  withoutSpCommunicationNotes,
} from "../../../lib/spCommunicationPreferences";
import { parseSpPortalAcknowledgments } from "../../../lib/spPortalAcknowledgments";
import { buildSpPortalCheckInSummary } from "../../../lib/spPortalCheckIn";
import { normalizeDemoSourceFileUrl } from "../../../lib/demoSourceFiles";
import {
  SAFE_SP_PORTAL_EVENT_NOTE_FALLBACK,
  sanitizeSpFacingPortalText,
} from "../../../lib/spFacingContentSafety";
import { parseTrainingEventMetadata } from "../../../lib/trainingEventNotes";
import {
  getSupabaseError,
  logShiftRouteFailure,
  PORTAL_VISIBILITIES,
  safeErrorJson,
  safeJson,
  SHIFT_OPENING_SELECT,
  SHIFT_RESPONSE_SELECT,
  SP_ATTENDANCE_SELECT,
} from "../../../lib/spShiftFoundation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type EventSummaryRow = {
  id?: string | null;
  name?: string | null;
  date_text?: string | null;
  location?: string | null;
  notes?: string | null;
  organization_id?: string | null;
};

type EventSessionRow = {
  event_id?: string | null;
  session_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  location?: string | null;
  room?: string | null;
};

type EventAssignmentRow = {
  id?: string | null;
  event_id?: string | null;
  sp_id?: string | null;
  status?: string | null;
  assignment_status?: string | null;
  role_name?: string | null;
  confirmed?: boolean | null;
  notes?: string | null;
  created_at?: string | null;
};

type SpPreviewRow = {
  id?: string | null;
  organization_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  working_email?: string | null;
  email?: string | null;
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeRole(value: unknown) {
  const role = asText(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (role === "sp" || role === "sim_op" || role === "admin" || role === "super_admin") return role;
  return "sp";
}

function isSpLikeContext(role: unknown, legacyRole: unknown) {
  return normalizeRole(role) === "sp" || normalizeRole(legacyRole) === "sp";
}

function isAdminViewer(context: {
  isPlatformOwner?: boolean;
  role?: unknown;
  legacyRole?: unknown;
}) {
  const role = normalizeRole(context.role);
  const legacyRole = normalizeRole(context.legacyRole);
  return context.isPlatformOwner || role === "admin" || legacyRole === "admin" || role === "super_admin" || legacyRole === "super_admin";
}

function getSpDisplayName(sp: SpPreviewRow | null | undefined) {
  return (
    asText(sp?.full_name) ||
    [asText(sp?.first_name), asText(sp?.last_name)].filter(Boolean).join(" ") ||
    "SP"
  );
}

async function loadPreviewSp(db: ReturnType<typeof createSupabaseUserClient>, args: {
  spId: string;
  organizationId: string;
  scopeByOrganization: boolean;
}) {
  const runQuery = async (withOrganizationScope: boolean) => {
    let query = db
      .from("sps")
      .select("id,organization_id,first_name,last_name,full_name,working_email,email")
      .eq("id", args.spId)
      .limit(1);
    if (withOrganizationScope && args.organizationId) query = query.eq("organization_id", args.organizationId);
    return query.maybeSingle();
  };

  let result = await runQuery(args.scopeByOrganization);
  if (result.error && args.scopeByOrganization && isMissingOrganizationColumnError(result.error)) {
    result = await runQuery(false);
  }
  if (result.error) throw result.error;
  const sp = (result.data || null) as SpPreviewRow | null;
  if (!sp) return null;
  if (args.scopeByOrganization && args.organizationId && asText(sp.organization_id) && asText(sp.organization_id) !== args.organizationId) {
    return null;
  }
  return sp;
}

function buildNoLinkDiagnostics(args: {
  userEmail?: string | null;
  profile: { full_name?: string | null; schedule_name?: string | null } | null;
  includeCandidates?: boolean;
  diagnostics?: {
    checkedFields?: string[];
    candidateCount?: number;
    candidates?: unknown;
    userEmail?: string | null;
    fullName?: string | null;
    scheduleMatchName?: string | null;
  } | null;
}) {
  const includeCandidates = args.includeCandidates === true;
  return {
    userEmail: args.diagnostics?.userEmail || asText(args.userEmail) || null,
    fullName: args.diagnostics?.fullName || asText(args.profile?.full_name) || null,
    scheduleMatchName:
      args.diagnostics?.scheduleMatchName ||
      asText(args.profile?.schedule_name) ||
      null,
    checkedFields: args.diagnostics?.checkedFields || [],
    candidateCount: args.diagnostics?.candidateCount || 0,
    candidates: includeCandidates ? args.diagnostics?.candidates : undefined,
  };
}

function isMissingOrganizationColumnError(error: unknown) {
  const source =
    error && typeof error === "object"
      ? (error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown })
      : {};
  const code = asText(source.code).toLowerCase();
  const text = [source.message, source.details, source.hint].map(asText).join(" ").toLowerCase();
  return code === "42703" || (text.includes("organization_id") && text.includes("does not exist"));
}

function parseDateKey(value: string | null) {
  const text = asText(value);
  if (!text) return Number.POSITIVE_INFINITY;
  const dt = new Date(`${text}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return Number.POSITIVE_INFINITY;
  return dt.getTime();
}

function parseDateTimeKey(dateValue: string | null, timeValue: string | null) {
  const dateText = asText(dateValue);
  if (!dateText) return Number.POSITIVE_INFINITY;
  const timeText = asText(timeValue) || "00:00:00";
  const dt = new Date(`${dateText}T${timeText}`);
  if (Number.isNaN(dt.getTime())) return parseDateKey(dateValue);
  return dt.getTime();
}

function isUpcomingEventSummary(event: { date?: string | null; start_time?: string | null; end_time?: string | null } | null) {
  if (!event) return false;
  const eventKey = parseDateTimeKey(event.date || null, event.end_time || event.start_time || null);
  if (eventKey === Number.POSITIVE_INFINITY) return true;
  return eventKey >= Date.now() - 12 * 60 * 60 * 1000;
}

function mapSessionsByEvent(rows: EventSessionRow[]) {
  const byEvent = new Map<string, EventSessionRow[]>();
  rows.forEach((row) => {
    const eventId = asText(row.event_id);
    if (!eventId) return;
    const current = byEvent.get(eventId) || [];
    current.push(row);
    byEvent.set(eventId, current);
  });
  byEvent.forEach((rowsForEvent, eventId) => {
    rowsForEvent.sort((a, b) => {
      const aDate = asText(a.session_date);
      const bDate = asText(b.session_date);
      if (aDate !== bDate) return aDate.localeCompare(bDate);
      return asText(a.start_time).localeCompare(asText(b.start_time));
    });
    byEvent.set(eventId, rowsForEvent);
  });
  return byEvent;
}

function toEventSummary(
  eventId: string,
  eventsById: Map<string, EventSummaryRow>,
  sessionsByEvent: Map<string, EventSessionRow[]>
) {
  const event = eventsById.get(eventId) || null;
  const sessions = sessionsByEvent.get(eventId) || [];
  const firstSession = sessions[0] || null;
  const lastSession = sessions[sessions.length - 1] || null;

  return {
    id: eventId,
    name: asText(event?.name) || "CFSP Event",
    date: asText(firstSession?.session_date) || asText(event?.date_text) || null,
    start_time: asText(firstSession?.start_time) || null,
    end_time: asText(lastSession?.end_time) || null,
    location: asText(firstSession?.location) || asText(event?.location) || null,
    room: asText(firstSession?.room) || null,
  };
}

function isAssignmentUpcomingStatus(status: string, confirmed: boolean) {
  if (confirmed) return true;
  if (!status) return false;
  if (status === "declined" || status === "no_show") return false;
  return status === "confirmed" || status === "contacted" || status === "invited" || status === "backup";
}

function normalizeAssignmentStatus(assignment: EventAssignmentRow) {
  return asText(assignment.status || assignment.assignment_status).toLowerCase();
}

function isConfirmedWorkAssignment(assignment: EventAssignmentRow) {
  const status = normalizeAssignmentStatus(assignment);
  if (status === "declined" || status === "no_show" || status === "cancelled" || status === "canceled") return false;
  return assignment.confirmed === true;
}

function stripCfspMetadataBlocks(notes?: string | null) {
  return asText(notes).replace(/\[(CFSP_[A-Z0-9_]+)\][\s\S]*?\[\/\1\]/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function cleanSpFacingNote(value: unknown) {
  const raw = asText(value);
  if (/CFSP_KEYSTONE_DEMO_FAKE_DATA|CFSP_SANDBOX_FAKE_DATA|fake poll\/opening|modeled after schedule/i.test(raw)) return "";
  const text = stripCfspMetadataBlocks(raw)
    .replace(/CFSP_KEYSTONE_DEMO_FAKE_DATA/gi, "")
    .replace(/CFSP_SANDBOX_FAKE_DATA/gi, "")
    .replace(/CFSP_[A-Z0-9_:-]+/g, "");
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      if (/^(event|date|time|location|room|coverage|source|context source|draft source)\s*:/i.test(line)) return false;
      if (/hidden|metadata|internal|demo fake data/i.test(line)) return false;
      if (!/[A-Za-z]{2,}/.test(line)) return false;
      if (/^[a-z]/.test(line) && !/[.!?]$/.test(line)) return false;
      return true;
    })
    .join("\n")
    .trim();
}

function getFirstNoteValue(notes: string | null | undefined, labels: string[]) {
  const text = stripCfspMetadataBlocks(notes);
  if (!text) return "";
  const escapedLabels = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`^(?:${escapedLabels.join("|")})\\s*:\\s*(.+)$`, "im");
  return asText(text.match(pattern)?.[1]);
}

function isYesLike(value: unknown) {
  const text = asText(value).toLowerCase();
  return text === "yes" || text === "true" || text === "1" || text === "enabled" || text === "ready";
}

function normalizeMaterialStatus(value: unknown) {
  return asText(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function materialsAreReleased(value: unknown) {
  const status = normalizeMaterialStatus(value);
  return status === "materials_ready" || status === "ready";
}

function normalizeExternalHref(value: unknown) {
  const text = asText(value);
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) return text;
  if (/^[^@\s]+\.(zoom\.us|teams\.microsoft\.com|office\.com|sharepoint\.com)\b/i.test(text)) return `https://${text}`;
  return "";
}

function getFilenameFromUrl(value: unknown) {
  const text = asText(value);
  if (!text) return "";
  const clean = text.split(/[?#]/)[0] || "";
  const part = clean.split("/").filter(Boolean).pop() || "";
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

function buildMaterialUrl(eventId: string, rawUrl: unknown, storagePath: unknown, fileName: unknown) {
  const path = asText(storagePath);
  if (path) {
    const params = new URLSearchParams({
      eventId,
      path,
      filename: asText(fileName) || getFilenameFromUrl(path) || "training-material",
      mode: "download",
    });
    return `/api/uploads/training-material?${params.toString()}`;
  }
  const demoSafeUrl = normalizeDemoSourceFileUrl(rawUrl);
  if (demoSafeUrl.startsWith("/")) return demoSafeUrl;
  return normalizeExternalHref(demoSafeUrl);
}

function parseCaseFileEntries(value: unknown) {
  const text = asText(value);
  if (!text) return [] as Array<{ name: string; url: string; storagePath: string; status: string }>;
  const spReleaseBlockedStatuses = new Set([
    "inactive",
    "admin_only",
    "internal",
    "not_sp_facing",
    "pending_final_review",
  ]);
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => {
        const record = (entry || {}) as Record<string, unknown>;
        const url = asText(record.url || record.fileUrl || record.documentUrl);
        const storagePath = asText(record.storagePath || record.storage_path);
        const name = asText(record.name || record.documentName) || getFilenameFromUrl(url) || getFilenameFromUrl(storagePath);
        return {
          name,
          url,
          storagePath,
          status: asText(record.status).toLowerCase() || "active",
        };
      })
      .filter((entry) => !spReleaseBlockedStatuses.has(entry.status) && (entry.name || entry.url || entry.storagePath));
  } catch {
    return [];
  }
}

function buildReleasedMaterials(
  eventId: string,
  metadata: ReturnType<typeof parseTrainingEventMetadata>,
  options: { includeCaseFiles: boolean; includeTrainingMaterials: boolean }
) {
  if (!materialsAreReleased(metadata.event_material_status)) return [];

  const caseEntries = options.includeCaseFiles
    ? parseCaseFileEntries(metadata.case_manager_cases || metadata.case_files)
      .map((entry, index) => ({
        key: `case-${index}`,
        label: "Case file",
        name: entry.name || `Case ${index + 1}`,
        url: buildMaterialUrl(eventId, entry.url, entry.storagePath, entry.name),
      }))
    : [];
  const legacyCaseUrl = buildMaterialUrl(eventId, metadata.case_file_url, metadata.case_file_storage_path, metadata.case_file_name || metadata.case_name);
  const supplementalUrl = options.includeTrainingMaterials
    ? buildMaterialUrl(eventId, metadata.supplemental_doc_url, metadata.supplemental_doc_storage_path, metadata.supplemental_doc_name)
    : "";
  const materials = [
    ...caseEntries,
    options.includeCaseFiles && !caseEntries.length && legacyCaseUrl
      ? {
          key: "case",
          label: "Case file",
          name: asText(metadata.case_file_name || metadata.case_name) || getFilenameFromUrl(metadata.case_file_url) || "Case file",
          url: legacyCaseUrl,
        }
      : null,
    supplementalUrl
      ? {
          key: "supplemental",
          label: "Training material",
          name: asText(metadata.supplemental_doc_name) || getFilenameFromUrl(metadata.supplemental_doc_url) || "Supplemental material",
          url: supplementalUrl,
        }
      : null,
  ].filter((item): item is { key: string; label: string; name: string; url: string } => Boolean(item?.url));

  return materials;
}

function buildScheduleRelease(metadata: ReturnType<typeof parseTrainingEventMetadata>) {
  const released = isYesLike(metadata.schedule_preview_enabled_for_sps);
  return {
    released,
    status: released ? asText(metadata.schedule_status || metadata.rotation_schedule_status) || "Available" : "not_released",
    roundCount: asText(metadata.schedule_round_count),
    roomCount: asText(metadata.schedule_room_count),
    encounterMinutes: asText(metadata.schedule_encounter_minutes),
    feedbackMinutes: asText(metadata.schedule_feedback_minutes),
    transitionMinutes: asText(metadata.schedule_transition_minutes),
  };
}

function releaseGateEnabled(value: unknown) {
  return isYesLike(value);
}

function parseVirtualAccessMetadata(value: unknown) {
  const text = asText(value);
  if (!text) return { eventUrl: "", trainingUrl: "" };
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { eventUrl: "", trainingUrl: "" };
    const record = parsed as Record<string, unknown>;
    return {
      eventUrl: normalizeExternalHref(record.event_url),
      trainingUrl: normalizeExternalHref(record.training_url),
    };
  } catch {
    return { eventUrl: "", trainingUrl: "" };
  }
}

export async function GET(request: Request) {
  const context = await getOrganizationContext();
  if (!context.user) return safeErrorJson("unauthorized", "Authentication is required.", 401, context);
  const currentUser = context.user;
  if (!requireActiveOrganization(context)) {
    return safeErrorJson("forbidden", "No active organization membership is available for this account.", 403, context);
  }

  const db = createSupabaseAdminClient() || createSupabaseUserClient(context.accessToken);
  const activeOrganizationId = asText(context.activeOrganization?.id);
  const previewSpId = asText(new URL(request.url).searchParams.get("previewSpId"));
  const isAdmin = isAdminViewer(context);
  const membershipSpId = asText(
    (
      context.memberships.find(
        (membership) =>
          asText(membership.user_id) === asText(currentUser.id) &&
          asText(membership.organization_id) === activeOrganizationId
      ) as { sp_id?: unknown } | undefined
    )?.sp_id
  );
  let link: SpAccountLink = await resolveSpAccountLink({
    user: currentUser,
    profile: context.profile || null,
    accessToken: context.accessToken,
    organizationId: activeOrganizationId || null,
    membershipSpId: membershipSpId || null,
  });
  let linkedSpId = asText(link.sp_id);
  let adminPreview: {
    enabled: true;
    spId: string;
    spName: string;
    viewerEmail: string | null;
    viewerRole: string | null;
  } | null = null;

  if (previewSpId) {
    if (!isAdmin) {
      return safeErrorJson("forbidden", "Only admins can preview the SP portal as another SP.", 403, context);
    }
    const previewSp = await loadPreviewSp(db, {
      spId: previewSpId,
      organizationId: activeOrganizationId,
      scopeByOrganization: Boolean(context.schemaAvailable && activeOrganizationId),
    });
    if (!previewSp) {
      return safeErrorJson("not_found", "SP profile was not found in this organization.", 404, context);
    }
    const previewSpName = getSpDisplayName(previewSp);
    link = {
      status: "linked",
      sp_id: previewSpId,
      sp_name: previewSpName,
      matched_by: "saved_link",
    };
    linkedSpId = previewSpId;
    adminPreview = {
      enabled: true,
      spId: previewSpId,
      spName: previewSpName,
      viewerEmail: asText(context.user?.email) || null,
      viewerRole: asText(context.role || context.legacyRole) || null,
    };
  }

  const isSpUser = isSpLikeContext(context.role, context.legacyRole);
  if (!isSpUser && !linkedSpId) {
    return safeJson(
      {
        ok: false,
        error: "sp_profile_not_linked",
        message:
          "We could not find an SP profile linked to your account. Please contact your simulation program coordinator.",
        admin_view: isAdmin,
        ...(isAdmin
          ? {
              diagnostics: buildNoLinkDiagnostics({
                userEmail: context.user?.email,
                profile: context.profile || null,
                diagnostics: link.diagnostics,
                includeCandidates: true,
              }),
            }
          : {}),
      },
      { status: 404 },
      context
    );
  }

  if (!linkedSpId) {
    if (!isAdmin) {
      return safeJson(
        {
          ok: false,
          error: "sp_profile_not_linked",
          message:
            "We could not find an SP profile linked to your account. Please contact your simulation program coordinator.",
          admin_view: false,
          diagnostics: buildNoLinkDiagnostics({
            userEmail: context.user?.email,
            profile: context.profile || null,
            diagnostics: link.diagnostics,
          }),
        },
        { status: 404 },
        context
      );
    }

    return safeJson(
      {
        ok: false,
        error: "sp_profile_not_linked",
        message: "Could not resolve a unique SP directory match.",
        admin_view: true,
        diagnostics: buildNoLinkDiagnostics({
          userEmail: context.user?.email,
          profile: context.profile || null,
          diagnostics: link.diagnostics,
          includeCandidates: true,
        }),
      },
      { status: 404 },
      context
    );
  }

  if (!adminPreview && context.accessToken) {
    const persistError = await persistSpAccountLink({
      user: context.user,
      link,
      accessToken: context.accessToken,
    });
    if (persistError) {
      console.error("[sp portal] failed to persist SP link", {
        error: persistError,
        userEmail: context.user.email,
      });
    }
  }

  try {
    const [responsesResult, attendanceResult, openOpeningsResult, assignmentsResult] = await Promise.all([
      db
        .from("event_shift_responses")
        .select(SHIFT_RESPONSE_SELECT)
        .eq("sp_id", linkedSpId)
        .order("updated_at", { ascending: false }),
      db
        .from("event_sp_attendance")
        .select(SP_ATTENDANCE_SELECT)
        .eq("sp_id", linkedSpId)
        .order("updated_at", { ascending: false }),
      db
        .from("event_shift_openings")
        .select(SHIFT_OPENING_SELECT)
        .eq("status", "open")
        .in("visibility", Array.from(PORTAL_VISIBILITIES))
        .order("shift_date", { ascending: true })
        .order("start_time", { ascending: true }),
      db
        .from("event_sps")
        .select("id,event_id,sp_id,status,assignment_status,role_name,confirmed,notes,created_at")
        .eq("sp_id", linkedSpId)
        .order("created_at", { ascending: false }),
    ]);

    if (responsesResult.error) throw responsesResult.error;
    if (attendanceResult.error) throw attendanceResult.error;
    if (openOpeningsResult.error) throw openOpeningsResult.error;
    if (assignmentsResult.error) throw assignmentsResult.error;

    const allResponses = (responsesResult.data || []) as Record<string, unknown>[];
    const allAttendance = (attendanceResult.data || []) as Record<string, unknown>[];
    const openOpenings = (openOpeningsResult.data || []) as Record<string, unknown>[];
    const allAssignments = (assignmentsResult.data || []) as EventAssignmentRow[];

    const openingIds = Array.from(
      new Set(
        [
          ...openOpenings.map((opening) => asText(opening.id)),
          ...allResponses.map((response) => asText(response.opening_id)),
        ].filter(Boolean)
      )
    );

    let allOpenings = [...openOpenings];
    const missingOpeningIds = openingIds.filter((openingId) => !allOpenings.some((opening) => asText(opening.id) === openingId));
    if (missingOpeningIds.length) {
      const openingsResult = await db
        .from("event_shift_openings")
        .select(SHIFT_OPENING_SELECT)
        .in("id", missingOpeningIds);
      if (openingsResult.error) throw openingsResult.error;
      allOpenings = [...allOpenings, ...((openingsResult.data || []) as Record<string, unknown>[])];
    }

    const eventIds = Array.from(
      new Set(
        [
          ...allOpenings.map((opening) => asText(opening.event_id)),
          ...allResponses.map((response) => asText(response.event_id)),
          ...allAttendance.map((row) => asText(row.event_id)),
          ...allAssignments.map((assignment) => asText(assignment.event_id)),
        ].filter(Boolean)
      )
    );

    const organizationScopeEnabled = Boolean(context.schemaAvailable && activeOrganizationId);
    const eventsById = new Map<string, EventSummaryRow>();
    let canScopeByOrganization = organizationScopeEnabled;

    if (eventIds.length) {
      const runEventsQuery = async (withOrganizationScope: boolean) => {
        let query = db
          .from("events")
          .select("id,name,date_text,location,notes,organization_id")
          .in("id", eventIds);
        if (withOrganizationScope && activeOrganizationId) {
          query = query.or(`organization_id.eq.${activeOrganizationId},organization_id.is.null`);
        }
        return query;
      };

      let eventsResult = await runEventsQuery(canScopeByOrganization);
      if (eventsResult.error && canScopeByOrganization && isMissingOrganizationColumnError(eventsResult.error)) {
        canScopeByOrganization = false;
        eventsResult = await runEventsQuery(false);
      }
      if (eventsResult.error) throw eventsResult.error;

      ((eventsResult.data || []) as EventSummaryRow[]).forEach((event) => {
        const eventId = asText(event.id);
        if (!eventId) return;
        eventsById.set(eventId, event);
      });
    }

    const allowedEventIds = new Set(eventsById.keys());
    const openingsById = new Map<string, Record<string, unknown>>();
    allOpenings
      .filter((opening) => allowedEventIds.has(asText(opening.event_id)))
      .forEach((opening) => {
        const openingId = asText(opening.id);
        if (!openingId) return;
        openingsById.set(openingId, opening);
      });

    const filteredResponses = allResponses.filter((response) => {
      const eventId = asText(response.event_id) || asText(openingsById.get(asText(response.opening_id))?.event_id);
      return Boolean(eventId && allowedEventIds.has(eventId));
    });
    const filteredAttendance = allAttendance.filter((record) => {
      const eventId = asText(record.event_id);
      return Boolean(eventId && allowedEventIds.has(eventId));
    });
    const filteredAssignments = allAssignments.filter((assignment) => {
      const eventId = asText(assignment.event_id);
      return Boolean(eventId && allowedEventIds.has(eventId));
    });

    let sessionsByEvent = new Map<string, EventSessionRow[]>();
    if (allowedEventIds.size) {
      const sessionsResult = await db
        .from("event_sessions")
        .select("event_id,session_date,start_time,end_time,location,room")
        .in("event_id", Array.from(allowedEventIds));
      if (sessionsResult.error) throw sessionsResult.error;
      sessionsByEvent = mapSessionsByEvent((sessionsResult.data || []) as EventSessionRow[]);
    }

    const latestResponseByOpening = new Map<string, Record<string, unknown>>();
    filteredResponses.forEach((row) => {
      const openingId = asText(row.opening_id);
      if (!openingId || latestResponseByOpening.has(openingId)) return;
      latestResponseByOpening.set(openingId, row);
    });

    const attendanceByEvent = new Map<string, Record<string, unknown>>();
    filteredAttendance.forEach((row) => {
      const eventId = asText(row.event_id);
      if (!eventId || attendanceByEvent.has(eventId)) return;
      attendanceByEvent.set(eventId, row);
    });

    const openShifts = Array.from(openingsById.values())
      .filter((opening) => asText(opening.status) === "open" && PORTAL_VISIBILITIES.has(asText(opening.visibility)))
      .sort((a, b) => {
        const dateCompare = asText(a.shift_date).localeCompare(asText(b.shift_date));
        if (dateCompare !== 0) return dateCompare;
        return asText(a.start_time).localeCompare(asText(b.start_time));
      })
      .map((opening) => {
        const openingId = asText(opening.id);
        const eventId = asText(opening.event_id);
        const existingResponse = latestResponseByOpening.get(openingId) || null;
        return {
          openingId,
          title: asText(opening.title) || "Standardized Patient Shift",
          shift_date: asText(opening.shift_date) || null,
          start_time: asText(opening.start_time) || null,
          end_time: asText(opening.end_time) || null,
          location: asText(opening.location) || null,
          room: asText(opening.room) || null,
          needed_count: Number(opening.needed_count || 0) || 0,
          requirements: cleanSpFacingNote(opening.requirements) || null,
          notes: cleanSpFacingNote(opening.notes) || null,
          event: toEventSummary(eventId, eventsById, sessionsByEvent),
          currentResponse: existingResponse
            ? {
                id: asText(existingResponse.id),
                response: asText(existingResponse.response) || null,
                source: asText(existingResponse.source) || null,
                responded_at: asText(existingResponse.responded_at) || null,
                updated_at: asText(existingResponse.updated_at) || null,
              }
            : null,
        };
      });

    const myResponses = filteredResponses.map((row) => {
      const openingId = asText(row.opening_id);
      const opening = openingsById.get(openingId) || null;
      const eventId = asText(row.event_id) || asText(opening?.event_id);
      return {
        id: asText(row.id),
        openingId: openingId || null,
        response: asText(row.response) || null,
        source: asText(row.source) || null,
        message: asText(row.message) || null,
        responded_at: asText(row.responded_at) || null,
        updated_at: asText(row.updated_at) || null,
        opening: opening
          ? {
              id: asText(opening.id),
              title: asText(opening.title) || "Standardized Patient Shift",
              shift_date: asText(opening.shift_date) || null,
              start_time: asText(opening.start_time) || null,
              end_time: asText(opening.end_time) || null,
              location: asText(opening.location) || null,
              room: asText(opening.room) || null,
            }
          : null,
        event: eventId ? toEventSummary(eventId, eventsById, sessionsByEvent) : null,
      };
    });

    const myAttendance = filteredAttendance.map((row) => {
      const eventId = asText(row.event_id);
      const eventSummary = eventId ? toEventSummary(eventId, eventsById, sessionsByEvent) : null;
      const metadata = parseTrainingEventMetadata(eventsById.get(eventId)?.notes);
      return {
        id: asText(row.id),
        eventId: eventId || null,
        status: asText(row.status) || "not_arrived",
        checked_in_at: asText(row.checked_in_at) || null,
        checked_out_at: asText(row.checked_out_at) || null,
        event: eventSummary,
        checkIn: buildSpPortalCheckInSummary(row, eventSummary, metadata),
      };
    });

    const assignmentUpcomingItems = filteredAssignments
      .filter(isConfirmedWorkAssignment)
      .map((assignment) => {
        const eventId = asText(assignment.event_id);
        const status = asText(assignment.status).toLowerCase();
        const confirmed = assignment.confirmed === true;
        return {
          id: asText(assignment.id),
          eventId,
          status: status || null,
          confirmed,
          created_at: asText(assignment.created_at) || null,
          event: eventId ? toEventSummary(eventId, eventsById, sessionsByEvent) : null,
        };
      })
      .filter((item) => item.event && isAssignmentUpcomingStatus(asText(item.status), item.confirmed))
      .sort((a, b) => {
        const aKey = parseDateTimeKey(a.event?.date || null, a.event?.start_time || null);
        const bKey = parseDateTimeKey(b.event?.date || null, b.event?.start_time || null);
        if (aKey !== bKey) return aKey - bKey;
        return asText(a.event?.name).localeCompare(asText(b.event?.name));
      });

    const assignedEvents = filteredAssignments
      .filter(isConfirmedWorkAssignment)
      .map((assignment) => {
        const eventId = asText(assignment.event_id);
        const event = eventId ? eventsById.get(eventId) || null : null;
        const metadata = parseTrainingEventMetadata(event?.notes);
        const eventSummary = eventId ? toEventSummary(eventId, eventsById, sessionsByEvent) : null;
        const attendance = attendanceByEvent.get(eventId) || null;
        const trainingStart = asText(metadata.training_start_time || metadata.preferred_training_time);
        const trainingEnd = asText(metadata.training_end_time || metadata.preferred_training_end_time);
        const trainingDate = asText(metadata.training_date || metadata.preferred_training_date || metadata.imported_training_date);
        const virtualAccess = parseVirtualAccessMetadata(metadata.virtual_access);
        const materialStatus = normalizeMaterialStatus(metadata.event_material_status);
        const releaseArrival = releaseGateEnabled(metadata.sp_portal_release_arrival_instructions);
        const releaseLocation = releaseGateEnabled(metadata.sp_portal_release_location);
        const releaseVirtualAccess = releaseGateEnabled(metadata.sp_portal_release_virtual_access);
        const releaseTrainingDetails = releaseGateEnabled(metadata.sp_portal_release_training_details);
        const releaseRoleCase = releaseGateEnabled(metadata.sp_portal_release_role_case);
        const releaseCaseFiles = releaseGateEnabled(metadata.sp_portal_release_case_files);
        const releaseTrainingMaterials = releaseGateEnabled(metadata.sp_portal_release_training_materials);
        const materialFiles = buildReleasedMaterials(eventId, metadata, {
          includeCaseFiles: releaseCaseFiles,
          includeTrainingMaterials: releaseTrainingMaterials,
        });
        const materialsReleased = materialsAreReleased(metadata.event_material_status) && (releaseCaseFiles || releaseTrainingMaterials);
        const schedule = buildScheduleRelease(metadata);
        const portalArrivalInstructions = sanitizeSpFacingPortalText(metadata.sp_portal_arrival_instructions);
        const portalTrainingInstructions = sanitizeSpFacingPortalText(metadata.sp_portal_training_instructions);
        const portalEventNote = sanitizeSpFacingPortalText(
          metadata.sp_portal_event_note,
          SAFE_SP_PORTAL_EVENT_NOTE_FALLBACK
        );
        const portalRoleCaseNote = sanitizeSpFacingPortalText(metadata.sp_portal_role_case_note);
        const releasedAnyPortalDetail = Boolean(
          releaseArrival ||
            releaseLocation ||
            releaseVirtualAccess ||
            releaseTrainingDetails ||
            releaseRoleCase ||
            releaseCaseFiles ||
            releaseTrainingMaterials ||
            schedule.released
        );
        const trainingLink = releaseTrainingDetails
          ? virtualAccess.trainingUrl || normalizeExternalHref(metadata.training_zoom_link)
          : "";
        const eventVirtualLink = releaseVirtualAccess
          ? virtualAccess.eventUrl || normalizeExternalHref(metadata.zoom_url)
          : "";
        const eventForPortal = eventSummary
          ? {
              ...eventSummary,
              location: releaseLocation ? eventSummary.location : null,
              room: releaseLocation ? eventSummary.room : null,
            }
          : null;

        return {
          id: asText(assignment.id),
          assignmentId: asText(assignment.id),
          eventId,
          status: normalizeAssignmentStatus(assignment) || (assignment.confirmed ? "confirmed" : "scheduled"),
          confirmed: assignment.confirmed === true,
          acknowledgments: parseSpPortalAcknowledgments(assignment.notes),
          role: releaseRoleCase ? asText(assignment.role_name) || null : null,
          event: eventForPortal,
          location: releaseLocation ? asText(eventSummary?.location) || null : null,
          virtualLink: eventVirtualLink || null,
          arrivalInstructions: releaseArrival
            ? portalArrivalInstructions || getFirstNoteValue(event?.notes, [
                "Arrival Instructions",
                "Arrival",
                "Report Instructions",
                "Reporting Instructions",
                "Report Time",
                "Call Time",
              ]) || null
            : null,
          eventNote: releasedAnyPortalDetail ? portalEventNote || null : null,
          reportCallTime: releaseArrival ? asText(metadata.sp_report_call_time) || null : null,
          releaseEndTime: releaseArrival ? asText(metadata.sp_release_end_time) || null : null,
          training: releaseTrainingDetails && (trainingDate || trainingStart || trainingEnd || trainingLink || portalTrainingInstructions)
            ? {
                date: trainingDate || null,
                start_time: trainingStart || null,
                end_time: trainingEnd || null,
                instructions: portalTrainingInstructions || null,
                link: trainingLink || null,
                password: trainingLink ? asText(metadata.training_password) || null : null,
              }
            : null,
          caseInfo: releaseRoleCase && (asText(metadata.case_name) || portalRoleCaseNote)
            ? {
                name: asText(metadata.case_name) || null,
                note: portalRoleCaseNote || null,
              }
            : null,
          materials: materialFiles,
          materialsReleased,
          materialStatus: materialStatus || null,
          schedule,
          attendance: attendance
            ? {
                id: asText(attendance.id),
                status: asText(attendance.status) || "not_arrived",
                checked_in_at: asText(attendance.checked_in_at) || null,
                checked_out_at: asText(attendance.checked_out_at) || null,
                updated_at: asText(attendance.updated_at) || null,
                checkIn: buildSpPortalCheckInSummary(attendance, eventSummary, metadata),
              }
            : null,
          checkIn: buildSpPortalCheckInSummary(attendance, eventSummary, metadata),
        };
      })
      .filter((item) => item.event && isUpcomingEventSummary(item.event))
      .sort((a, b) => {
        const aKey = parseDateTimeKey(a.event?.date || null, a.event?.start_time || null);
        const bKey = parseDateTimeKey(b.event?.date || null, b.event?.start_time || null);
        if (aKey !== bKey) return aKey - bKey;
        return asText(a.event?.name).localeCompare(asText(b.event?.name));
      });

    const acceptedResponseUpcomingItems = myResponses
      .filter((row) => asText(row.response).toLowerCase() === "accepted")
      .map((row) => {
        const opening = row.opening;
        const event = row.event;
        return {
          id: row.id,
          source: "accepted_response",
          response: row.response,
          openingId: row.openingId,
          openingTitle: opening?.title || "Standardized Patient Shift",
          shift_date: opening?.shift_date || null,
          start_time: opening?.start_time || null,
          end_time: opening?.end_time || null,
          event,
        };
      })
      .sort((a, b) => {
        const aKey = parseDateTimeKey(a.shift_date || a.event?.date || null, a.start_time || a.event?.start_time || null);
        const bKey = parseDateTimeKey(b.shift_date || b.event?.date || null, b.start_time || b.event?.start_time || null);
        if (aKey !== bKey) return aKey - bKey;
        return asText(a.event?.name).localeCompare(asText(b.event?.name));
      });

    const upcomingItems =
      assignmentUpcomingItems.length > 0
        ? assignmentUpcomingItems.map((item) => ({
            id: item.id,
            source: "assignment",
            status: item.status,
            confirmed: item.confirmed,
            created_at: item.created_at,
            event: item.event,
          }))
        : acceptedResponseUpcomingItems;
    const { preference: communicationPreference } = await getSpCommunicationPreference(db, {
      organizationId: activeOrganizationId,
      spId: linkedSpId,
      linked: true,
    });

    return safeJson(
      {
        ok: true,
        sp: {
          id: linkedSpId,
          name:
            asText(link.sp_name) ||
            asText(context.profile?.full_name) ||
            asText(context.profile?.schedule_name) ||
            asText(context.user.email) ||
            "SP",
        },
        openShifts,
        assignedEvents,
        myResponses,
        myAttendance,
        upcomingItems,
        communicationPreference: withoutSpCommunicationNotes(communicationPreference),
        admin_view: Boolean(adminPreview),
        adminPreview,
      },
      undefined,
      context
    );
  } catch (error) {
    logShiftRouteFailure("api/sp/portal GET", error, {
      userEmail: context.user?.email,
      linkedSpId,
      activeOrganizationId,
    });
    return safeErrorJson("server_error", "Could not load SP portal data.", 500, context, getSupabaseError(error));
  }
}

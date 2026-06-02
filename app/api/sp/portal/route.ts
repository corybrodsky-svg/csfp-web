import { createSupabaseAdminClient } from "../../../lib/supabaseAdminClient";
import {
  createSupabaseUserClient,
  getOrganizationContext,
  requireActiveOrganization,
} from "../../../lib/organizationAuth";
import { persistSpAccountLink, resolveSpAccountLink } from "../../../lib/spAccountLinking";
import {
  getSpCommunicationPreference,
  withoutSpCommunicationNotes,
} from "../../../lib/spCommunicationPreferences";
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
  confirmed?: boolean | null;
  created_at?: string | null;
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

export async function GET() {
  const context = await getOrganizationContext();
  if (!context.user) return safeErrorJson("unauthorized", "Authentication is required.", 401, context);
  const currentUser = context.user;
  if (!requireActiveOrganization(context)) {
    return safeErrorJson("forbidden", "No active organization membership is available for this account.", 403, context);
  }

  const db = createSupabaseAdminClient() || createSupabaseUserClient(context.accessToken);
  const activeOrganizationId = asText(context.activeOrganization?.id);
  const membershipSpId = asText(
    (
      context.memberships.find(
        (membership) =>
          asText(membership.user_id) === asText(currentUser.id) &&
          asText(membership.organization_id) === activeOrganizationId
      ) as { sp_id?: unknown } | undefined
    )?.sp_id
  );
  const link = await resolveSpAccountLink({
    user: currentUser,
    profile: context.profile || null,
    accessToken: context.accessToken,
    organizationId: activeOrganizationId || null,
    membershipSpId: membershipSpId || null,
  });
  const linkedSpId = asText(link.sp_id);
  const isAdmin = isAdminViewer(context);
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

  if (context.accessToken) {
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
        .select("id,event_id,sp_id,status,confirmed,created_at")
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
          .select("id,name,date_text,location,organization_id")
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
          requirements: asText(opening.requirements) || null,
          notes: asText(opening.notes) || null,
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
      return {
        id: asText(row.id),
        eventId: eventId || null,
        status: asText(row.status) || "not_arrived",
        checked_in_at: asText(row.checked_in_at) || null,
        checked_out_at: asText(row.checked_out_at) || null,
        event: eventId ? toEventSummary(eventId, eventsById, sessionsByEvent) : null,
      };
    });

    const assignmentUpcomingItems = filteredAssignments
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
        myResponses,
        myAttendance,
        upcomingItems,
        communicationPreference: withoutSpCommunicationNotes(communicationPreference),
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

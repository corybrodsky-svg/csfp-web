import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  AUTH_ACCESS_COOKIE,
  AUTH_REFRESH_COOKIE,
  setAuthCookies,
} from "../../lib/authCookies";
import { getDateSortValue, getImportedYearHint, normalizeLooseDateToIso } from "../../lib/eventDateUtils";
import { getProfileForUser, getProfilesByIds } from "../../lib/profileServer";
import { sanitizePublicErrorMessage } from "../../lib/safeErrorMessage";
import { resolveSpAccountLink } from "../../lib/spAccountLinking";
import { createSupabaseServerClient } from "../../lib/supabaseServerClient";
import { MINUTES_PER_DAY, normalizeEndMinutesForRange, parseTimeToMinutes } from "../../lib/timeFormat";
import {
  applyOrganizationAuthCookies,
  createSupabaseUserClient,
  forbiddenJson,
  getOrganizationContext,
  noActiveOrganizationJson,
  requireActiveOrganization,
  roleCanOperateOrganization,
  unauthorizedJson,
} from "../../lib/organizationAuth";

export const dynamic = "force-dynamic";

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseNumber(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function parseNullableText(value: unknown) {
  const text = asText(value);
  return text || null;
}

function getErrorMessage(error: unknown, fallback: string) {
  return sanitizePublicErrorMessage(
    error instanceof Error ? error.message : error,
    fallback
  );
}

function isConfirmedAssignment(assignment: { status: string | null; confirmed: boolean | null }) {
  const status = asText(assignment.status).toLowerCase();
  return status === "confirmed" || (!status && assignment.confirmed === true);
}

function normalizeRole(value: unknown) {
  const role = asText(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (role === "sp" || role === "faculty" || role === "sim_op" || role === "admin" || role === "super_admin") {
    return role;
  }
  return "unknown";
}

function getEffectiveRole(email: unknown, role: unknown) {
  const normalizedEmail = asText(email).toLowerCase();
  const localPart = normalizedEmail.split("@")[0] || "";
  if (localPart === "cory.brodsky") return "super_admin";
  if (normalizedEmail === "cwb55@drexel.edu") {
    const normalizedRole = normalizeRole(role);
    if (normalizedRole === "super_admin" || normalizedRole === "admin" || normalizedRole === "sim_op") {
      return normalizedRole;
    }
    return "admin";
  }
  return normalizeRole(role);
}

function normalizeEmail(value: unknown) {
  return asText(value).toLowerCase();
}

function normalizeMatchValue(value: unknown) {
  return asText(value).toLowerCase().replace(/\s+/g, " ").trim();
}

const CFSP_METADATA_BLOCK_PATTERN = /\[(CFSP_[A-Z0-9_]+)\][\s\S]*?\[\/\1\]/g;

function extractCfspMetadataBlocks(notes?: string | null) {
  const blocks = new Map<string, string>();
  const text = asText(notes);
  for (const match of text.matchAll(CFSP_METADATA_BLOCK_PATTERN)) {
    const blockKey = match[1];
    const blockText = match[0];
    if (blockKey && blockText) blocks.set(blockKey, blockText.trim());
  }
  return blocks;
}

function stripCfspMetadataBlocks(notes?: string | null) {
  return asText(notes).replace(CFSP_METADATA_BLOCK_PATTERN, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function mergeEventNotesPreservingMetadata(currentNotes?: string | null, incomingNotes?: string | null) {
  if (incomingNotes === null) return null;

  const currentBlocks = extractCfspMetadataBlocks(currentNotes);
  const incomingBlocks = extractCfspMetadataBlocks(incomingNotes);
  const mergedBlocks = new Map(currentBlocks);
  for (const [key, value] of incomingBlocks.entries()) mergedBlocks.set(key, value);

  const currentVisibleNotes = stripCfspMetadataBlocks(currentNotes);
  const incomingVisibleNotes = stripCfspMetadataBlocks(incomingNotes);
  const mergedVisibleNotes =
    incomingVisibleNotes || (incomingBlocks.size > 0 ? currentVisibleNotes : incomingVisibleNotes);

  const mergedSections = [...mergedBlocks.values(), mergedVisibleNotes].filter(Boolean);
  return mergedSections.length ? mergedSections.join("\n") : null;
}

type EventApiRow = {
  id: string;
  name: string | null;
  status: string | null;
  date_text: string | null;
  sp_needed: number | null;
  visibility: string | null;
  location: string | null;
  notes: string | null;
  created_at: string | null;
  owner_id?: string | null;
  owner_name?: string | null;
  schedule_owner_text?: string | null;
  assigned_sp_names?: string[] | null;
  assigned_sp_emails?: string[] | null;
  session_locations?: string[] | null;
};

type ViewerContext = {
  id: string;
  email: string;
  role: string;
  fullName: string;
  scheduleName: string;
  linkedSpId: string;
  refreshedSession?: {
    access_token: string;
    refresh_token: string;
  } | null;
};

type AssignmentApiRow = {
  id: string;
  event_id: string | null;
  sp_id: string | null;
  status: string | null;
  confirmed: boolean | null;
  created_at?: string | null;
};

type AssignedSpApiRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  working_email?: string | null;
  email?: string | null;
};

type EventSessionApiRow = {
  event_id: string | null;
  session_date: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  room: string | null;
};

type EventSessionInsertPayload = {
  event_id: string;
  organization_id?: string;
  session_date: string;
  start_time: string;
  end_time: string | null;
  location: string | null;
  room: string | null;
};

type SupabaseErrorLike = {
  message?: string | null;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
};

function extractScheduleOwnerText(notes: string | null) {
  const text = asText(notes);
  const patterns = [
    /(?:^|\n)Sim Team(?:\s*\/\s*Event Lead)?\s*:\s*(.+?)(?:\n|$)/i,
    /(?:^|\n)Event Lead\s*\/\s*Team:\s*(.+?)(?:\n|$)/i,
    /(?:^|\n)Event Lead\/Team:\s*(.+?)(?:\n|$)/i,
    /(?:^|\n)Event Lead:\s*(.+?)(?:\n|$)/i,
    /(?:^|\n)Sim Staff:\s*(.+?)(?:\n|$)/i,
    /(?:^|\n)Staff Hiring:\s*(.+?)(?:\n|$)/i,
    /(?:^|\n)Team:\s*(.+?)(?:\n|$)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = match ? asText(match[1]) : "";
    if (value && value.toLowerCase() !== "not assigned") return value;
  }

  return null;
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

function logEventsApiFailure(stage: string, error: unknown, extra?: Record<string, unknown>) {
  const source = toSupabaseError(error);
  console.error("[api/events] failed", {
    stage,
    message: source.message || "",
    code: source.code || "",
    details: source.details || "",
    hint: source.hint || "",
    ...(extra || {}),
  });
}

function isMissingColumnError(error: unknown, columnName: string) {
  const source = toSupabaseError(error);
  const message = asText(source.message).toLowerCase();
  const code = asText(source.code).toLowerCase();
  const target = columnName.toLowerCase();
  if (code === "42703") return true;
  if (!message) return false;
  return (
    message.includes(target) &&
    (message.includes("does not exist") ||
      message.includes("could not find") ||
      message.includes("schema cache") ||
      message.includes("column"))
  );
}

function isMissingOrganizationColumnError(error: unknown) {
  return isMissingColumnError(error, "organization_id");
}

function addDaysToIsoDate(value: string | null, days: number) {
  if (!value) return value;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  parsed.setDate(parsed.getDate() + days);
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(
    parsed.getDate()
  ).padStart(2, "0")}`;
}

function getSessionTimingRows(sessions: EventSessionApiRow[], fallbackYear?: number | null) {
  const rowsByDate = sessions.reduce<Map<string, EventSessionApiRow[]>>((map, session) => {
    const dateKey = normalizeLooseDateToIso(session.session_date, fallbackYear) || asText(session.session_date) || "date-tbd";
    map.set(dateKey, [...(map.get(dateKey) || []), session]);
    return map;
  }, new Map());
  const overnightDateKeys = new Set<string>();

  rowsByDate.forEach((dateSessions, dateKey) => {
    const parsedStarts = dateSessions
      .map((session) => parseTimeToMinutes(session.start_time))
      .filter((minutes): minutes is number => minutes !== null);
    const hasExplicitRollover = dateSessions.some((session) => {
      const start = parseTimeToMinutes(session.start_time);
      const end = parseTimeToMinutes(session.end_time);
      return start !== null && end !== null && end < start;
    });
    const hasLateAndEarlyStarts =
      parsedStarts.some((minutes) => minutes >= 18 * 60) &&
      parsedStarts.some((minutes) => minutes < 8 * 60);

    if (hasExplicitRollover || hasLateAndEarlyStarts) {
      overnightDateKeys.add(dateKey);
    }
  });

  return sessions.map((session, index) => {
    const normalizedDate = normalizeLooseDateToIso(session.session_date, fallbackYear);
    const dateKey = normalizedDate || asText(session.session_date) || "date-tbd";
    const startClockMinutes = parseTimeToMinutes(session.start_time);
    const endClockMinutes = parseTimeToMinutes(session.end_time);
    const isOvernightDate = overnightDateKeys.has(dateKey);
    const startsAfterMidnight =
      isOvernightDate && startClockMinutes !== null && startClockMinutes < 8 * 60;
    const normalizedStartMinutes =
      startClockMinutes === null
        ? Number.MAX_SAFE_INTEGER
        : startClockMinutes + (startsAfterMidnight ? MINUTES_PER_DAY : 0);
    let normalizedEndMinutes =
      startClockMinutes !== null
        ? normalizeEndMinutesForRange(startClockMinutes, endClockMinutes) ?? normalizedStartMinutes
        : endClockMinutes ?? normalizedStartMinutes;

    if (startsAfterMidnight && normalizedEndMinutes < MINUTES_PER_DAY) {
      normalizedEndMinutes += MINUTES_PER_DAY;
    }

    return {
      session,
      index,
      normalizedDate,
      dateSort: getDateSortValue(normalizedDate || session.session_date, fallbackYear),
      startMinutes: normalizedStartMinutes,
      endMinutes: normalizedEndMinutes,
      endDayOffset:
        Number.isFinite(normalizedEndMinutes) && normalizedEndMinutes < Number.MAX_SAFE_INTEGER
          ? Math.floor(Math.max(normalizedEndMinutes, 0) / MINUTES_PER_DAY)
          : 0,
    };
  });
}

async function getAuthenticatedViewer(): Promise<ViewerContext | null> {
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get(AUTH_ACCESS_COOKIE)?.value?.trim() || "";
    const refreshToken = cookieStore.get(AUTH_REFRESH_COOKIE)?.value?.trim() || "";

    if (!accessToken && !refreshToken) return null;

    const supabase = createSupabaseServerClient();
    let user = null as Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"] | null;
    let resolvedAccessToken = accessToken;
    let refreshedSession: ViewerContext["refreshedSession"] = null;

    if (accessToken) {
      const {
        data: { user: accessUser },
        error,
      } = await supabase.auth.getUser(accessToken);

      if (!error && accessUser) {
        user = accessUser;
      } else if (process.env.NODE_ENV !== "production") {
        console.error("[auth] /api/events access token validation failed", { hasError: Boolean(error) });
      }
    }

    if (!user && refreshToken) {
      const { data, error } = await supabase.auth.refreshSession({
        refresh_token: refreshToken,
      });

      const refreshedUser = data.user ?? data.session?.user ?? null;
      if (!error && data.session?.access_token && data.session.refresh_token && refreshedUser) {
        user = refreshedUser;
        resolvedAccessToken = data.session.access_token;
        refreshedSession = {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        };
      } else if (process.env.NODE_ENV !== "production") {
        console.error("[auth] /api/events refresh failed", {
          hasError: Boolean(error),
          hasSession: Boolean(data.session),
          hasUser: Boolean(refreshedUser),
        });
      }
    }

    if (!user) return null;

    const profileResult = await getProfileForUser(user.id, resolvedAccessToken);
    const profile = profileResult.profile;
    const email = asText(profile?.email) || asText(user.email);
    const spLink = await resolveSpAccountLink({
      user,
      profile: profile || null,
      accessToken: resolvedAccessToken,
    });

    return {
      id: user.id,
      email,
      role: getEffectiveRole(email, profile?.role || user.user_metadata?.role),
      fullName: asText(profile?.full_name) || asText(user.user_metadata?.full_name),
      scheduleName: asText(profile?.schedule_name) || asText(user.user_metadata?.schedule_name),
      linkedSpId: asText(spLink.sp_id),
      refreshedSession,
    };
  } catch {
    return null;
  }
}

function getViewerMatchedSpIds(sps: AssignedSpApiRow[], viewer: ViewerContext) {
  const emailCandidates = new Set([normalizeEmail(viewer.email)].filter(Boolean));
  const nameCandidates = new Set(
    [normalizeMatchValue(viewer.fullName), normalizeMatchValue(viewer.scheduleName)].filter(Boolean)
  );

  return sps
    .filter((sp) => {
      const spEmails = [normalizeEmail(sp.working_email), normalizeEmail(sp.email)].filter(Boolean);
      const spName =
        normalizeMatchValue(sp.full_name) ||
        normalizeMatchValue([sp.first_name, sp.last_name].map(asText).filter(Boolean).join(" "));

      return spEmails.some((email) => emailCandidates.has(email)) || (spName && nameCandidates.has(spName));
    })
    .map((sp) => sp.id);
}

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const isDashboardFallback = requestUrl.searchParams.get("dashboard_fallback") === "1";
    const organizationContext = await getOrganizationContext();
    if (!organizationContext.user) return unauthorizedJson(organizationContext);
    const hasActiveOrganization = requireActiveOrganization(organizationContext);
    if (!hasActiveOrganization) {
      logEventsApiFailure("no-active-organization-fallback", {
        message: "No active organization in context. Falling back to legacy unscoped events query.",
        accessStatus: organizationContext.accessStatus,
        schemaAvailable: organizationContext.schemaAvailable,
      });
    }

    const legacyViewer = await getAuthenticatedViewer();
    const viewer = {
      ...(legacyViewer || {
        id: organizationContext.user.id,
        email: asText(organizationContext.profile?.email) || asText(organizationContext.user.email),
        role: organizationContext.legacyRole,
        fullName: asText(organizationContext.profile?.full_name),
        scheduleName: asText(organizationContext.profile?.schedule_name),
        linkedSpId: "",
        refreshedSession: null,
      }),
      id: organizationContext.user.id,
      role: organizationContext.legacyRole,
    };
    if (!legacyViewer) {
      logEventsApiFailure("viewer-fallback", { message: "Legacy viewer resolution failed. Using organization context fallback." });
    }
    const activeOrganizationId = hasActiveOrganization ? organizationContext.activeOrganization!.id : null;
    const canIncludeLegacyUnscopedRows =
      organizationContext.isPlatformOwner ||
      organizationContext.role === "platform_owner" ||
      organizationContext.role === "org_admin" ||
      organizationContext.legacyRole === "super_admin" ||
      organizationContext.legacyRole === "admin";
    const canDegradeEnrichment =
      organizationContext.isPlatformOwner ||
      organizationContext.role === "platform_owner" ||
      organizationContext.role === "org_admin" ||
      organizationContext.role === "sim_ops" ||
      organizationContext.legacyRole === "super_admin" ||
      organizationContext.legacyRole === "admin" ||
      organizationContext.legacyRole === "sim_op";
    const responseWarnings: string[] = [];
    let organizationScopeEnabled = Boolean(organizationContext.schemaAvailable && activeOrganizationId);
    const supabaseServer = createSupabaseUserClient(organizationContext.accessToken);
    const applyOrganizationScope = <T>(query: T) => {
      if (!organizationScopeEnabled || !activeOrganizationId) return query;
      const scopedQuery = query as { eq: (column: string, value: string) => T; or: (filter: string) => T };
      if (canIncludeLegacyUnscopedRows) {
        return scopedQuery.or(`organization_id.eq.${activeOrganizationId},organization_id.is.null`);
      }
      return scopedQuery.eq("organization_id", activeOrganizationId);
    };

    const baseSelect = "id,name,status,date_text,sp_needed,visibility,location,notes,created_at";
    const ownerSelect = `${baseSelect},owner_id`;
    const runEventsQuery = async (includeOwner: boolean, scopedByOrganization: boolean) => {
      let query = supabaseServer
        .from("events")
        .select(includeOwner ? ownerSelect : baseSelect)
        .order("created_at", { ascending: false });
      if (scopedByOrganization && activeOrganizationId) {
        query = applyOrganizationScope(query);
      }
      const result = await query;
      return {
        data: (result.data as EventApiRow[] | null) || null,
        error: result.error as SupabaseErrorLike | null,
      };
    };
    let includeOwnerColumn = true;
    let eventsResult = await runEventsQuery(includeOwnerColumn, organizationScopeEnabled);

    if (eventsResult.error && isMissingColumnError(eventsResult.error, "owner_id")) {
      includeOwnerColumn = false;
      eventsResult = await runEventsQuery(includeOwnerColumn, organizationScopeEnabled);
    }

    if (eventsResult.error && organizationScopeEnabled && isMissingOrganizationColumnError(eventsResult.error)) {
      // TODO(cfsp-org-scoping): Remove this fallback once all production tables are migrated/backfilled with organization_id.
      logEventsApiFailure("events-scope-fallback", eventsResult.error, { table: "events", activeOrganizationId });
      organizationScopeEnabled = false;
      eventsResult = await runEventsQuery(includeOwnerColumn, false);
      if (eventsResult.error && includeOwnerColumn && isMissingColumnError(eventsResult.error, "owner_id")) {
        includeOwnerColumn = false;
        eventsResult = await runEventsQuery(includeOwnerColumn, false);
      }
    }

    if (eventsResult.error) {
      logEventsApiFailure("events-query", eventsResult.error, { activeOrganizationId, organizationScopeEnabled });
      return applyOrganizationAuthCookies(NextResponse.json(
        {
          ok: false,
          source: "events",
          status: "events_query_failed",
          error: getErrorMessage(eventsResult.error, "Could not load events right now."),
        },
        { status: 500 }
      ), organizationContext);
    }
    const data = (eventsResult.data as EventApiRow[] | null) || null;

    let assignmentsQuery = supabaseServer
      .from("event_sps")
      .select("id,event_id,sp_id,status,confirmed,created_at")
      .order("created_at", { ascending: true });
    if (organizationScopeEnabled && activeOrganizationId) assignmentsQuery = applyOrganizationScope(assignmentsQuery);
    let assignmentsResult = await assignmentsQuery;
    if (assignmentsResult.error && organizationScopeEnabled && isMissingOrganizationColumnError(assignmentsResult.error)) {
      logEventsApiFailure("event-sps-scope-fallback", assignmentsResult.error, {
        table: "event_sps",
        activeOrganizationId,
      });
      organizationScopeEnabled = false;
      assignmentsResult = await supabaseServer
        .from("event_sps")
        .select("id,event_id,sp_id,status,confirmed,created_at")
        .order("created_at", { ascending: true });
    }

    if (assignmentsResult.error) {
      logEventsApiFailure("event-sps-query", assignmentsResult.error, { activeOrganizationId, organizationScopeEnabled });
      if (!canDegradeEnrichment) {
        return applyOrganizationAuthCookies(NextResponse.json(
          {
            ok: false,
            source: "event_sps",
            status: "assignments_query_failed",
            error: getErrorMessage(assignmentsResult.error, "Could not load event assignments right now."),
          },
          { status: 500 }
        ), organizationContext);
      }
      responseWarnings.push("Event assignments could not be loaded; event list is shown without coverage details.");
    }
    const assignments = assignmentsResult.error ? [] : assignmentsResult.data;

    let sessionsQuery = supabaseServer
      .from("event_sessions")
      .select("event_id,session_date,start_time,end_time,location,room")
      .order("session_date", { ascending: true });
    if (organizationScopeEnabled && activeOrganizationId) sessionsQuery = applyOrganizationScope(sessionsQuery);
    let sessionsResult = await sessionsQuery;
    if (sessionsResult.error && organizationScopeEnabled && isMissingOrganizationColumnError(sessionsResult.error)) {
      logEventsApiFailure("event-sessions-scope-fallback", sessionsResult.error, {
        table: "event_sessions",
        activeOrganizationId,
      });
      organizationScopeEnabled = false;
      sessionsResult = await supabaseServer
        .from("event_sessions")
        .select("event_id,session_date,start_time,end_time,location,room")
        .order("session_date", { ascending: true });
    }

    if (sessionsResult.error) {
      logEventsApiFailure("event-sessions-query", sessionsResult.error, { activeOrganizationId, organizationScopeEnabled });
      if (!canDegradeEnrichment) {
        return applyOrganizationAuthCookies(NextResponse.json(
          {
            ok: false,
            source: "event_sessions",
            status: "sessions_query_failed",
            error: getErrorMessage(sessionsResult.error, "Could not load event sessions right now."),
          },
          { status: 500 }
        ), organizationContext);
      }
      responseWarnings.push("Event sessions could not be loaded; date and room details may be incomplete.");
    }
    const sessions = sessionsResult.error ? [] : sessionsResult.data;

    const assignedSpIds = Array.from(
      new Set((assignments || []).map((assignment) => asText(assignment.sp_id)).filter(Boolean))
    );
    let sps: AssignedSpApiRow[] | null = [];
    let spsError: unknown = null;
    if (assignedSpIds.length) {
      let spsQuery = supabaseServer
        .from("sps")
        .select("id,first_name,last_name,full_name,working_email,email")
        .in("id", assignedSpIds);
      if (organizationScopeEnabled && activeOrganizationId) spsQuery = applyOrganizationScope(spsQuery);
      let spsResult = await spsQuery;
      if (spsResult.error && organizationScopeEnabled && isMissingOrganizationColumnError(spsResult.error)) {
        logEventsApiFailure("sps-scope-fallback", spsResult.error, { table: "sps", activeOrganizationId });
        organizationScopeEnabled = false;
        spsResult = await supabaseServer
          .from("sps")
          .select("id,first_name,last_name,full_name,working_email,email")
          .in("id", assignedSpIds);
      }
      sps = (spsResult.data as AssignedSpApiRow[] | null) || [];
      spsError = spsResult.error;
    }

    if (spsError) {
      logEventsApiFailure("sps-query", spsError, { activeOrganizationId, organizationScopeEnabled });
      if (!canDegradeEnrichment) {
        return applyOrganizationAuthCookies(NextResponse.json(
          {
            ok: false,
            source: "sps",
            status: "sps_query_failed",
            error: getErrorMessage(spsError, "Could not load assigned SP names right now."),
          },
          { status: 500 }
        ), organizationContext);
      }
      responseWarnings.push("Assigned SP names could not be loaded; coverage details may be incomplete.");
      sps = [];
    }

    const assignmentRows = (assignments || []) as AssignmentApiRow[];
    const sessionRows = ((sessions || []) as EventSessionApiRow[]);
    const ownerIds = Array.from(new Set((data || []).map((event) => asText(event.owner_id)).filter(Boolean)));
    const ownerProfilesResult = await getProfilesByIds(ownerIds);
    const ownerNameById = new Map(
      ownerProfilesResult.profiles.map((profile) => [
        profile.id,
        asText(profile.full_name) || asText(profile.email) || "Assigned user",
      ])
    );
    const spNameById = new Map(
      (sps || []).map((sp) => {
        const fullName =
          asText(sp.full_name) ||
          [asText(sp.first_name), asText(sp.last_name)].filter(Boolean).join(" ") ||
          "Unnamed SP";
        return [sp.id, fullName];
      })
    );
    const spEmailById = new Map(
      (sps || []).map((sp) => [sp.id, asText(sp.working_email) || asText(sp.email) || ""])
    );
    const eventsWithCoverage = (data || []).map((event) => {
      const eventAssignments = assignmentRows.filter((assignment) => assignment.event_id === event.id);
      const confirmedEventAssignments = eventAssignments
        .filter(isConfirmedAssignment)
        .sort((a, b) => {
          const aTime = Date.parse(asText(a.created_at));
          const bTime = Date.parse(asText(b.created_at));
          if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) return aTime - bTime;
          return asText(a.id).localeCompare(asText(b.id));
        });
      const confirmedAssignments = confirmedEventAssignments.length;
      const needed = parseNumber(event.sp_needed);
      const eventSessions = sessionRows.filter((session) => session.event_id === event.id);
      const fallbackYear = getImportedYearHint(event.notes);
      const sessionTimingRows = getSessionTimingRows(eventSessions, fallbackYear);
      const sortedSessionTimingRows = [...sessionTimingRows].sort(
        (a, b) => a.dateSort - b.dateSort || a.startMinutes - b.startMinutes || a.index - b.index
      );
      const latestSessionTimingRow =
        [...sessionTimingRows].sort((a, b) => {
          const aDateSort = a.dateSort === Number.MAX_SAFE_INTEGER ? -1 : a.dateSort;
          const bDateSort = b.dateSort === Number.MAX_SAFE_INTEGER ? -1 : b.dateSort;
          return bDateSort - aDateSort || b.endMinutes - a.endMinutes || a.index - b.index;
        })[0] || null;
      const normalizedSessionDates = eventSessions
        .map((session) => normalizeLooseDateToIso(session.session_date, fallbackYear))
        .filter(Boolean)
        .sort();
      const earliestSessionDate =
        normalizedSessionDates[0] || null;
      const latestSessionDate =
        latestSessionTimingRow?.normalizedDate
          ? addDaysToIsoDate(latestSessionTimingRow.normalizedDate, latestSessionTimingRow.endDayOffset)
          : normalizedSessionDates[normalizedSessionDates.length - 1] || null;
      const assignedNames = confirmedEventAssignments
        .map((assignment) => spNameById.get(asText(assignment.sp_id)) || "")
        .filter(Boolean);
      const assignedEmails = confirmedEventAssignments
        .map((assignment) => spEmailById.get(asText(assignment.sp_id)) || "")
        .filter(Boolean);
      const sessionLocations = Array.from(
        new Set(
          eventSessions
            .flatMap((session) => [
              asText((session as { room?: string | null }).room),
              asText((session as { location?: string | null }).location),
            ])
            .filter(Boolean)
        )
      );

      return {
        ...event,
        owner_id: asText(event.owner_id) || null,
        owner_name: ownerNameById.get(asText(event.owner_id)) || null,
        schedule_owner_text: extractScheduleOwnerText(event.notes),
        earliest_session_date: earliestSessionDate,
        latest_session_date: latestSessionDate,
        earliest_session_start: sortedSessionTimingRows[0]?.session.start_time || null,
        latest_session_end: latestSessionTimingRow?.session.end_time || null,
        assigned_sp_names: assignedNames,
        assigned_sp_emails: assignedEmails,
        session_locations: sessionLocations,
        total_assignments: eventAssignments.length,
        confirmed_assignments: confirmedAssignments,
        shortage: Math.max(needed - confirmedAssignments, 0),
      };
    }).sort((a, b) => {
      const aDate = getDateSortValue(a.earliest_session_date || a.date_text, getImportedYearHint(a.notes));
      const bDate = getDateSortValue(b.earliest_session_date || b.date_text, getImportedYearHint(b.notes));
      if (aDate !== bDate) return aDate - bDate;
      return asText(a.name).localeCompare(asText(b.name));
    });

    if (viewer.role === "sp") {
      const matchedSpIds = new Set(
        [viewer.linkedSpId, ...getViewerMatchedSpIds((sps || []) as AssignedSpApiRow[], viewer)].filter(Boolean)
      );
      const allowedEventIds = new Set(
        assignmentRows
          .filter((assignment) => matchedSpIds.has(asText(assignment.sp_id)))
          .map((assignment) => asText(assignment.event_id))
          .filter(Boolean)
      );

      const filteredEvents = eventsWithCoverage
        .filter((event) => allowedEventIds.has(event.id))
        .map((event) => ({
          ...event,
          notes: null,
          schedule_owner_text: null,
          owner_id: null,
          owner_name: null,
          assigned_sp_names: [],
          assigned_sp_emails: [],
        }));
      const response = NextResponse.json({
        ok: true,
        events: filteredEvents,
        assignments: assignmentRows.filter(
          (assignment) =>
            allowedEventIds.has(asText(assignment.event_id)) &&
            matchedSpIds.has(asText(assignment.sp_id))
        ),
        meta: {
          source: isDashboardFallback ? "events_dashboard_fallback" : "events",
          activeOrganizationId,
          organizationScopeEnabled,
          includesLegacyUnscopedRows: canIncludeLegacyUnscopedRows,
          degraded: responseWarnings.length > 0,
          warnings: responseWarnings,
        },
      });
      if (viewer.refreshedSession?.access_token && viewer.refreshedSession.refresh_token) {
        setAuthCookies(response, {
          accessToken: viewer.refreshedSession.access_token,
          refreshToken: viewer.refreshedSession.refresh_token,
        });
      }
      return applyOrganizationAuthCookies(response, organizationContext);
    }

      console.info("[api/events] loaded", {
        source: isDashboardFallback ? "events_dashboard_fallback" : "events",
        userEmail: viewer.email,
        role: viewer.role,
        organizationRole: organizationContext.role,
        activeOrganizationId,
        organizationScopeEnabled,
        includesLegacyUnscopedRows: canIncludeLegacyUnscopedRows,
        eventsReturned: eventsWithCoverage.length,
        warnings: responseWarnings.length,
      });
      const response = NextResponse.json({
        ok: true,
        events: eventsWithCoverage,
        assignments: assignmentRows,
        meta: {
          source: isDashboardFallback ? "events_dashboard_fallback" : "events",
          activeOrganizationId,
          organizationScopeEnabled,
          includesLegacyUnscopedRows: canIncludeLegacyUnscopedRows,
          degraded: responseWarnings.length > 0,
          warnings: responseWarnings,
        },
      });
      if (viewer.refreshedSession?.access_token && viewer.refreshedSession.refresh_token) {
        setAuthCookies(response, {
          accessToken: viewer.refreshedSession.access_token,
          refreshToken: viewer.refreshedSession.refresh_token,
        });
      }
      return applyOrganizationAuthCookies(response, organizationContext);
  } catch (error) {
    logEventsApiFailure("events-get-catch", error);
    return NextResponse.json(
      {
        ok: false,
        source: "events",
        status: "events_unhandled_error",
        error: getErrorMessage(error, "Could not load events right now."),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const organizationContext = await getOrganizationContext();
    if (!organizationContext.user) return unauthorizedJson(organizationContext);
    if (!requireActiveOrganization(organizationContext)) return noActiveOrganizationJson(organizationContext);
    if (!roleCanOperateOrganization(organizationContext.role)) {
      return forbiddenJson("Only Sim Ops or admin accounts can create events.", organizationContext);
    }

    const supabaseServer = createSupabaseUserClient(organizationContext.accessToken);
    const body = await request.json();
    const name = asText(body?.name);
    const ownerId = organizationContext.user.id;
    const activeOrganizationId = organizationContext.activeOrganization!.id;

    if (!name) {
      return NextResponse.json({ error: "Event name is required." }, { status: 400 });
    }

    let includeOwnerColumn = true;
    let organizationScopeEnabled = organizationContext.schemaAvailable;
    const basePayload = {
      name,
      status: asText(body?.status) || "Needs SPs",
      date_text: asText(body?.date_text) || null,
      sp_needed: parseNumber(body?.sp_needed),
      visibility: asText(body?.visibility) || "team",
      location: parseNullableText(body?.location),
      notes: mergeEventNotesPreservingMetadata(null, parseNullableText(body?.notes)),
    };
    const buildPayload = () => {
      const payload: {
        name: string;
        status: string;
        date_text: string | null;
        sp_needed: number;
        visibility: string;
        location: string | null;
        notes: string | null;
        owner_id?: string;
        organization_id?: string;
      } = {
        ...basePayload,
      };
      if (ownerId && includeOwnerColumn) payload.owner_id = ownerId;
      if (organizationScopeEnabled) payload.organization_id = activeOrganizationId;
      return payload;
    };

    let insertResult = await supabaseServer
      .from("events")
      .insert(buildPayload())
      .select("id,name,status,date_text,sp_needed,visibility,location,notes,created_at,owner_id")
      .single();

    if (insertResult.error && isMissingColumnError(insertResult.error, "owner_id")) {
      includeOwnerColumn = false;
      insertResult = await supabaseServer
        .from("events")
        .insert(buildPayload())
        .select("id,name,status,date_text,sp_needed,visibility,location,notes,created_at")
        .single();
    }

    if (insertResult.error && organizationScopeEnabled && isMissingOrganizationColumnError(insertResult.error)) {
      // TODO(cfsp-org-scoping): Remove this fallback once all production tables are migrated/backfilled with organization_id.
      logEventsApiFailure("events-create-scope-fallback", insertResult.error, { table: "events", activeOrganizationId });
      organizationScopeEnabled = false;
      insertResult = includeOwnerColumn
        ? await supabaseServer
            .from("events")
            .insert(buildPayload())
            .select("id,name,status,date_text,sp_needed,visibility,location,notes,created_at,owner_id")
            .single()
        : await supabaseServer
            .from("events")
            .insert(buildPayload())
            .select("id,name,status,date_text,sp_needed,visibility,location,notes,created_at")
            .single();
    }

    const { data, error } = insertResult;

    if (error) {
      logEventsApiFailure("events-create-query", error, { activeOrganizationId, organizationScopeEnabled });
      return NextResponse.json(
        { error: getErrorMessage(error.message, "Could not create event right now.") },
        { status: 500 }
      );
    }

    const createdEvent = data;
    const sessions: unknown[] = Array.isArray(body?.sessions) ? body.sessions : [];

    if (createdEvent?.id && sessions.length) {
      const sessionPayload = sessions.reduce<EventSessionInsertPayload[]>((rows, session) => {
          const sessionDate = parseNullableText((session as { session_date?: unknown }).session_date);
          const startTime = parseNullableText((session as { start_time?: unknown }).start_time);
          const endTime = parseNullableText((session as { end_time?: unknown }).end_time);
          const room = parseNullableText((session as { room?: unknown }).room);
          const location = parseNullableText((session as { location?: unknown }).location) || parseNullableText(body?.location);

          if (!sessionDate || !startTime) return rows;

          rows.push({
            event_id: createdEvent.id,
            ...(organizationScopeEnabled ? { organization_id: activeOrganizationId } : {}),
            session_date: sessionDate,
            start_time: startTime,
            end_time: endTime,
            location,
            room,
          });
          return rows;
        }, []);

      if (sessionPayload.length) {
        let sessionInsertResult = await supabaseServer.from("event_sessions").insert(sessionPayload);
        let sessionInsertError = sessionInsertResult.error;
        if (sessionInsertError && organizationScopeEnabled && isMissingOrganizationColumnError(sessionInsertError)) {
          logEventsApiFailure("event-sessions-create-scope-fallback", sessionInsertError, {
            table: "event_sessions",
            activeOrganizationId,
          });
          organizationScopeEnabled = false;
          const fallbackSessionPayload = sessionPayload.map((session) => {
            const row: Record<string, unknown> = { ...session };
            delete row.organization_id;
            return row;
          });
          sessionInsertResult = await supabaseServer.from("event_sessions").insert(fallbackSessionPayload);
          sessionInsertError = sessionInsertResult.error;
        }
        if (sessionInsertError) {
          logEventsApiFailure("event-sessions-create-query", sessionInsertError, {
            activeOrganizationId,
            organizationScopeEnabled,
          });
          return NextResponse.json(
            { error: getErrorMessage(sessionInsertError.message, "Event created, but sessions could not be saved.") },
            { status: 500 }
          );
        }
      }
    }

    return NextResponse.json({ event: createdEvent }, { status: 201 });
  } catch (error) {
    logEventsApiFailure("events-create-catch", error);
    return NextResponse.json(
      { error: getErrorMessage(error, "Could not create event right now.") },
      { status: 500 }
    );
  }
}

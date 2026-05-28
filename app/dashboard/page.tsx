"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import SiteShell from "../components/SiteShell";
import { parseEventMetadata } from "../lib/eventMetadata";
import { isPastEvent } from "../lib/eventArchive";
import { eventMatchesOwnership, ownershipTextMatchesScheduleName } from "../lib/eventOwnership";
import { sanitizePublicErrorMessage } from "../lib/safeErrorMessage";
import { readSafeJsonResponse } from "../lib/safeJsonResponse";

type MeResponse = {
  ok: boolean;
  accessStatus?: "active" | "no_active_membership" | "unauthorized";
  user?: {
    id: string;
    email: string | null;
  };
  profile?: {
    id: string;
    full_name: string;
    schedule_match_name: string;
    schedule_name?: string;
    role: string;
    organization_role?: string | null;
    status: string;
    email: string;
  };
  memberships?: Array<{
    id: string;
    organization_id: string;
    role: string;
    status: string;
    organization?: {
      id: string;
      name: string;
      slug?: string | null;
    } | null;
  }>;
  activeOrganization?: {
    id: string;
    name: string;
    slug?: string | null;
  } | null;
  role?: string | null;
  legacyRole?: string | null;
  isPlatformOwner?: boolean;
  sp_link?: {
    status?: string | null;
    sp_id?: string | null;
    sp_name?: string | null;
    onboarding_message?: string | null;
  };
  error?: string;
};

type EventRecord = {
  id: string;
  name?: string | null;
  status?: string | null;
  date_text?: string | null;
  location?: string | null;
  sp_needed?: number | null;
  sp_assigned?: number | null;
  total_assignments?: number | null;
  confirmed_assignments?: number | null;
  shortage?: number | null;
  assigned_sp_names?: string[] | null;
  visibility?: string | null;
  notes?: string | null;
  schedule_owner_text?: string | null;
  owner_id?: string | null;
  earliest_session_date?: string | null;
  latest_session_date?: string | null;
  earliest_session_start?: string | null;
  latest_session_end?: string | null;
  sessions?: Array<{
    session_date?: string | null;
    start_time?: string | null;
    end_time?: string | null;
    location?: string | null;
    room?: string | null;
  }>;
};

type EventsResponse = {
  ok?: boolean;
  events?: EventRecord[];
  items?: EventRecord[];
  data?: EventRecord[] | { events?: EventRecord[]; items?: EventRecord[] };
  assignments?: Array<{
    id?: string | null;
    event_id?: string | null;
    sp_id?: string | null;
    status?: string | null;
    confirmed?: boolean | null;
  }>;
  meta?: {
    source?: string;
    degraded?: boolean;
    warnings?: string[];
  };
  error?: string;
  status?: string;
  source?: string;
};

type AccessRequestsResponse = {
  ok?: boolean;
  accessRequests?: Array<{
    id: string;
    status?: string | null;
  }>;
  error?: string;
};

type AuthState = "loading" | "authed" | "guest";
type DashboardScope = "workspace" | "organization";
type DashboardView = "command" | "calendar" | "agenda";
type CalendarTab = "today" | "week" | "month" | "timeline";
type CommandFilter = "all" | "today" | "soon" | "needs" | "access";
type ToolKey = "access" | "calendar" | "staffing" | "training" | "materials";
type DashboardFeedSource = "profile" | "events" | "access queue" | "organizations";

type EventDerived = {
  event: EventRecord;
  start: Date | null;
  end: Date | null;
  needed: number;
  assigned: number;
  confirmed: number;
  shortage: number;
  locationLabel: string;
  rounds: number;
  rooms: number;
  learners: number;
  scheduleStatus: string;
  issueList: string[];
  startsSoon: boolean;
  liveToday: boolean;
  timelineCadenceMinutes: number;
  encounterMinutes: number;
  checklistMinutes: number;
  feedbackMinutes: number;
  transitionMinutes: number;
  prebriefMinutes: number;
};

type ResumeEntry = {
  eventId: string;
  eventName: string;
  route: string;
  toolLabel: string;
  updatedAt: string;
};

type SmartAction = {
  id: string;
  label: string;
  description: string;
  href: string;
  visible: boolean;
};

type CalendarEventEntry = {
  id: string;
  dateKey: string;
  item: EventDerived;
  timeLabel: string;
  locationLabel: string;
};

const RECENT_EVENTS_STORAGE_KEY = "cfsp:recent-events";
const RESUME_WORK_STORAGE_KEY = "cfsp:command-module-resume:v1";
const MAX_RESUME_ITEMS = 8;
const DASHBOARD_FEED_UNAVAILABLE_MESSAGE = "Dashboard data is temporarily unavailable. Please refresh in a moment.";

type ApiResponseWithError = {
  ok?: boolean;
  error?: string;
};

type SafeDashboardFetchResult<T> = {
  ok: boolean;
  status: number;
  body: T | null;
  error: string;
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeText(value: unknown) {
  return asText(value).toLowerCase();
}

function parseInteger(value: unknown, fallback = 0) {
  const parsed = Number.parseInt(asText(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBooleanText(value: unknown) {
  const text = normalizeText(value);
  return text === "yes" || text === "true" || text === "1";
}

function formatDashboardFeedError<T extends ApiResponseWithError>(
  result: SafeDashboardFetchResult<T>,
  source: DashboardFeedSource
) {
  const statusLabel = result.status > 0 ? `HTTP ${result.status}` : "network";
  const body = result.body as (ApiResponseWithError & { status?: unknown; source?: unknown }) | null;
  const serverStatus = asText(body?.status);
  const serverSource = asText(body?.source) || source;
  const detail = sanitizePublicErrorMessage(result.error || body?.error, DASHBOARD_FEED_UNAVAILABLE_MESSAGE);
  return `${serverSource} ${statusLabel}${serverStatus ? ` (${serverStatus})` : ""}: ${detail}`;
}

function normalizeEventsPayload(payload: unknown): EventsResponse {
  if (Array.isArray(payload)) {
    return { ok: true, events: payload as EventRecord[], assignments: [] };
  }

  if (!payload || typeof payload !== "object") {
    return { ok: false, events: [], assignments: [], error: DASHBOARD_FEED_UNAVAILABLE_MESSAGE };
  }

  const source = payload as EventsResponse;
  const nestedData = source.data && !Array.isArray(source.data) ? source.data : null;
  const events =
    (Array.isArray(source.events) && source.events) ||
    (Array.isArray(source.items) && source.items) ||
    (Array.isArray(source.data) && source.data) ||
    (Array.isArray(nestedData?.events) && nestedData.events) ||
    (Array.isArray(nestedData?.items) && nestedData.items) ||
    [];

  return {
    ...source,
    ok: events.length > 0 ? true : source.ok ?? true,
    events,
    assignments: Array.isArray(source.assignments) ? source.assignments : [],
  };
}

function canViewDashboardDebug(me: MeResponse | null) {
  const role = normalizeRole(me?.role || me?.profile?.organization_role || me?.profile?.role || me?.legacyRole);
  return Boolean(me?.isPlatformOwner || role === "platform_owner" || role === "org_admin");
}

function summarizeDebugPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const data = payload as {
    error?: unknown;
    exactError?: { message?: unknown; code?: unknown };
    activeOrgId?: unknown;
    totalEventsVisibleUnderNormalQuery?: unknown;
    legacyNullOrganizationEventCount?: unknown;
    allEventsCountForPlatformOwner?: unknown;
  };
  const parts = [
    asText(data.exactError?.message || data.error),
    asText(data.exactError?.code) ? `code ${asText(data.exactError?.code)}` : "",
    `activeOrg ${asText(data.activeOrgId) || "none"}`,
    `normal ${asText(data.totalEventsVisibleUnderNormalQuery) || "0"}`,
    `legacy-null ${asText(data.legacyNullOrganizationEventCount) || "0"}`,
    `all-org ${asText(data.allEventsCountForPlatformOwner) || "n/a"}`,
  ].filter(Boolean);
  return parts.join(" · ");
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    target.isContentEditable ||
    Boolean(target.closest("[contenteditable='true'], [contenteditable='']"))
  );
}

function normalizeRole(value: unknown) {
  const role = normalizeText(value).replace(/[\s-]+/g, "_");
  if (role === "platform_owner" || role === "super_admin") return "platform_owner";
  if (role === "org_admin" || role === "admin") return "org_admin";
  if (role === "sim_ops" || role === "sim_op") return "sim_ops";
  if (role === "faculty") return "faculty";
  if (role === "sp") return "sp";
  if (role === "viewer") return "viewer";
  return "viewer";
}

function roleLabel(value: string) {
  if (value === "platform_owner") return "Platform Owner";
  if (value === "org_admin") return "Organization Admin";
  if (value === "sim_ops") return "Sim Ops";
  if (value === "faculty") return "Faculty";
  if (value === "sp") return "SP";
  return "Viewer";
}

function eventLocation(event: EventRecord) {
  const firstSession = Array.isArray(event.sessions) && event.sessions.length ? event.sessions[0] : null;
  return asText(firstSession?.location) || asText(firstSession?.room) || asText(event.location) || "Location TBD";
}

function parseEventStart(event: EventRecord) {
  if (event.earliest_session_date) {
    const timeText = asText(event.earliest_session_start) || "00:00:00";
    const dt = new Date(`${event.earliest_session_date}T${timeText}`);
    if (!Number.isNaN(dt.getTime())) return dt;
  }
  const firstSession = Array.isArray(event.sessions) && event.sessions.length ? event.sessions[0] : null;
  if (firstSession?.session_date) {
    const dt = new Date(`${firstSession.session_date}T${asText(firstSession.start_time) || "00:00:00"}`);
    if (!Number.isNaN(dt.getTime())) return dt;
  }
  if (event.date_text) {
    const dt = new Date(event.date_text);
    if (!Number.isNaN(dt.getTime())) return dt;
  }
  return null;
}

function parseEventEnd(event: EventRecord) {
  if (event.latest_session_date) {
    const timeText = asText(event.latest_session_end) || "23:59:00";
    const dt = new Date(`${event.latest_session_date}T${timeText}`);
    if (!Number.isNaN(dt.getTime())) return dt;
  }
  const sessions = Array.isArray(event.sessions) ? event.sessions : [];
  if (sessions.length > 0) {
    const lastSession = sessions[sessions.length - 1];
    if (lastSession?.session_date) {
      const dt = new Date(`${lastSession.session_date}T${asText(lastSession.end_time) || asText(lastSession.start_time) || "23:59:00"}`);
      if (!Number.isNaN(dt.getTime())) return dt;
    }
  }
  return parseEventStart(event);
}

function formatDateTime(date: Date | null, fallback?: string | null) {
  return date ? date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : asText(fallback) || "Date TBD";
}

function formatTime(date: Date | null) {
  if (!date) return "TBD";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatClockTime(date: Date) {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

function formatCommandDate(date: Date) {
  return date.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function formatCountdown(target: Date | null, now: Date) {
  if (!target) return "No event queued";
  const diffMinutes = Math.max(0, Math.ceil((target.getTime() - now.getTime()) / 60_000));
  if (diffMinutes <= 0) return "Now";
  const days = Math.floor(diffMinutes / 1440);
  const hours = Math.floor((diffMinutes % 1440) / 60);
  const minutes = diffMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function getDayStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function isSameDay(a: Date | null, b: Date) {
  if (!a) return false;
  return getDayStart(a) === getDayStart(b);
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getStartOfCalendarWeek(date: Date) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() - next.getDay());
  return new Date(next.getFullYear(), next.getMonth(), next.getDate());
}

function addCalendarDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function addCalendarMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function getMonthGridDates(date: Date) {
  const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
  const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const gridStart = getStartOfCalendarWeek(monthStart);
  const gridEnd = addCalendarDays(getStartOfCalendarWeek(monthEnd), 6);
  const dayCount = Math.max(35, Math.round((gridEnd.getTime() - gridStart.getTime()) / 86_400_000) + 1);
  return Array.from({ length: dayCount }).map((_, index) => addCalendarDays(gridStart, index));
}

function getEventDateKeys(event: EventDerived) {
  const entries = new Map<string, { timeLabel: string; locationLabel: string }>();
  const sessions = Array.isArray(event.event.sessions) ? event.event.sessions : [];

  sessions.forEach((session) => {
    const dateKey = asText(session.session_date);
    if (!dateKey) return;
    const timeLabel = asText(session.start_time)
      ? formatTime(new Date(`${dateKey}T${asText(session.start_time)}`))
      : formatTime(event.start);
    const locationLabel = asText(session.location) || asText(session.room) || event.locationLabel;
    entries.set(dateKey, {
      timeLabel,
      locationLabel,
    });
  });

  if (!entries.size && event.start) {
    entries.set(toDateInputValue(event.start), {
      timeLabel: formatTime(event.start),
      locationLabel: event.locationLabel,
    });
  }

  return Array.from(entries.entries()).map(([dateKey, detail]) => ({
    dateKey,
    ...detail,
  }));
}

function splitPeopleList(value: string) {
  return value
    .split(/\s*(?:,|;|\/| and | & )\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function getNotesRosterLine(notes: string, labelPattern: RegExp) {
  const lines = notes
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const match = line.match(labelPattern);
    if (match?.[1]) {
      return splitPeopleList(match[1]);
    }
  }

  return [];
}

function eventMatchesProfile(event: EventRecord, currentUserId: string, scheduleMatchName: string, firstName: string) {
  if (eventMatchesOwnership(event, scheduleMatchName || currentUserId)) return true;

  const notes = asText(event.notes);
  const matchCandidates = [scheduleMatchName, firstName].filter(Boolean);
  if (!matchCandidates.length) return false;

  const rosterGroups = [
    getNotesRosterLine(notes, /^Sim Staff\s*:\s*(.+)$/i),
    getNotesRosterLine(notes, /^Staff Hiring\s*:\s*(.+)$/i),
    getNotesRosterLine(notes, /^Event Lead\/Team\s*:\s*(.+)$/i),
    getNotesRosterLine(notes, /^Course Faculty\s*:\s*(.+)$/i),
    getNotesRosterLine(notes, /^Faculty\s*:\s*(.+)$/i),
  ];

  return rosterGroups.some((group) =>
    group.some((person) =>
      matchCandidates.some((candidate) => ownershipTextMatchesScheduleName(person, candidate))
    )
  );
}

function readRecentEventsFromStorage() {
  if (typeof window === "undefined") return [] as ResumeEntry[];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_EVENTS_STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const record = entry as Record<string, unknown>;
        const eventId = asText(record.id);
        if (!eventId) return null;
        return {
          eventId,
          eventName: asText(record.name) || "Untitled Event",
          route: `/events/${encodeURIComponent(eventId)}`,
          toolLabel: "Command Center",
          updatedAt: asText(record.openedAt) || new Date().toISOString(),
        } satisfies ResumeEntry;
      })
      .filter((entry): entry is ResumeEntry => Boolean(entry))
      .slice(0, MAX_RESUME_ITEMS);
  } catch {
    return [];
  }
}

function readResumeWorkFromStorage() {
  if (typeof window === "undefined") return [] as ResumeEntry[];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RESUME_WORK_STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const record = entry as Record<string, unknown>;
        const eventId = asText(record.eventId);
        const route = asText(record.route);
        if (!eventId || !route) return null;
        return {
          eventId,
          eventName: asText(record.eventName) || "Untitled Event",
          route,
          toolLabel: asText(record.toolLabel) || "Command Center",
          updatedAt: asText(record.updatedAt) || new Date().toISOString(),
        } satisfies ResumeEntry;
      })
      .filter((entry): entry is ResumeEntry => Boolean(entry))
      .slice(0, MAX_RESUME_ITEMS);
  } catch {
    return [];
  }
}

function saveResumeWork(entries: ResumeEntry[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(RESUME_WORK_STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_RESUME_ITEMS)));
}

function formatResumeUpdatedAt(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Recently opened";
  return parsed.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function buildTimelineBlocks(event: EventDerived) {
  const blocks: Array<{ label: string; time: string; detail: string }> = [];
  const start = event.start;
  if (!start) return blocks;

  const makeAt = (minutes: number) => {
    const dt = new Date(start.getTime() + minutes * 60_000);
    return dt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  };

  const prebriefStart = new Date(start.getTime() - event.prebriefMinutes * 60_000);
  blocks.push({
    label: "Arrival / Check-In",
    time: event.event.notes && parseEventMetadata(event.event.notes).training.sp_report_call_time
      ? asText(parseEventMetadata(event.event.notes).training.sp_report_call_time)
      : prebriefStart.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
    detail: "SPs and staff check in",
  });
  blocks.push({
    label: "Pre-brief",
    time: prebriefStart.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
    detail: `${event.prebriefMinutes} minutes`,
  });

  const rounds = Math.max(event.rounds, 1);
  const cadence = Math.max(5, event.timelineCadenceMinutes);
  for (let index = 0; index < rounds; index += 1) {
    const offset = index * cadence;
    blocks.push({
      label: `Round ${index + 1} Encounter`,
      time: makeAt(offset),
      detail: `${event.encounterMinutes} minute encounter`,
    });
    blocks.push({
      label: `Round ${index + 1} Feedback`,
      time: makeAt(offset + event.encounterMinutes + event.checklistMinutes),
      detail: `${event.feedbackMinutes} minute feedback`,
    });
  }

  if (event.end) {
    blocks.push({
      label: "Event End",
      time: event.end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      detail: "Wrap-up / debrief",
    });
  }

  return blocks;
}

function getEventActionHref(eventId: string, action: "command" | "staffing" | "materials" | "builder" | "schedule" | "roomOps" | "printSummary" | "facultyPacket") {
  const encoded = encodeURIComponent(eventId);
  if (action === "command") return `/events/${encoded}`;
  if (action === "staffing") return `/events/${encoded}#coverage-actions`;
  if (action === "materials") return `/events/${encoded}#command-dock-file-cabinet`;
  if (action === "builder") return `/events/${encoded}/schedule-builder`;
  if (action === "schedule") return `/events/${encoded}/schedule-builder?preview=operations&view=operations`;
  if (action === "roomOps") return `/events/${encoded}?tool=room-operations`;
  if (action === "printSummary") return `/events/${encoded}#command-summary`;
  return `/events/${encoded}#communication-center`;
}

async function fetchDashboardJson<T extends ApiResponseWithError>(
  input: string,
  init: RequestInit = {}
): Promise<SafeDashboardFetchResult<T>> {
  try {
    const response = await fetch(input, {
      credentials: "include",
      cache: "no-store",
      headers: {
        "Cache-Control": "no-store",
        Pragma: "no-cache",
        ...(init.headers || {}),
      },
      ...init,
    });
    const parsed = await readSafeJsonResponse<T>(
      response,
      input,
      DASHBOARD_FEED_UNAVAILABLE_MESSAGE
    );

    return {
      ok: parsed.ok,
      status: parsed.status,
      body: parsed.body,
      error: parsed.ok ? "" : parsed.message,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: null,
      error: sanitizePublicErrorMessage(
        error instanceof Error ? error.message : "",
        DASHBOARD_FEED_UNAVAILABLE_MESSAGE
      ),
    };
  }
}

export default function DashboardPage() {
  const router = useRouter();

  const [authState, setAuthState] = useState<AuthState>("loading");
  const [me, setMe] = useState<MeResponse | null>(null);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [assignments, setAssignments] = useState<EventsResponse["assignments"]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [error, setError] = useState("");
  const [errorSource, setErrorSource] = useState<DashboardFeedSource | "">("");
  const [scope, setScope] = useState<DashboardScope>("workspace");
  const [viewMode, setViewMode] = useState<DashboardView>("command");
  const [calendarTab, setCalendarTab] = useState<CalendarTab>("today");
  const [commandFilter, setCommandFilter] = useState<CommandFilter>("all");
  const [selectedDate, setSelectedDate] = useState(() => toDateInputValue(new Date()));
  const [dayDrawerDate, setDayDrawerDate] = useState<string | null>(null);
  const [previewEventId, setPreviewEventId] = useState<string | null>(null);
  const [resumeWork, setResumeWork] = useState<ResumeEntry[]>([]);
  const [commandQuery, setCommandQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [organizationSwitching, setOrganizationSwitching] = useState(false);
  const [accessQueueCount, setAccessQueueCount] = useState(0);
  const [accessQueueLoading, setAccessQueueLoading] = useState(false);
  const [accessQueueError, setAccessQueueError] = useState("");
  const [accessQueueErrorSource, setAccessQueueErrorSource] = useState<DashboardFeedSource | "">("");
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [selectedTriageIndex, setSelectedTriageIndex] = useState(0);
  const [reviewedEventIds, setReviewedEventIds] = useState<string[]>([]);
  const [timelineDrawerOpen, setTimelineDrawerOpen] = useState(true);
  const [expandedTool, setExpandedTool] = useState<ToolKey | null>(null);
  const [refreshSeed, setRefreshSeed] = useState(0);
  const commandSearchRef = useRef<HTMLInputElement | null>(null);
  const hasValidatedSessionRef = useRef(false);

  useEffect(() => {
    const interval = window.setInterval(() => setCurrentTime(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const next = [
      ...readResumeWorkFromStorage(),
      ...readRecentEventsFromStorage(),
    ];
    const deduped = Array.from(
      new Map(next.map((entry) => [`${entry.eventId}:${entry.route}`, entry])).values()
    )
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, MAX_RESUME_ITEMS);
    setResumeWork(deduped);
    saveResumeWork(deduped);
  }, []);

  useEffect(() => {
    function handleShortcuts(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      if (isTypingTarget(event.target)) return;
      if ((event.metaKey || event.ctrlKey) && key === "k") {
        event.preventDefault();
        commandSearchRef.current?.focus();
        setSearchOpen(true);
        return;
      }
      if (!event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && event.key === "/") {
        event.preventDefault();
        commandSearchRef.current?.focus();
        setSearchOpen(true);
      }
    }

    window.addEventListener("keydown", handleShortcuts);
    return () => window.removeEventListener("keydown", handleShortcuts);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setAuthState("loading");
        setError("");
        setErrorSource("");
        setEventsLoading(true);

        const meResult = await fetchDashboardJson<MeResponse>("/api/me", { method: "GET" });

        if (cancelled) return;

        if (meResult.status === 401) {
          if (hasValidatedSessionRef.current) {
            setAuthState("authed");
            setEventsLoading(false);
            setError(formatDashboardFeedError(meResult, "profile"));
            setErrorSource("profile");
            return;
          }
          setAuthState("guest");
          setEventsLoading(false);
          router.replace("/login");
          return;
        }

        const meJson = meResult.body;

        if (!meResult.ok || !meJson?.ok) {
          setAuthState("authed");
          setMe(meJson || null);
          setEventsLoading(false);
          setError(formatDashboardFeedError(meResult, "profile"));
          setErrorSource("profile");
          return;
        }

        setMe(meJson);
        setAuthState("authed");
        hasValidatedSessionRef.current = true;
        const eventsResult = await fetchDashboardJson<EventsResponse>("/api/events", { method: "GET" });

        if (cancelled) return;

        if (eventsResult.status === 401) {
          setAuthState("authed");
          setEventsLoading(false);
          setError(formatDashboardFeedError(eventsResult, "events"));
          setErrorSource("events");
          return;
        }

        let effectiveEventsResult = eventsResult;
        let usedFallback = false;
        let primaryEventsJson = normalizeEventsPayload(eventsResult.body);
        const primaryHasEvents = Array.isArray(primaryEventsJson.events) && primaryEventsJson.events.length > 0;
        if (!primaryHasEvents && (!eventsResult.ok || !primaryEventsJson.ok)) {
          const fallbackResult = await fetchDashboardJson<EventsResponse>("/api/events?dashboard_fallback=1", { method: "GET" });
          const fallbackEventsJson = normalizeEventsPayload(fallbackResult.body);
          if (cancelled) return;
          if (fallbackResult.ok && fallbackEventsJson.ok) {
            effectiveEventsResult = fallbackResult;
            primaryEventsJson = fallbackEventsJson;
            usedFallback = true;
          } else {
            console.error("[dashboard] events feed failed", {
              primaryStatus: eventsResult.status,
              primaryError: eventsResult.error,
              fallbackStatus: fallbackResult.status,
              fallbackError: fallbackResult.error,
            });
            let debugSuffix = "";
            if (canViewDashboardDebug(meJson)) {
              const debugResult = await fetchDashboardJson<Record<string, unknown> & ApiResponseWithError>(
                "/api/admin/dashboard-events-debug",
                { method: "GET" }
              );
              debugSuffix = summarizeDebugPayload(debugResult.body);
            }
            setError(
              [
                formatDashboardFeedError(fallbackResult.status ? fallbackResult : eventsResult, "events"),
                debugSuffix ? `Debug: ${debugSuffix}` : "",
              ].filter(Boolean).join(" ")
            );
            setErrorSource("events");
            setEventsLoading(false);
            return;
          }
        }

        const eventsJson = usedFallback ? primaryEventsJson : normalizeEventsPayload(effectiveEventsResult.body);
        if (!eventsJson.ok) {
          setError(formatDashboardFeedError(effectiveEventsResult, "events"));
          setErrorSource("events");
          setEventsLoading(false);
          return;
        }

        setEvents(Array.isArray(eventsJson.events) ? eventsJson.events : []);
        setAssignments(Array.isArray(eventsJson.assignments) ? eventsJson.assignments : []);
        const warnings = Array.isArray(eventsJson.meta?.warnings) ? eventsJson.meta.warnings.filter(Boolean) : [];
        if (usedFallback || eventsJson.meta?.degraded || warnings.length) {
          setError(
            [
              usedFallback ? "Primary events feed failed; fallback events feed loaded." : "",
              ...warnings,
            ].filter(Boolean).join(" ")
          );
          setErrorSource("events");
        } else {
          setError("");
          setErrorSource("");
        }
        setEventsLoading(false);
      } catch {
        if (cancelled) return;
        setAuthState("authed");
        setEventsLoading(false);
        setError(DASHBOARD_FEED_UNAVAILABLE_MESSAGE);
        setErrorSource("events");
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [refreshSeed, router]);

  const currentUserId = asText(me?.user?.id);
  const scheduleMatchName = asText(me?.profile?.schedule_match_name) || asText(me?.profile?.schedule_name);
  const firstName = asText(me?.profile?.full_name).split(/\s+/).filter(Boolean)[0] || "";
  const organizationRole = normalizeRole(me?.role || me?.profile?.organization_role || me?.profile?.role);
  const isSp = organizationRole === "sp";
  const isFaculty = organizationRole === "faculty";
  const canOperate = organizationRole === "platform_owner" || organizationRole === "org_admin" || organizationRole === "sim_ops";
  const canManageOrganization = organizationRole === "platform_owner" || organizationRole === "org_admin";
  const canViewOrganizationScope = organizationRole === "platform_owner" || organizationRole === "org_admin" || organizationRole === "sim_ops" || organizationRole === "viewer";
  const eventsFeedFailed = errorSource === "events" && Boolean(error);
  const eventCountsUnavailable = eventsFeedFailed && events.length === 0;

  useEffect(() => {
    if (!canManageOrganization || !authState || authState !== "authed") {
      setAccessQueueCount(0);
      setAccessQueueError("");
      setAccessQueueErrorSource("");
      return;
    }

    let cancelled = false;

    async function loadAccessQueue() {
      setAccessQueueLoading(true);
      setAccessQueueError("");
      setAccessQueueErrorSource("");
      try {
        const result = await fetchDashboardJson<AccessRequestsResponse>("/api/access-requests", { method: "GET" });
        if (cancelled) return;
        if (!result.ok || !result.body?.ok) {
          setAccessQueueError(formatDashboardFeedError(result, "access queue"));
          setAccessQueueErrorSource("access queue");
          setAccessQueueCount(0);
          return;
        }
        const body = result.body;
        const pendingCount = (body.accessRequests || []).filter((request) => normalizeText(request.status || "pending") === "pending").length;
        setAccessQueueCount(pendingCount);
      } catch {
        if (cancelled) return;
        setAccessQueueError(DASHBOARD_FEED_UNAVAILABLE_MESSAGE);
        setAccessQueueErrorSource("access queue");
        setAccessQueueCount(0);
      } finally {
        if (!cancelled) setAccessQueueLoading(false);
      }
    }

    void loadAccessQueue();
    return () => {
      cancelled = true;
    };
  }, [authState, canManageOrganization, refreshSeed]);

  const allUpcomingEvents = useMemo(() => {
    return events
      .filter((event) =>
        !isPastEvent({
          latestSessionDate: event.latest_session_date,
          earliestSessionDate: event.earliest_session_date,
          dateText: event.date_text,
          notes: event.notes,
        })
      )
      .map((event) => {
        const metadata = parseEventMetadata(event.notes).training;
        const needed = Number(event.sp_needed || 0);
        const assigned = Number(event.total_assignments ?? event.sp_assigned ?? 0);
        const confirmed = Number(event.confirmed_assignments ?? event.sp_assigned ?? 0);
        const shortage = Math.max(needed - confirmed, 0);
        const start = parseEventStart(event);
        const end = parseEventEnd(event);
        const now = new Date();
        const hoursUntilStart = start ? (start.getTime() - now.getTime()) / (60 * 60 * 1000) : Number.POSITIVE_INFINITY;
        const startOfToday = getDayStart(now);
        const liveToday = start ? getDayStart(start) === startOfToday : false;
        const startsSoon = Number.isFinite(hoursUntilStart) && hoursUntilStart >= 0 && hoursUntilStart <= 48;

        const roundCount = Math.max(
          parseInteger(metadata.schedule_round_count, 0),
          parseInteger(metadata.schedule_round_count, 0)
        );
        const roomCount = Math.max(parseInteger(metadata.schedule_room_count, 0), 0);
        const learnerCount = Math.max(parseInteger(metadata.schedule_learner_count, 0), 0);

        const encounterMinutes = Math.max(1, parseInteger((metadata as Record<string, string>).encounter_minutes, 20) || 20);
        const checklistMinutes = Math.max(0, parseInteger((metadata as Record<string, string>).checklist_minutes, 10) || 10);
        const feedbackMinutes = Math.max(0, parseInteger((metadata as Record<string, string>).feedback_minutes, 5) || 5);
        const transitionMinutes = Math.max(0, parseInteger((metadata as Record<string, string>).transition_minutes, 5) || 5);
        const prebriefMinutes = Math.max(1, parseInteger((metadata as Record<string, string>).faculty_prebrief_minutes, 15) || 15);
        const cadenceMinutes = Math.max(5, encounterMinutes + checklistMinutes + feedbackMinutes + transitionMinutes);

        const issueList: string[] = [];
        if (shortage > 0) issueList.push(`${shortage} SP${shortage === 1 ? "" : "s"} not confirmed`);
        if (normalizeText(metadata.schedule_status) !== "complete") issueList.push("Draft schedule incomplete");
        if (!asText(metadata.faculty_schedule_file_url) && !asText(metadata.faculty_training_date_email_sent_at)) {
          issueList.push("Faculty packet not sent");
        }
        const recordingRequired = parseBooleanText(metadata.event_recording_required) || normalizeText(event.name).includes("vir");
        if (recordingRequired && !asText(metadata.event_recording_url) && !asText(metadata.training_recording_url) && !asText(metadata.recording_url)) {
          issueList.push("Recording pending");
        }
        const hasCaseFile = Boolean(
          asText(metadata.case_file_name) ||
          asText(metadata.case_file_url) ||
          asText(metadata.case_files) ||
          asText(metadata.case_manager_cases)
        );
        if (!hasCaseFile) issueList.push("Case files missing");

        return {
          event,
          start,
          end,
          needed,
          assigned,
          confirmed,
          shortage,
          locationLabel: eventLocation(event),
          rounds: roundCount,
          rooms: roomCount,
          learners: learnerCount,
          scheduleStatus: asText(metadata.schedule_status) || "in_progress",
          issueList,
          startsSoon,
          liveToday,
          timelineCadenceMinutes: cadenceMinutes,
          encounterMinutes,
          checklistMinutes,
          feedbackMinutes,
          transitionMinutes,
          prebriefMinutes,
        } satisfies EventDerived;
      })
      .sort((a, b) => {
        if (!a.start && !b.start) return 0;
        if (!a.start) return 1;
        if (!b.start) return -1;
        return a.start.getTime() - b.start.getTime();
      });
  }, [events]);

  const assignedEventIds = useMemo(() => {
    const next = new Set<string>();
    (assignments || []).forEach((assignment) => {
      const eventId = asText(assignment?.event_id);
      if (eventId) next.add(eventId);
    });
    return next;
  }, [assignments]);

  const workspaceEvents = useMemo(() => {
    if (isSp) {
      return allUpcomingEvents.filter((item) => assignedEventIds.has(item.event.id));
    }
    return allUpcomingEvents.filter((item) =>
      eventMatchesProfile(
        item.event,
        currentUserId,
        scheduleMatchName || currentUserId,
        firstName
      )
    );
  }, [allUpcomingEvents, assignedEventIds, currentUserId, firstName, isSp, scheduleMatchName]);

  const effectiveScope: DashboardScope = useMemo(() => {
    if (!canViewOrganizationScope || isFaculty || isSp) return "workspace";
    return scope;
  }, [canViewOrganizationScope, isFaculty, isSp, scope]);

  const scopedEvents = effectiveScope === "organization" ? allUpcomingEvents : workspaceEvents;
  const eventsById = useMemo(() => new Map(allUpcomingEvents.map((item) => [item.event.id, item])), [allUpcomingEvents]);

  const activeOrganizationName = asText(me?.activeOrganization?.name) || "CFSP Workspace";
  const memberships = (me?.memberships || []).filter((membership) => asText(membership.organization_id) && asText(membership.organization?.name));
  const showOrganizationSwitcher = memberships.length > 1;

  const liveTodayCount = scopedEvents.filter((item) => item.liveToday).length;
  const startsSoonCount = scopedEvents.filter((item) => item.startsSoon).length;
  const needsActionCount = scopedEvents.filter((item) => item.issueList.length > 0).length;

  const commandTileItems = useMemo(
    () =>
      [
        {
          key: "today" as CommandFilter,
          label: "Live / Today",
          value: eventCountsUnavailable ? "Unavailable" : liveTodayCount,
          isActive: !eventCountsUnavailable && liveTodayCount > 0,
          description: "Events running today",
        },
        {
          key: "soon" as CommandFilter,
          label: "Starts Soon",
          value: eventCountsUnavailable ? "Unavailable" : startsSoonCount,
          isActive: !eventCountsUnavailable && startsSoonCount > 0,
          description: "Starts within 48 hours",
        },
        {
          key: "needs" as CommandFilter,
          label: "Needs Action",
          value: eventCountsUnavailable ? "Unavailable" : needsActionCount,
          isActive: !eventCountsUnavailable && needsActionCount > 0,
          description: "Operational issues to resolve",
        },
        ...(canManageOrganization
          ? [
              {
                key: "access" as CommandFilter,
                label: "Access Queue",
                value: accessQueueCount,
                isActive: accessQueueCount > 0,
                description: accessQueueLoading ? "Loading approvals..." : "Pending access requests",
              },
            ]
          : []),
      ],
    [accessQueueCount, accessQueueLoading, canManageOrganization, eventCountsUnavailable, liveTodayCount, needsActionCount, startsSoonCount]
  );

  const operationalRadar = useMemo(() => {
    return scopedEvents
      .map((item) => {
        const primaryIssue = item.issueList[0] || "Operational review";
        let primaryAction: { label: string; href: string } = {
          label: "Open Command Center",
          href: getEventActionHref(item.event.id, "command"),
        };
        let secondaryAction: { label: string; href: string } | null = {
          label: "Open Schedule",
          href: getEventActionHref(item.event.id, "schedule"),
        };

        if (item.shortage > 0) {
          primaryAction = { label: "Open Staffing", href: getEventActionHref(item.event.id, "staffing") };
          secondaryAction = { label: "Open Command Center", href: getEventActionHref(item.event.id, "command") };
        } else if (primaryIssue.includes("schedule")) {
          primaryAction = { label: "Resume Builder", href: getEventActionHref(item.event.id, "builder") };
          secondaryAction = { label: "Open Command Center", href: getEventActionHref(item.event.id, "command") };
        } else if (primaryIssue.includes("Faculty packet")) {
          primaryAction = { label: "Send Faculty Packet", href: getEventActionHref(item.event.id, "facultyPacket") };
          secondaryAction = { label: "Open Command Center", href: getEventActionHref(item.event.id, "command") };
        } else if (primaryIssue.includes("Recording") || primaryIssue.includes("Case files")) {
          primaryAction = { label: "Open Materials", href: getEventActionHref(item.event.id, "materials") };
          secondaryAction = { label: "Open Command Center", href: getEventActionHref(item.event.id, "command") };
        }

        const urgency =
          (item.liveToday ? 50 : 0) +
          (item.startsSoon ? 30 : 0) +
          (item.issueList.length > 0 ? 20 : 0) +
          Math.min(item.shortage, 5) * 5;

        return {
          eventId: item.event.id,
          eventName: asText(item.event.name) || "Untitled Event",
          whenLabel: formatDateTime(item.start, item.event.date_text),
          locationLabel: item.locationLabel,
          issueSummary: primaryIssue,
          urgency,
          issueCount: item.issueList.length,
          primaryAction,
          secondaryAction,
        };
      })
      .sort((a, b) => b.urgency - a.urgency || a.whenLabel.localeCompare(b.whenLabel));
  }, [scopedEvents]);

  const filteredRadar = useMemo(() => {
    if (commandFilter === "today") return operationalRadar.filter((item) => {
      const source = eventsById.get(item.eventId);
      return Boolean(source?.liveToday);
    });
    if (commandFilter === "soon") return operationalRadar.filter((item) => {
      const source = eventsById.get(item.eventId);
      return Boolean(source?.startsSoon);
    });
    if (commandFilter === "needs") return operationalRadar.filter((item) => item.issueCount > 0);
    if (commandFilter === "access") return canManageOrganization ? operationalRadar : [];
    return operationalRadar;
  }, [canManageOrganization, commandFilter, eventsById, operationalRadar]);

  const activeTriageItems = useMemo(
    () => filteredRadar.filter((item) => !reviewedEventIds.includes(item.eventId)),
    [filteredRadar, reviewedEventIds]
  );
  const triageItems = activeTriageItems.length ? activeTriageItems : filteredRadar;
  const featuredTriageItem = triageItems.length ? triageItems[Math.min(selectedTriageIndex, triageItems.length - 1)] : null;
  const featuredEvent = featuredTriageItem ? eventsById.get(featuredTriageItem.eventId) || null : null;
  const nextEventCountdown = formatCountdown(scopedEvents.find((item) => item.start && item.start >= currentTime)?.start || null, currentTime);

  useEffect(() => {
    setSelectedTriageIndex(0);
  }, [commandFilter, effectiveScope, commandQuery]);

  useEffect(() => {
    if (selectedTriageIndex <= Math.max(triageItems.length - 1, 0)) return;
    setSelectedTriageIndex(Math.max(triageItems.length - 1, 0));
  }, [selectedTriageIndex, triageItems.length]);

  useEffect(() => {
    function handleTriageKeys(event: KeyboardEvent) {
      if (viewMode !== "command" || isTypingTarget(event.target) || !triageItems.length) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      setSelectedTriageIndex((current) => {
        if (event.key === "ArrowLeft") return current <= 0 ? triageItems.length - 1 : current - 1;
        return current >= triageItems.length - 1 ? 0 : current + 1;
      });
    }

    window.addEventListener("keydown", handleTriageKeys);
    return () => window.removeEventListener("keydown", handleTriageKeys);
  }, [triageItems.length, viewMode]);

  const selectedCalendarDate = useMemo(() => {
    const parsed = new Date(`${selectedDate}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }, [selectedDate]);

  const calendarEntries = useMemo(() => {
    return scopedEvents
      .flatMap((item) =>
        getEventDateKeys(item).map((entry) => ({
          id: `${item.event.id}-${entry.dateKey}`,
          dateKey: entry.dateKey,
          item,
          timeLabel: entry.timeLabel,
          locationLabel: entry.locationLabel,
        }) satisfies CalendarEventEntry)
      )
      .sort((a, b) => {
        const aTime = a.item.start?.getTime() ?? 0;
        const bTime = b.item.start?.getTime() ?? 0;
        return a.dateKey.localeCompare(b.dateKey) || aTime - bTime || (asText(a.item.event.name)).localeCompare(asText(b.item.event.name));
      });
  }, [scopedEvents]);

  const calendarEntriesByDate = useMemo(() => {
    const grouped = new Map<string, CalendarEventEntry[]>();
    calendarEntries.forEach((entry) => {
      const bucket = grouped.get(entry.dateKey) || [];
      if (!bucket.some((candidate) => candidate.item.event.id === entry.item.event.id)) {
        bucket.push(entry);
      }
      grouped.set(entry.dateKey, bucket);
    });
    return grouped;
  }, [calendarEntries]);

  const monthCalendarDays = useMemo(() => {
    return getMonthGridDates(selectedCalendarDate).map((date) => {
      const key = toDateInputValue(date);
      const eventsForDay = calendarEntriesByDate.get(key) || [];
      return {
        date,
        key,
        events: eventsForDay,
        isCurrentMonth: date.getMonth() === selectedCalendarDate.getMonth(),
        isToday: isSameDay(date, currentTime),
        isSelected: key === selectedDate,
        needsActionCount: eventsForDay.filter((entry) => entry.item.issueList.length > 0).length,
      };
    });
  }, [calendarEntriesByDate, currentTime, selectedCalendarDate, selectedDate]);

  const weekDays = useMemo(() => {
    const start = getStartOfCalendarWeek(selectedCalendarDate);
    return Array.from({ length: 7 }).map((_, index) => {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
      const key = toDateInputValue(date);
      const dayEvents = calendarEntriesByDate.get(key) || [];
      return {
        date,
        key,
        events: dayEvents,
        needsActionCount: dayEvents.filter((entry) => entry.item.issueList.length > 0).length,
      };
    });
  }, [calendarEntriesByDate, selectedCalendarDate]);

  const dayDrawerEvents = useMemo(() => {
    if (!dayDrawerDate) return [] as CalendarEventEntry[];
    return calendarEntriesByDate.get(dayDrawerDate) || [];
  }, [calendarEntriesByDate, dayDrawerDate]);

  const agendaEvents = useMemo(() => {
    const start = new Date(`${selectedDate}T00:00:00`);
    const safeStart = Number.isNaN(start.getTime()) ? new Date() : start;
    const end = new Date(safeStart.getFullYear(), safeStart.getMonth(), safeStart.getDate() + 14);
    return scopedEvents.filter((item) => {
      if (!item.start) return false;
      const time = item.start.getTime();
      return time >= safeStart.getTime() && time <= end.getTime();
    });
  }, [scopedEvents, selectedDate]);

  const timelineEvents = useMemo(
    () =>
      scopedEvents
        .filter((item) => item.rounds > 0 || item.scheduleStatus === "complete")
        .slice(0, 10),
    [scopedEvents]
  );

  const todayPrimaryEvent = scopedEvents.find((item) => item.liveToday) || scopedEvents[0] || null;

  const smartLaunchActions = useMemo<SmartAction[]>(
    () => [
      {
        id: "create-event",
        label: "Create Event",
        description: "Start a new operational event",
        href: "/events/new",
        visible: canOperate,
      },
      {
        id: "upload-roster",
        label: "Upload Roster",
        description: "Import learners and scheduling data",
        href: "/events/upload",
        visible: canOperate,
      },
      {
        id: "open-today",
        label: "Open Today's Command Center",
        description: todayPrimaryEvent ? (asText(todayPrimaryEvent.event.name) || "Open first event") : "No event today",
        href: todayPrimaryEvent ? getEventActionHref(todayPrimaryEvent.event.id, "command") : "/events",
        visible: true,
      },
      {
        id: "review-access",
        label: "Review Access Requests",
        description: accessQueueLoading ? "Loading queue..." : `${accessQueueCount} pending request${accessQueueCount === 1 ? "" : "s"}`,
        href: "/settings/users",
        visible: canManageOrganization,
      },
      {
        id: "open-sp-finder",
        label: "Open SP Finder",
        description: "Review and match SP coverage",
        href: "/sps",
        visible: canOperate,
      },
    ],
    [accessQueueCount, accessQueueLoading, canManageOrganization, canOperate, todayPrimaryEvent]
  );

  const visibleSmartActions = smartLaunchActions.filter((action) => action.visible);

  const searchEvents = scopedEvents;
  const searchTokens = normalizeText(commandQuery);
  const hasSearch = searchTokens.length > 0;

  const eventSearchResults = useMemo(() => {
    if (!hasSearch) return [] as EventDerived[];
    return searchEvents
      .filter((item) => {
        const notes = asText(item.event.notes);
        const sessionText = (item.event.sessions || [])
          .map((session) => [session.session_date, session.start_time, session.end_time, session.location, session.room].map(asText).join(" "))
          .join(" ");
        const text = normalizeText(
          [
            item.event.name,
            item.event.status,
            item.event.date_text,
            item.locationLabel,
            notes,
            sessionText,
            item.rounds,
            item.rooms,
            item.learners,
          ].join(" ")
        );
        return text.includes(searchTokens);
      })
      .slice(0, 8);
  }, [hasSearch, searchEvents, searchTokens]);

  const spSearchResults = useMemo(() => {
    if (!hasSearch) return [] as Array<{ name: string; eventId: string; eventName: string }>;
    const map = new Map<string, { name: string; eventId: string; eventName: string }>();
    searchEvents.forEach((item) => {
      (item.event.assigned_sp_names || [])
        .map((name) => asText(name))
        .filter(Boolean)
        .forEach((name) => {
          const key = normalizeText(name);
          if (!key.includes(searchTokens) || map.has(key)) return;
          map.set(key, {
            name,
            eventId: item.event.id,
            eventName: asText(item.event.name) || "Untitled Event",
          });
        });
    });
    return Array.from(map.values()).slice(0, 6);
  }, [hasSearch, searchEvents, searchTokens]);

  const facultySearchResults = useMemo(() => {
    if (!hasSearch) return [] as Array<{ name: string; eventId: string; eventName: string }>;
    const map = new Map<string, { name: string; eventId: string; eventName: string }>();
    searchEvents.forEach((item) => {
      const metadata = parseEventMetadata(item.event.notes).training;
      const notes = asText(item.event.notes);
      const names = [
        ...splitPeopleList(asText(metadata.faculty_names)),
        ...splitPeopleList(asText(metadata.sim_contact)),
        ...getNotesRosterLine(notes, /^Course Faculty\s*:\s*(.+)$/i),
        ...getNotesRosterLine(notes, /^Faculty\s*:\s*(.+)$/i),
      ];
      names
        .map((name) => asText(name))
        .filter(Boolean)
        .forEach((name) => {
          const key = normalizeText(name);
          if (!key.includes(searchTokens) || map.has(key)) return;
          map.set(key, {
            name,
            eventId: item.event.id,
            eventName: asText(item.event.name) || "Untitled Event",
          });
        });
    });
    return Array.from(map.values()).slice(0, 6);
  }, [hasSearch, searchEvents, searchTokens]);

  const actionSearchResults = useMemo(() => {
    if (!hasSearch) return [] as SmartAction[];
    return visibleSmartActions
      .filter((action) => normalizeText(`${action.label} ${action.description}`).includes(searchTokens))
      .slice(0, 6);
  }, [hasSearch, searchTokens, visibleSmartActions]);

  const previewEvent = previewEventId ? eventsById.get(previewEventId) || null : null;

  function rememberResume(entry: ResumeEntry) {
    const next = Array.from(
      new Map(
        [entry, ...resumeWork].map((item) => [`${item.eventId}:${item.route}`, item])
      ).values()
    )
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, MAX_RESUME_ITEMS);
    setResumeWork(next);
    saveResumeWork(next);
  }

  function handleNavigateToAction(href: string, eventInfo?: { eventId: string; eventName: string; toolLabel: string }) {
    if (eventInfo) {
      rememberResume({
        eventId: eventInfo.eventId,
        eventName: eventInfo.eventName,
        route: href,
        toolLabel: eventInfo.toolLabel,
        updatedAt: new Date().toISOString(),
      });
    }
    router.push(href);
  }

  function handleCalendarDateSelect(dateKey: string, openDrawer = true) {
    setSelectedDate(dateKey);
    if (openDrawer) setDayDrawerDate(dateKey);
  }

  function handleCalendarToday() {
    const todayKey = toDateInputValue(new Date());
    handleCalendarDateSelect(todayKey, true);
  }

  function handleCalendarStep(direction: -1 | 1) {
    const nextDate =
      calendarTab === "week"
        ? addCalendarDays(selectedCalendarDate, direction * 7)
        : addCalendarMonths(selectedCalendarDate, direction);
    handleCalendarDateSelect(toDateInputValue(nextDate), false);
  }

  function openEventCommandCenter(entry: CalendarEventEntry) {
    handleNavigateToAction(getEventActionHref(entry.item.event.id, "command"), {
      eventId: entry.item.event.id,
      eventName: asText(entry.item.event.name) || "Untitled Event",
      toolLabel: "Command Center",
    });
  }

  async function handleOrganizationChange(organizationId: string) {
    const activeOrganizationId = asText(me?.activeOrganization?.id);
    if (!organizationId || organizationId === activeOrganizationId) return;

    setOrganizationSwitching(true);
    setError("");
    setErrorSource("");
    try {
      const result = await fetchDashboardJson<Record<string, unknown> & ApiResponseWithError>("/api/organizations/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organization_id: organizationId }),
      });
      if (!result.ok || !result.body || result.body.ok !== true) {
        setError(DASHBOARD_FEED_UNAVAILABLE_MESSAGE);
        setErrorSource("organizations");
        return;
      }
      window.location.reload();
    } catch {
      setError(DASHBOARD_FEED_UNAVAILABLE_MESSAGE);
      setErrorSource("organizations");
    } finally {
      setOrganizationSwitching(false);
    }
  }

  const dashboardFeedIssues = useMemo(() => {
    const issues: Array<{ source: DashboardFeedSource; message: string }> = [];
    if (error && errorSource) issues.push({ source: errorSource, message: error });
    if (accessQueueError && accessQueueErrorSource) {
      issues.push({ source: accessQueueErrorSource, message: accessQueueError });
    }
    return issues;
  }, [accessQueueError, accessQueueErrorSource, error, errorSource]);
  const dashboardIssuesAreNonBlocking =
    dashboardFeedIssues.length > 0 &&
    dashboardFeedIssues.every((issue) => issue.source !== "events" || events.length > 0);
  const currentWorkItem = resumeWork[0] || null;

  function handleRetryDashboardFeeds() {
    setRefreshSeed((current) => current + 1);
  }

  if (authState === "loading") {
    return (
      <main className="cfsp-page">
        <div className="cfsp-container">
          <div className="cfsp-panel px-6 py-8">
            <h1 className="text-3xl font-black text-[var(--cfsp-text)]">Loading Command Module...</h1>
            <p className="mt-3 text-[var(--cfsp-text-muted)]">Preparing your operations home base.</p>
          </div>
        </div>
      </main>
    );
  }

  if (authState === "guest") return null;

  if (isSp) {
    return (
      <SiteShell
        title="Command Module"
        subtitle={`Operations home base for ${activeOrganizationName}`}
      >
        <div className="mx-auto grid w-full max-w-6xl gap-4 px-3 py-1 md:px-0">
          <section className="cfsp-panel px-5 py-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="cfsp-kicker">SP Home</p>
                <h2 className="text-2xl font-black text-[var(--cfsp-text)]">Assigned Events</h2>
                <p className="mt-2 text-sm font-semibold text-[var(--cfsp-text-muted)]">
                  Track assigned events, training access, and upcoming check-in times.
                </p>
              </div>
              <span className="rounded-full border border-[var(--cfsp-border)] bg-[var(--cfsp-surface-muted)] px-3 py-1 text-xs font-black uppercase tracking-[0.1em] text-[var(--cfsp-blue)]">
                {roleLabel(organizationRole)}
              </span>
            </div>
          </section>

          {asText(me?.sp_link?.status).toLowerCase() !== "linked" ? (
            <section className="cfsp-alert cfsp-alert-info">
              {asText(me?.sp_link?.onboarding_message) || "Your SP account is awaiting directory matching."}
            </section>
          ) : null}

          <section className="grid gap-3">
            {(workspaceEvents.length ? workspaceEvents : allUpcomingEvents).slice(0, 10).map((item) => (
              <article key={item.event.id} className="cfsp-panel px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-black text-[var(--cfsp-text)]">{asText(item.event.name) || "Untitled Event"}</h3>
                    <div className="mt-1 text-sm font-semibold text-[var(--cfsp-text-muted)]">
                      {formatDateTime(item.start, item.event.date_text)} · {item.locationLabel}
                    </div>
                  </div>
                  <Link href={getEventActionHref(item.event.id, "command")} className="cfsp-btn cfsp-btn-secondary">
                    Open Event
                  </Link>
                </div>
              </article>
            ))}
            {!workspaceEvents.length && !allUpcomingEvents.length ? (
              <section className="cfsp-panel px-5 py-5 text-sm font-semibold text-[var(--cfsp-text-muted)]">
                No assigned upcoming events yet.
              </section>
            ) : null}
          </section>
        </div>
      </SiteShell>
    );
  }

  return (
    <SiteShell
      title="Command Module"
      subtitle={`Operations home base for ${activeOrganizationName}`}
    >
      <div className="mx-auto grid w-full max-w-7xl gap-4 px-3 py-1 md:px-0">
        <style>{`
          .cfsp-command-matrix {
            background:
              linear-gradient(135deg, rgba(255,255,255,0.97), rgba(237,253,255,0.9)),
              radial-gradient(circle at 18% 8%, rgba(20,184,166,0.18), transparent 30%),
              radial-gradient(circle at 86% 8%, rgba(14,165,233,0.16), transparent 26%);
            position: relative;
            overflow: hidden;
          }
          .cfsp-command-matrix::before {
            content: "";
            position: absolute;
            inset: 0;
            background-image:
              linear-gradient(rgba(20,91,150,0.07) 1px, transparent 1px),
              linear-gradient(90deg, rgba(20,91,150,0.07) 1px, transparent 1px);
            background-size: 34px 34px;
            mask-image: linear-gradient(90deg, rgba(0,0,0,0.58), transparent 82%);
            pointer-events: none;
          }
          .cfsp-command-matrix::after {
            content: "";
            position: absolute;
            inset: 0;
            background: linear-gradient(90deg, transparent, rgba(34,211,238,0.2), transparent);
            transform: translateX(-110%);
            animation: cfspScan 8s ease-in-out infinite;
            pointer-events: none;
          }
          .cfsp-time-core {
            background: conic-gradient(from 90deg, rgba(20,184,166,0.14), rgba(14,165,233,0.36), rgba(20,184,166,0.14), rgba(255,255,255,0.8));
          }
          .cfsp-time-core::before {
            content: "";
            position: absolute;
            inset: 8px;
            border-radius: 999px;
            border: 1px solid rgba(14,165,233,0.34);
            animation: cfspPulse 2.6s ease-in-out infinite;
          }
          .cfsp-time-sweep {
            transform: rotate(calc(var(--seconds) * 6deg));
            transform-origin: 50% 50%;
            transition: transform 0.2s linear;
          }
          .cfsp-signal-active {
            animation: cfspTilePulse 2.8s ease-in-out infinite;
          }
          .cfsp-triage-card {
            transition: transform 260ms ease, opacity 260ms ease, box-shadow 260ms ease;
          }
          @keyframes cfspScan {
            0%, 42% { transform: translateX(-110%); opacity: 0; }
            50% { opacity: 1; }
            72%, 100% { transform: translateX(110%); opacity: 0; }
          }
          @keyframes cfspPulse {
            0%, 100% { transform: scale(0.96); opacity: 0.62; }
            50% { transform: scale(1.03); opacity: 1; }
          }
          @keyframes cfspTilePulse {
            0%, 100% { box-shadow: 0 12px 28px rgba(14,165,233,0.08); }
            50% { box-shadow: 0 18px 38px rgba(20,184,166,0.18); }
          }
          @media (prefers-reduced-motion: reduce) {
            .cfsp-command-matrix::after,
            .cfsp-time-core::before,
            .cfsp-signal-active {
              animation: none !important;
            }
            .cfsp-time-sweep {
              transition: none !important;
            }
          }
        `}</style>

        <section className="cfsp-panel cfsp-command-matrix px-5 py-5">
          <div className="relative grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-center">
            <div className="grid gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="cfsp-kicker">SIM OPS HUB</p>
                <h2 className="text-3xl font-black text-[var(--cfsp-text)] md:text-4xl">SimVitals Command</h2>
                <div className="mt-2 flex flex-wrap gap-2 text-sm font-bold text-[var(--cfsp-text-muted)]">
                  <span>{activeOrganizationName}</span>
                  <span>•</span>
                  <span>{formatCommandDate(currentTime)}</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-cyan-200 bg-white/80 px-3 py-1 text-xs font-black uppercase tracking-[0.1em] text-cyan-700 shadow-[0_8px_22px_rgba(14,165,233,0.12)]">
                  {roleLabel(organizationRole)}
                </span>
                {showOrganizationSwitcher ? (
                  <select
                    value={asText(me?.activeOrganization?.id)}
                    onChange={(event) => void handleOrganizationChange(event.target.value)}
                    disabled={organizationSwitching}
                    className="cfsp-input min-w-[210px] bg-white/85"
                    aria-label="Switch organization"
                  >
                    {memberships.map((membership) => (
                      <option key={membership.organization_id} value={membership.organization_id}>
                        {asText(membership.organization?.name)}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
            </div>

            <div className="grid gap-3 xl:grid-cols-[1fr_auto_auto] xl:items-end">
              <div className="relative">
                <input
                  ref={commandSearchRef}
                  value={commandQuery}
                  onChange={(event) => {
                    setCommandQuery(event.target.value);
                    setSearchOpen(Boolean(asText(event.target.value)));
                  }}
                  onFocus={() => setSearchOpen(Boolean(commandQuery.trim()))}
                  placeholder="Search events, SPs, faculty, rooms, courses, schedules..."
                  className="cfsp-input w-full bg-white/90 shadow-[0_10px_26px_rgba(14,165,233,0.09)]"
                  aria-label="Command search"
                />
                {searchOpen && hasSearch ? (
                  <div
                    className="absolute left-0 right-0 z-30 mt-2 grid max-h-[430px] overflow-y-auto rounded-[14px] border border-[var(--cfsp-border)] bg-[var(--cfsp-surface)] p-2 shadow-[0_16px_36px_rgba(20,91,150,0.16)]"
                    role="listbox"
                  >
                    {eventSearchResults.length ? (
                      <div className="mb-2 grid gap-1">
                        <div className="px-2 text-[0.68rem] font-black uppercase tracking-[0.12em] text-[var(--cfsp-text-muted)]">Events</div>
                        {eventSearchResults.map((item) => (
                          <button
                            key={`search-event-${item.event.id}`}
                            type="button"
                            onClick={() => {
                              setPreviewEventId(item.event.id);
                              setSearchOpen(false);
                            }}
                            className="rounded-[10px] border border-[var(--cfsp-border)] bg-[var(--cfsp-surface-muted)] px-3 py-2 text-left transition hover:border-[var(--cfsp-blue)]"
                          >
                            <div className="text-sm font-black text-[var(--cfsp-text)]">{asText(item.event.name) || "Untitled Event"}</div>
                            <div className="text-xs font-semibold text-[var(--cfsp-text-muted)]">{formatDateTime(item.start, item.event.date_text)} · {item.locationLabel}</div>
                          </button>
                        ))}
                      </div>
                    ) : null}

                    {spSearchResults.length ? (
                      <div className="mb-2 grid gap-1">
                        <div className="px-2 text-[0.68rem] font-black uppercase tracking-[0.12em] text-[var(--cfsp-text-muted)]">SPs</div>
                        {spSearchResults.map((entry) => (
                          <button
                            key={`search-sp-${entry.eventId}-${entry.name}`}
                            type="button"
                            onClick={() => {
                              setPreviewEventId(entry.eventId);
                              setSearchOpen(false);
                            }}
                            className="rounded-[10px] border border-[var(--cfsp-border)] bg-[var(--cfsp-surface-muted)] px-3 py-2 text-left transition hover:border-[var(--cfsp-blue)]"
                          >
                            <div className="text-sm font-black text-[var(--cfsp-text)]">{entry.name}</div>
                            <div className="text-xs font-semibold text-[var(--cfsp-text-muted)]">Event: {entry.eventName}</div>
                          </button>
                        ))}
                      </div>
                    ) : null}

                    {facultySearchResults.length ? (
                      <div className="mb-2 grid gap-1">
                        <div className="px-2 text-[0.68rem] font-black uppercase tracking-[0.12em] text-[var(--cfsp-text-muted)]">Faculty</div>
                        {facultySearchResults.map((entry) => (
                          <button
                            key={`search-faculty-${entry.eventId}-${entry.name}`}
                            type="button"
                            onClick={() => {
                              setPreviewEventId(entry.eventId);
                              setSearchOpen(false);
                            }}
                            className="rounded-[10px] border border-[var(--cfsp-border)] bg-[var(--cfsp-surface-muted)] px-3 py-2 text-left transition hover:border-[var(--cfsp-blue)]"
                          >
                            <div className="text-sm font-black text-[var(--cfsp-text)]">{entry.name}</div>
                            <div className="text-xs font-semibold text-[var(--cfsp-text-muted)]">Event: {entry.eventName}</div>
                          </button>
                        ))}
                      </div>
                    ) : null}

                    {actionSearchResults.length ? (
                      <div className="mb-1 grid gap-1">
                        <div className="px-2 text-[0.68rem] font-black uppercase tracking-[0.12em] text-[var(--cfsp-text-muted)]">Actions</div>
                        {actionSearchResults.map((action) => (
                          <button
                            key={`search-action-${action.id}`}
                            type="button"
                            onClick={() => {
                              setSearchOpen(false);
                              handleNavigateToAction(action.href);
                            }}
                            className="rounded-[10px] border border-[var(--cfsp-border)] bg-[var(--cfsp-surface-muted)] px-3 py-2 text-left transition hover:border-[var(--cfsp-blue)]"
                          >
                            <div className="text-sm font-black text-[var(--cfsp-text)]">{action.label}</div>
                            <div className="text-xs font-semibold text-[var(--cfsp-text-muted)]">{action.description}</div>
                          </button>
                        ))}
                      </div>
                    ) : null}

                    {!eventSearchResults.length && !spSearchResults.length && !facultySearchResults.length && !actionSearchResults.length ? (
                      <div className="rounded-[10px] border border-dashed border-[var(--cfsp-border)] px-3 py-4 text-sm font-semibold text-[var(--cfsp-text-muted)]">
                        No matches found.
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="inline-flex rounded-[12px] border border-[var(--cfsp-border)] bg-[var(--cfsp-surface-muted)] p-1">
                <button
                  type="button"
                  onClick={() => setScope("workspace")}
                  className="rounded-[9px] px-3 py-2 text-sm font-black transition"
                  style={{
                    background: effectiveScope === "workspace" ? "var(--cfsp-blue)" : "transparent",
                    color: effectiveScope === "workspace" ? "#fff" : "var(--cfsp-text-muted)",
                  }}
                >
                  My Workspace
                </button>
                {canViewOrganizationScope && !isFaculty ? (
                  <button
                    type="button"
                    onClick={() => setScope("organization")}
                    className="rounded-[9px] px-3 py-2 text-sm font-black transition"
                    style={{
                      background: effectiveScope === "organization" ? "var(--cfsp-blue)" : "transparent",
                      color: effectiveScope === "organization" ? "#fff" : "var(--cfsp-text-muted)",
                    }}
                  >
                    Organization View
                  </button>
                ) : null}
              </div>

              <div className="inline-flex rounded-[12px] border border-[var(--cfsp-border)] bg-[var(--cfsp-surface-muted)] p-1">
                {(["command", "calendar", "agenda"] as DashboardView[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setViewMode(mode)}
                    className="rounded-[9px] px-3 py-2 text-sm font-black capitalize transition"
                    style={{
                      background: viewMode === mode ? "var(--cfsp-green-dark)" : "transparent",
                      color: viewMode === mode ? "#fff" : "var(--cfsp-text-muted)",
                    }}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-xs font-semibold text-[var(--cfsp-text-muted)]">Press `/` or `Cmd/Ctrl+K` to focus search.</div>
            </div>
            <div className="relative mx-auto grid aspect-square w-full max-w-[210px] place-items-center rounded-full border border-cyan-200 bg-white/75 p-3 shadow-[0_18px_46px_rgba(14,165,233,0.16)]">
              <div className="cfsp-time-core absolute inset-3 rounded-full" />
              <div
                className="cfsp-time-sweep absolute inset-5 rounded-full"
                style={{ "--seconds": currentTime.getSeconds() } as CSSProperties}
              >
                <span className="absolute left-1/2 top-0 h-3 w-3 -translate-x-1/2 rounded-full bg-cyan-500 shadow-[0_0_18px_rgba(6,182,212,0.75)]" />
              </div>
              <div className="relative grid h-[72%] w-[72%] place-items-center rounded-full border border-white bg-white/90 text-center shadow-inner">
                <div>
                  <div className="text-[0.62rem] font-black uppercase tracking-[0.16em] text-cyan-700">Time Core</div>
                  <div className="mt-1 text-xl font-black text-[var(--cfsp-text)]">{formatClockTime(currentTime)}</div>
                  <div className="mt-1 text-[0.68rem] font-bold text-[var(--cfsp-text-muted)]">Next event: {nextEventCountdown}</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="cfsp-panel px-5 py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="cfsp-kicker">Recovery</p>
              <h3 className="text-xl font-black text-[var(--cfsp-text)]">Recently Worked On</h3>
              <p className="mt-1 text-sm font-semibold text-[var(--cfsp-text-muted)]">
                Fast way back to the event pages and builders you opened most recently on this device.
              </p>
            </div>
            {currentWorkItem ? (
              <div className="rounded-2xl border border-cyan-100 bg-cyan-50/70 px-4 py-3">
                <div className="text-xs font-black uppercase tracking-[0.12em] text-cyan-800">Continue</div>
                <div className="mt-1 text-sm font-black text-[var(--cfsp-text)]">{currentWorkItem.eventName}</div>
                <div className="mt-1 text-xs font-bold text-[var(--cfsp-text-muted)]">{currentWorkItem.toolLabel} · {formatResumeUpdatedAt(currentWorkItem.updatedAt)}</div>
              </div>
            ) : null}
          </div>

          {currentWorkItem ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleNavigateToAction(getEventActionHref(currentWorkItem.eventId, "command"), {
                  eventId: currentWorkItem.eventId,
                  eventName: currentWorkItem.eventName,
                  toolLabel: "Command Center",
                })}
                className="cfsp-btn cfsp-btn-primary"
              >
                Open Command Center
              </button>
              <button
                type="button"
                onClick={() => handleNavigateToAction(getEventActionHref(currentWorkItem.eventId, "builder"), {
                  eventId: currentWorkItem.eventId,
                  eventName: currentWorkItem.eventName,
                  toolLabel: "Schedule Builder",
                })}
                className="cfsp-btn cfsp-btn-secondary"
              >
                Resume Builder
              </button>
            </div>
          ) : null}

          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {resumeWork.length ? (
              resumeWork.map((entry) => (
                <article key={`${entry.eventId}:${entry.route}`} className="rounded-[14px] border border-[var(--cfsp-border)] bg-white px-4 py-3 shadow-sm">
                  <div className="text-sm font-black text-[var(--cfsp-text)]">{entry.eventName}</div>
                  <div className="mt-1 text-xs font-bold text-[var(--cfsp-text-muted)]">
                    {entry.toolLabel} · {formatResumeUpdatedAt(entry.updatedAt)}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleNavigateToAction(getEventActionHref(entry.eventId, "command"), {
                        eventId: entry.eventId,
                        eventName: entry.eventName,
                        toolLabel: "Command Center",
                      })}
                      className="rounded-[9px] border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-black text-cyan-800"
                    >
                      Open Event
                    </button>
                    <button
                      type="button"
                      onClick={() => handleNavigateToAction(getEventActionHref(entry.eventId, "builder"), {
                        eventId: entry.eventId,
                        eventName: entry.eventName,
                        toolLabel: "Schedule Builder",
                      })}
                      className="rounded-[9px] border border-[var(--cfsp-border)] bg-[var(--cfsp-surface-muted)] px-2.5 py-1 text-xs font-black text-[var(--cfsp-text-muted)]"
                    >
                      Resume Builder
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <div className="rounded-[14px] border border-dashed border-[var(--cfsp-border)] bg-[var(--cfsp-surface-muted)] px-4 py-4 text-sm font-bold text-[var(--cfsp-text-muted)] md:col-span-2 xl:col-span-4">
                Open an Event Command Center or Schedule Builder and it will appear here for quick recovery.
              </div>
            )}
          </div>
        </section>

        {viewMode === "command" ? (
          <div className="grid gap-4">
            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {commandTileItems.map((tile) => (
                <button
                  key={`command-tile-${tile.key}`}
                  type="button"
                  onClick={() => {
                    if (tile.key === "access" && canManageOrganization) {
                      setCommandFilter("access");
                      handleNavigateToAction("/settings/users");
                      return;
                    }
                    setCommandFilter(commandFilter === tile.key ? "all" : tile.key);
                  }}
                  className={`rounded-[12px] border border-cyan-100 bg-white/90 px-4 py-3 text-left shadow-[0_10px_24px_rgba(14,165,233,0.08)] transition hover:-translate-y-[2px] hover:border-cyan-300 ${tile.isActive ? "cfsp-signal-active" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[0.68rem] font-black uppercase tracking-[0.12em] text-cyan-700">{tile.label}</div>
                    <span className="h-2 w-2 rounded-full bg-teal-400 shadow-[0_0_14px_rgba(45,212,191,0.8)]" />
                  </div>
                  <div className="mt-2 text-2xl font-black text-[var(--cfsp-text)]">{tile.value}</div>
                  <div className="mt-1 text-xs font-bold text-[var(--cfsp-text-muted)]">{tile.description}</div>
                </button>
              ))}
            </section>

            <section className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.85fr)]">
              <article className="cfsp-panel overflow-hidden border-cyan-100 bg-white/95 px-5 py-5 shadow-[0_18px_42px_rgba(14,165,233,0.1)]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="cfsp-kicker">Operational Triage</p>
                    <h3 className="text-xl font-black text-[var(--cfsp-text)]">Event Triage Deck</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {commandFilter !== "all" ? (
                      <button
                        type="button"
                        onClick={() => setCommandFilter("all")}
                        className="rounded-[8px] border border-[var(--cfsp-border)] bg-[var(--cfsp-surface-muted)] px-2.5 py-1 text-xs font-black text-[var(--cfsp-text-muted)]"
                      >
                        Clear filter
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setReviewedEventIds([])}
                      className="rounded-[8px] border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-black text-cyan-800"
                    >
                      Reset reviewed
                    </button>
                  </div>
                </div>

                {featuredTriageItem && featuredEvent ? (
                  <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
                    <div
                      key={featuredTriageItem.eventId}
                      className="cfsp-triage-card rounded-[18px] border border-cyan-200 bg-[linear-gradient(135deg,#ffffff,#effcff)] p-5 shadow-[0_22px_48px_rgba(14,165,233,0.14)]"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-[0.7rem] font-black uppercase tracking-[0.14em] text-teal-700">
                            Priority {Math.min(selectedTriageIndex + 1, triageItems.length)} of {triageItems.length}
                          </div>
                          <h4 className="mt-2 text-2xl font-black text-[var(--cfsp-text)]">{featuredTriageItem.eventName}</h4>
                          <div className="mt-2 text-sm font-bold text-[var(--cfsp-text-muted)]">
                            {featuredTriageItem.whenLabel} · {featuredTriageItem.locationLabel}
                          </div>
                        </div>
                        <div className="rounded-full border border-cyan-200 bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.1em] text-cyan-800">
                          {featuredEvent.liveToday ? "Live Today" : featuredEvent.startsSoon ? "Starts Soon" : "Queued"}
                        </div>
                      </div>

                      <div className="mt-4 rounded-[14px] border border-cyan-100 bg-white/75 px-4 py-3">
                        <div className="text-[0.68rem] font-black uppercase tracking-[0.12em] text-[var(--cfsp-text-muted)]">Status reason</div>
                        <div className="mt-1 text-base font-black text-[var(--cfsp-text)]">{featuredTriageItem.issueSummary}</div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {[
                          { label: "Staffing", value: featuredEvent.shortage > 0 ? `${featuredEvent.shortage} short` : `${featuredEvent.confirmed}/${featuredEvent.needed || 0}` },
                          { label: "Schedule", value: featuredEvent.scheduleStatus || "In progress" },
                          { label: "Materials", value: featuredEvent.issueList.some((issue) => issue.includes("Case files")) ? "Missing" : "Tracked" },
                          { label: "Training", value: featuredEvent.issueList.some((issue) => issue.includes("Recording")) ? "Watch" : "Ready" },
                        ].map((badge) => (
                          <span key={`featured-badge-${badge.label}`} className="rounded-full border border-cyan-100 bg-white px-3 py-1 text-xs font-black text-[var(--cfsp-text-muted)]">
                            {badge.label}: <span className="text-cyan-800">{badge.value}</span>
                          </span>
                        ))}
                      </div>

                      <div className="mt-5 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleNavigateToAction(getEventActionHref(featuredTriageItem.eventId, "command"), {
                            eventId: featuredTriageItem.eventId,
                            eventName: featuredTriageItem.eventName,
                            toolLabel: "Command Center",
                          })}
                          className="cfsp-btn cfsp-btn-primary"
                        >
                          Open Command Center
                        </button>
                        <button
                          type="button"
                          onClick={() => handleNavigateToAction(getEventActionHref(featuredTriageItem.eventId, "builder"), {
                            eventId: featuredTriageItem.eventId,
                            eventName: featuredTriageItem.eventName,
                            toolLabel: "Schedule Builder",
                          })}
                          className="cfsp-btn cfsp-btn-secondary"
                        >
                          Resume Builder
                        </button>
                        <button
                          type="button"
                          onClick={() => setPreviewEventId(featuredTriageItem.eventId)}
                          className="cfsp-btn cfsp-btn-secondary"
                        >
                          Preview
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedTriageIndex((index) => Math.min(index + 1, Math.max(triageItems.length - 1, 0)))}
                          className="rounded-[10px] border border-[var(--cfsp-border)] bg-white px-3 py-2 text-sm font-black text-[var(--cfsp-text-muted)]"
                        >
                          Later
                        </button>
                        <button
                          type="button"
                          onClick={() => setReviewedEventIds((ids) => Array.from(new Set([...ids, featuredTriageItem.eventId])))}
                          className="rounded-[10px] border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-black text-teal-800"
                        >
                          Reviewed
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-3">
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedTriageIndex((index) => (index <= 0 ? Math.max(triageItems.length - 1, 0) : index - 1))}
                          className="rounded-[10px] border border-cyan-200 bg-white px-3 py-2 text-sm font-black text-cyan-800"
                        >
                          Previous
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedTriageIndex((index) => (index >= triageItems.length - 1 ? 0 : index + 1))}
                          className="rounded-[10px] border border-cyan-200 bg-white px-3 py-2 text-sm font-black text-cyan-800"
                        >
                          Next
                        </button>
                      </div>
                      <div className="grid max-h-[330px] gap-2 overflow-y-auto pr-1">
                        {triageItems.slice(0, 8).map((item, index) => (
                          <button
                            key={`triage-queue-${item.eventId}`}
                            type="button"
                            onClick={() => setSelectedTriageIndex(index)}
                            className="rounded-[12px] border px-3 py-2 text-left transition hover:-translate-y-[1px]"
                            style={{
                              borderColor: item.eventId === featuredTriageItem.eventId ? "rgba(14,165,233,0.45)" : "var(--cfsp-border)",
                              background: item.eventId === featuredTriageItem.eventId ? "rgba(236,254,255,0.9)" : "var(--cfsp-surface-muted)",
                            }}
                          >
                            <div className="text-sm font-black text-[var(--cfsp-text)]">{item.eventName}</div>
                            <div className="mt-1 text-xs font-bold text-[var(--cfsp-text-muted)]">{item.issueSummary}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-[14px] border border-dashed border-cyan-200 bg-cyan-50/60 px-4 py-5 text-sm font-bold text-[var(--cfsp-text-muted)]">
                    No events are waiting in this triage filter.
                  </div>
                )}
              </article>

              <aside className="grid gap-4">
                <article className="cfsp-panel border-cyan-100 bg-white/95 px-5 py-5">
                  <button type="button" onClick={() => setTimelineDrawerOpen((open) => !open)} className="flex w-full items-center justify-between gap-3 text-left">
                    <div>
                      <p className="cfsp-kicker">Timeline Drawer</p>
                      <h3 className="text-lg font-black text-[var(--cfsp-text)]">This Week</h3>
                    </div>
                    <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-black text-cyan-800">
                      {timelineDrawerOpen ? "Collapse" : "Expand"}
                    </span>
                  </button>
                  {timelineDrawerOpen ? (
                    <div className="mt-4 grid gap-2">
                      {weekDays.map((day) => {
                        const isToday = isSameDay(day.date, currentTime);
                        return (
                          <button
                            key={`matrix-week-day-${day.key}`}
                            type="button"
                            onClick={() => {
                              setSelectedDate(day.key);
                              setDayDrawerDate(day.key);
                              setViewMode("calendar");
                              setCalendarTab("week");
                            }}
                            className="grid grid-cols-[64px_1fr_auto] items-center gap-3 rounded-[12px] border border-cyan-100 bg-[var(--cfsp-surface-muted)] px-3 py-2 text-left"
                          >
                            <div className={`rounded-[10px] px-2 py-1 text-center text-xs font-black ${isToday ? "bg-cyan-600 text-white" : "bg-white text-cyan-800"}`}>
                              {day.date.toLocaleDateString([], { weekday: "short" })}
                              <div>{day.date.toLocaleDateString([], { month: "short", day: "numeric" })}</div>
                            </div>
                            <div className="relative border-l border-cyan-200 pl-3">
                              <span className="absolute -left-[5px] top-2 h-2.5 w-2.5 rounded-full bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.9)]" />
                              <div className="text-sm font-black text-[var(--cfsp-text)]">{day.events.length} event{day.events.length === 1 ? "" : "s"}</div>
                              <div className="text-xs font-bold text-[var(--cfsp-text-muted)]">{day.needsActionCount} action signal{day.needsActionCount === 1 ? "" : "s"}</div>
                            </div>
                            <span className="rounded-full border border-cyan-100 bg-white px-2 py-0.5 text-xs font-black text-cyan-800">{day.events.length}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </article>

                <article className="cfsp-panel border-cyan-100 bg-white/95 px-5 py-5">
                  <p className="cfsp-kicker">Expandable Tools</p>
                  <div className="mt-3 grid gap-2">
                    {([
                      { key: "access" as ToolKey, label: "Access Queue", value: canManageOrganization ? accessQueueCount : 0, detail: canManageOrganization ? "Pending organization requests" : "Requires admin access" },
                      { key: "calendar" as ToolKey, label: "Calendar", value: eventCountsUnavailable ? "Unavailable" : scopedEvents.length, detail: "Upcoming scoped events" },
                      { key: "staffing" as ToolKey, label: "Staffing Radar", value: eventCountsUnavailable ? "Unavailable" : scopedEvents.filter((item) => item.shortage > 0).length, detail: "Coverage shortages" },
                      { key: "training" as ToolKey, label: "Training Watch", value: eventCountsUnavailable ? "Unavailable" : scopedEvents.filter((item) => item.issueList.some((issue) => issue.includes("Recording"))).length, detail: "Recording or training signals" },
                      { key: "materials" as ToolKey, label: "Materials Watch", value: eventCountsUnavailable ? "Unavailable" : scopedEvents.filter((item) => item.issueList.some((issue) => issue.includes("Case files"))).length, detail: "Case/material readiness" },
                    ]).map((tool) => (
                      <div key={`tool-${tool.key}`} className="rounded-[12px] border border-cyan-100 bg-[var(--cfsp-surface-muted)]">
                        <button
                          type="button"
                          onClick={() => setExpandedTool(expandedTool === tool.key ? null : tool.key)}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
                        >
                          <span className="text-sm font-black text-[var(--cfsp-text)]">{tool.label}</span>
                          <span className="rounded-full bg-white px-2 py-0.5 text-xs font-black text-cyan-800">{tool.value}</span>
                        </button>
                        {expandedTool === tool.key ? (
                          <div className="border-t border-cyan-100 px-3 py-2 text-xs font-bold text-[var(--cfsp-text-muted)]">
                            {tool.detail}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </article>
              </aside>
            </section>
          </div>
        ) : null}

        {viewMode === "calendar" ? (
          <section className="grid gap-4">
            <article className="cfsp-panel px-5 py-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="cfsp-kicker">Calendar</p>
                  <h3 className="text-xl font-black text-[var(--cfsp-text)]">Operational calendar</h3>
                  <p className="mt-1 text-sm font-bold text-[var(--cfsp-text-muted)]">
                    {selectedCalendarDate.toLocaleDateString([], { month: "long", year: "numeric" })}
                  </p>
                </div>
                <div className="inline-flex rounded-[12px] border border-[var(--cfsp-border)] bg-[var(--cfsp-surface-muted)] p-1">
                  {(["today", "week", "month", "timeline"] as CalendarTab[]).map((tab) => (
                    <button
                      key={`calendar-tab-${tab}`}
                      type="button"
                      onClick={() => setCalendarTab(tab)}
                      className="rounded-[9px] px-3 py-2 text-sm font-black capitalize"
                      style={{
                        background: calendarTab === tab ? "var(--cfsp-blue)" : "transparent",
                        color: calendarTab === tab ? "#fff" : "var(--cfsp-text-muted)",
                      }}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
                <label className="grid gap-1">
                  <span className="text-xs font-black uppercase tracking-[0.1em] text-[var(--cfsp-text-muted)]">Selected date</span>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(event) => setSelectedDate(event.target.value)}
                    className="cfsp-input"
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleCalendarStep(-1)}
                    className="rounded-[10px] border border-cyan-200 bg-white px-3 py-2 text-sm font-black text-cyan-800"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={handleCalendarToday}
                    className="rounded-[10px] border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-black text-cyan-800"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCalendarStep(1)}
                    className="rounded-[10px] border border-cyan-200 bg-white px-3 py-2 text-sm font-black text-cyan-800"
                  >
                    Next
                  </button>
                  <button
                    type="button"
                    onClick={() => setDayDrawerDate(selectedDate)}
                    className="cfsp-btn cfsp-btn-secondary"
                  >
                    Open Day Drawer
                  </button>
                </div>
              </div>
            </article>

            {calendarTab === "today" ? (
              <article className="cfsp-panel px-5 py-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="cfsp-kicker">Today</p>
                    <h4 className="text-lg font-black text-[var(--cfsp-text)]">{formatCommandDate(currentTime)}</h4>
                  </div>
                  <button type="button" onClick={handleCalendarToday} className="cfsp-btn cfsp-btn-secondary">
                    Focus Today
                  </button>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {(calendarEntriesByDate.get(toDateInputValue(currentTime)) || []).map((entry) => (
                    <button
                      key={`today-event-${entry.id}`}
                      type="button"
                      onClick={() => openEventCommandCenter(entry)}
                      className="rounded-[12px] border border-cyan-100 bg-[var(--cfsp-surface-muted)] px-4 py-3 text-left transition hover:-translate-y-[1px] hover:border-cyan-300"
                    >
                      <div className="text-base font-black text-[var(--cfsp-text)]">{asText(entry.item.event.name) || "Untitled Event"}</div>
                      <div className="mt-1 text-sm font-semibold text-[var(--cfsp-text-muted)]">{entry.timeLabel} · {entry.locationLabel}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(entry.item.issueList.length ? entry.item.issueList : ["Operationally ready"]).slice(0, 3).map((issue) => (
                          <span key={`today-issue-${entry.item.event.id}-${issue}`} className="rounded-full border border-cyan-100 bg-white px-2 py-0.5 text-xs font-bold text-[var(--cfsp-text-muted)]">
                            {issue}
                          </span>
                        ))}
                      </div>
                    </button>
                  ))}
                  {!(calendarEntriesByDate.get(toDateInputValue(currentTime)) || []).length ? (
                    <div className="rounded-[12px] border border-dashed border-cyan-200 bg-cyan-50/50 px-4 py-4 text-sm font-semibold text-[var(--cfsp-text-muted)]">
                      No events scheduled for today.
                    </div>
                  ) : null}
                </div>
              </article>
            ) : null}

            {calendarTab === "week" ? (
              <article className="cfsp-panel px-5 py-5">
                <h4 className="text-lg font-black text-[var(--cfsp-text)]">Week View</h4>
                <div className="mt-3 grid gap-3 lg:grid-cols-7">
                  {weekDays.map((day) => (
                    <div
                      key={`calendar-week-${day.key}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleCalendarDateSelect(day.key, true)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") handleCalendarDateSelect(day.key, true);
                      }}
                      className={`min-h-[220px] rounded-[14px] border px-3 py-3 transition hover:-translate-y-[1px] ${
                        day.key === selectedDate
                          ? "border-cyan-400 bg-cyan-50 shadow-[0_12px_28px_rgba(14,165,233,0.12)]"
                          : isSameDay(day.date, currentTime)
                            ? "border-teal-300 bg-teal-50/70"
                            : "border-cyan-100 bg-[var(--cfsp-surface-muted)]"
                      }`}
                    >
                      <div
                        className="w-full text-left"
                      >
                        <div className="text-sm font-black text-[var(--cfsp-text)]">{day.date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}</div>
                        <div className="text-xs font-semibold text-[var(--cfsp-text-muted)]">{day.events.length} event{day.events.length === 1 ? "" : "s"}</div>
                      </div>
                      <div className="mt-3 grid gap-2">
                        {day.events.map((entry) => (
                          <button
                            key={`calendar-week-event-${entry.id}`}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openEventCommandCenter(entry);
                            }}
                            className="rounded-[10px] border border-cyan-100 bg-white px-2.5 py-2 text-left shadow-[0_8px_18px_rgba(14,165,233,0.06)] transition hover:border-cyan-300"
                          >
                            <div className="text-xs font-black text-[var(--cfsp-text)]">{asText(entry.item.event.name) || "Untitled Event"}</div>
                            <div className="mt-1 text-[0.68rem] font-bold text-[var(--cfsp-text-muted)]">{entry.timeLabel} · {entry.locationLabel}</div>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {entry.item.issueList.slice(0, 2).map((issue) => (
                                <span key={`week-issue-${entry.id}-${issue}`} className="rounded-full bg-cyan-50 px-1.5 py-0.5 text-[0.62rem] font-black text-cyan-800">
                                  {issue}
                                </span>
                              ))}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ) : null}

            {calendarTab === "month" ? (
              <article className="cfsp-panel px-5 py-5">
                <h4 className="text-lg font-black text-[var(--cfsp-text)]">Month View</h4>
                <div className="mt-3 hidden grid-cols-7 gap-2 text-center text-[0.68rem] font-black uppercase tracking-[0.12em] text-cyan-800 md:grid">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((dayName) => (
                    <div key={`month-header-${dayName}`} className="rounded-[10px] border border-cyan-100 bg-cyan-50 px-2 py-2">
                      {dayName}
                    </div>
                  ))}
                </div>
                <div className="mt-2 grid gap-3 md:grid-cols-7 md:gap-2">
                  {monthCalendarDays.map((day) => (
                    <div
                      key={`month-cell-${day.key}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleCalendarDateSelect(day.key, true)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") handleCalendarDateSelect(day.key, true);
                      }}
                      className={`min-h-[145px] rounded-[14px] border px-2.5 py-2 text-left transition hover:-translate-y-[1px] md:min-h-[160px] ${
                        day.isSelected
                          ? "border-cyan-400 bg-cyan-50 shadow-[0_12px_28px_rgba(14,165,233,0.12)]"
                          : day.isToday
                            ? "border-teal-300 bg-teal-50/70"
                            : day.isCurrentMonth
                              ? "border-cyan-100 bg-white"
                              : "border-slate-100 bg-slate-50/70 opacity-75"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className={`grid h-8 w-8 place-items-center rounded-full text-sm font-black ${day.isToday ? "bg-cyan-600 text-white" : "bg-white text-[var(--cfsp-text)]"}`}>
                          {day.date.getDate()}
                        </div>
                        <div className="text-[0.65rem] font-black uppercase tracking-[0.08em] text-[var(--cfsp-text-muted)] md:hidden">
                          {day.date.toLocaleDateString([], { weekday: "short" })}
                        </div>
                        {day.events.length ? (
                          <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[0.62rem] font-black text-cyan-800">
                            {day.events.length}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-2 grid gap-1.5">
                        {day.events.slice(0, 4).map((entry) => (
                          <button
                            key={`month-event-${entry.id}`}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openEventCommandCenter(entry);
                            }}
                            className="rounded-[9px] border border-cyan-100 bg-[linear-gradient(135deg,#ffffff,#effcff)] px-2 py-1.5 text-left shadow-[0_6px_14px_rgba(14,165,233,0.06)] transition hover:border-cyan-300"
                          >
                            <div className="truncate text-[0.72rem] font-black text-[var(--cfsp-text)]">{asText(entry.item.event.name) || "Untitled Event"}</div>
                            <div className="truncate text-[0.62rem] font-bold text-[var(--cfsp-text-muted)]">{entry.timeLabel} · {entry.locationLabel}</div>
                            {entry.item.issueList[0] ? (
                              <div className="mt-1 truncate rounded-full bg-cyan-50 px-1.5 py-0.5 text-[0.58rem] font-black text-cyan-800">
                                {entry.item.issueList[0]}
                              </div>
                            ) : null}
                          </button>
                        ))}
                        {day.events.length > 4 ? (
                          <div className="rounded-full bg-slate-100 px-2 py-1 text-[0.62rem] font-black text-[var(--cfsp-text-muted)]">
                            +{day.events.length - 4} more
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ) : null}

            {calendarTab === "timeline" ? (
              <article className="cfsp-panel px-5 py-5">
                <h4 className="text-lg font-black text-[var(--cfsp-text)]">Timeline</h4>
                <div className="mt-3 grid gap-3">
                  {timelineEvents.map((item) => (
                    <div key={`timeline-event-${item.event.id}`} className="rounded-[12px] border border-[var(--cfsp-border)] bg-[var(--cfsp-surface-muted)] px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-base font-black text-[var(--cfsp-text)]">{asText(item.event.name) || "Untitled Event"}</div>
                          <div className="text-xs font-semibold text-[var(--cfsp-text-muted)]">{formatDateTime(item.start, item.event.date_text)} · {item.locationLabel}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setPreviewEventId(item.event.id)}
                          className="rounded-[8px] border border-[var(--cfsp-border)] bg-white px-2.5 py-1 text-xs font-black text-[var(--cfsp-blue)]"
                        >
                          Open preview
                        </button>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        {buildTimelineBlocks(item).map((block) => (
                          <div key={`timeline-block-${item.event.id}-${block.label}-${block.time}`} className="rounded-[10px] border border-[var(--cfsp-border)] bg-white px-3 py-2">
                            <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] text-[var(--cfsp-text-muted)]">{block.label}</div>
                            <div className="mt-1 text-sm font-black text-[var(--cfsp-text)]">{block.time}</div>
                            <div className="text-xs font-semibold text-[var(--cfsp-text-muted)]">{block.detail}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {!timelineEvents.length ? (
                    <div className="rounded-[10px] border border-dashed border-[var(--cfsp-border)] px-3 py-3 text-sm font-semibold text-[var(--cfsp-text-muted)]">
                      No generated schedule timeline data available.
                    </div>
                  ) : null}
                </div>
              </article>
            ) : null}
          </section>
        ) : null}

        {viewMode === "agenda" ? (
          <section className="cfsp-panel px-5 py-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="cfsp-kicker">Agenda</p>
                <h3 className="text-xl font-black text-[var(--cfsp-text)]">Chronological operations list</h3>
              </div>
              <label className="grid gap-1">
                <span className="text-xs font-black uppercase tracking-[0.1em] text-[var(--cfsp-text-muted)]">Start date</span>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value)}
                  className="cfsp-input"
                />
              </label>
            </div>
            <div className="mt-4 grid gap-3">
              {agendaEvents.map((item) => (
                <article key={`agenda-${item.event.id}`} className="rounded-[12px] border border-[var(--cfsp-border)] bg-[var(--cfsp-surface-muted)] px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-black text-[var(--cfsp-text)]">{asText(item.event.name) || "Untitled Event"}</div>
                      <div className="mt-1 text-sm font-semibold text-[var(--cfsp-text-muted)]">{formatDateTime(item.start, item.event.date_text)} · {item.locationLabel}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setPreviewEventId(item.event.id)}
                        className="rounded-[8px] border border-[var(--cfsp-border)] bg-white px-2.5 py-1 text-xs font-black text-[var(--cfsp-blue)]"
                      >
                        Preview
                      </button>
                      <button
                        type="button"
                        onClick={() => handleNavigateToAction(getEventActionHref(item.event.id, "command"), {
                          eventId: item.event.id,
                          eventName: asText(item.event.name) || "Untitled Event",
                          toolLabel: "Command Center",
                        })}
                        className="rounded-[8px] border border-[var(--cfsp-border)] bg-white px-2.5 py-1 text-xs font-black text-[var(--cfsp-text-muted)]"
                      >
                        Open
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(item.issueList.length ? item.issueList : ["No active issues"]).slice(0, 4).map((issue) => (
                      <span key={`agenda-issue-${item.event.id}-${issue}`} className="rounded-full border border-[var(--cfsp-border)] bg-white px-2 py-0.5 text-xs font-bold text-[var(--cfsp-text-muted)]">
                        {issue}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
              {!agendaEvents.length ? (
                <div className="rounded-[10px] border border-dashed border-[var(--cfsp-border)] px-3 py-3 text-sm font-semibold text-[var(--cfsp-text-muted)]">
                  No agenda items in this range.
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {dayDrawerDate ? (
          <aside className="fixed inset-y-0 right-0 z-40 w-full max-w-[440px] border-l border-[var(--cfsp-border)] bg-[var(--cfsp-surface)] p-4 shadow-[0_20px_48px_rgba(20,91,150,0.24)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="cfsp-kicker">Day Drawer</p>
                <h3 className="text-lg font-black text-[var(--cfsp-text)]">
                  {new Date(`${dayDrawerDate}T00:00:00`).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDayDrawerDate(null)}
                className="rounded-[8px] border border-[var(--cfsp-border)] bg-white px-2.5 py-1 text-xs font-black text-[var(--cfsp-text-muted)]"
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid max-h-[calc(100vh-130px)] gap-3 overflow-y-auto pr-1">
              {dayDrawerEvents.map((entry) => (
                <article key={`day-drawer-${entry.id}`} className="rounded-[12px] border border-[var(--cfsp-border)] bg-[var(--cfsp-surface-muted)] px-3 py-3">
                  <button
                    type="button"
                    onClick={() => openEventCommandCenter(entry)}
                    className="w-full rounded-[10px] border border-cyan-100 bg-white px-3 py-2 text-left transition hover:border-cyan-300"
                  >
                    <div className="text-sm font-black text-[var(--cfsp-text)]">{asText(entry.item.event.name) || "Untitled Event"}</div>
                    <div className="mt-1 text-xs font-semibold text-[var(--cfsp-text-muted)]">{entry.timeLabel} · {entry.locationLabel}</div>
                  </button>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(entry.item.issueList.length ? entry.item.issueList : ["Operationally ready"]).slice(0, 3).map((issue) => (
                      <span key={`day-issue-${entry.item.event.id}-${issue}`} className="rounded-full border border-[var(--cfsp-border)] bg-white px-2 py-0.5 text-[0.68rem] font-bold text-[var(--cfsp-text-muted)]">
                        {issue}
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleNavigateToAction(getEventActionHref(entry.item.event.id, "command"), {
                        eventId: entry.item.event.id,
                        eventName: asText(entry.item.event.name) || "Untitled Event",
                        toolLabel: "Command Center",
                      })}
                      className="cfsp-btn cfsp-btn-secondary"
                    >
                      Open Command Center
                    </button>
                    <button
                      type="button"
                      onClick={() => handleNavigateToAction(getEventActionHref(entry.item.event.id, "schedule"), {
                        eventId: entry.item.event.id,
                        eventName: asText(entry.item.event.name) || "Untitled Event",
                        toolLabel: "Schedule",
                      })}
                      className="cfsp-btn cfsp-btn-secondary"
                    >
                      Open Schedule
                    </button>
                    <button
                      type="button"
                      onClick={() => handleNavigateToAction(getEventActionHref(entry.item.event.id, "printSummary"), {
                        eventId: entry.item.event.id,
                        eventName: asText(entry.item.event.name) || "Untitled Event",
                        toolLabel: "Print Summary",
                      })}
                      className="cfsp-btn cfsp-btn-secondary"
                    >
                      Print Summary
                    </button>
                    {canOperate ? (
                      <button
                        type="button"
                        onClick={() => handleNavigateToAction(getEventActionHref(entry.item.event.id, "facultyPacket"), {
                          eventId: entry.item.event.id,
                          eventName: asText(entry.item.event.name) || "Untitled Event",
                          toolLabel: "Faculty Packet",
                        })}
                        className="cfsp-btn cfsp-btn-secondary"
                      >
                        Send Faculty Packet
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
              {!dayDrawerEvents.length ? (
                <div className="rounded-[10px] border border-dashed border-[var(--cfsp-border)] px-3 py-3 text-sm font-semibold text-[var(--cfsp-text-muted)]">
                  No events on this date.
                </div>
              ) : null}
            </div>
          </aside>
        ) : null}

        {previewEvent ? (
          <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-[500px] border-l border-[var(--cfsp-border)] bg-[var(--cfsp-surface)] p-4 shadow-[0_20px_48px_rgba(20,91,150,0.24)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="cfsp-kicker">Event Preview</p>
                <h3 className="text-xl font-black text-[var(--cfsp-text)]">{asText(previewEvent.event.name) || "Untitled Event"}</h3>
                <div className="mt-1 text-sm font-semibold text-[var(--cfsp-text-muted)]">
                  {formatDateTime(previewEvent.start, previewEvent.event.date_text)} · {previewEvent.locationLabel}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewEventId(null)}
                className="rounded-[8px] border border-[var(--cfsp-border)] bg-white px-2.5 py-1 text-xs font-black text-[var(--cfsp-text-muted)]"
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {[
                { label: "Rounds", value: previewEvent.rounds || "Not set" },
                { label: "Rooms", value: previewEvent.rooms || "Not set" },
                { label: "Learners", value: previewEvent.learners || "Not set" },
                { label: "SP Coverage", value: `${previewEvent.confirmed}/${previewEvent.needed || 0}` },
                { label: "Schedule Status", value: previewEvent.scheduleStatus || "Not set" },
                { label: "Issues", value: previewEvent.issueList.length || 0 },
              ].map((entry) => (
                <div key={`preview-stat-${entry.label}`} className="rounded-[10px] border border-[var(--cfsp-border)] bg-[var(--cfsp-surface-muted)] px-3 py-2">
                  <div className="text-[0.68rem] font-black uppercase tracking-[0.1em] text-[var(--cfsp-text-muted)]">{entry.label}</div>
                  <div className="mt-1 text-sm font-black text-[var(--cfsp-text)]">{entry.value}</div>
                </div>
              ))}
            </div>

            <div className="mt-4">
              <div className="text-xs font-black uppercase tracking-[0.1em] text-[var(--cfsp-text-muted)]">Needs attention</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(previewEvent.issueList.length ? previewEvent.issueList : ["No active issues"]).map((issue) => (
                  <span key={`preview-issue-${issue}`} className="rounded-full border border-[var(--cfsp-border)] bg-[var(--cfsp-surface-muted)] px-2 py-0.5 text-xs font-bold text-[var(--cfsp-text-muted)]">
                    {issue}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-5 grid gap-2">
              <button
                type="button"
                onClick={() => handleNavigateToAction(getEventActionHref(previewEvent.event.id, "command"), {
                  eventId: previewEvent.event.id,
                  eventName: asText(previewEvent.event.name) || "Untitled Event",
                  toolLabel: "Command Center",
                })}
                className="cfsp-btn cfsp-btn-primary"
              >
                Open Command Center
              </button>
              <button
                type="button"
                onClick={() => handleNavigateToAction(getEventActionHref(previewEvent.event.id, "builder"), {
                  eventId: previewEvent.event.id,
                  eventName: asText(previewEvent.event.name) || "Untitled Event",
                  toolLabel: "Schedule Builder",
                })}
                className="cfsp-btn cfsp-btn-secondary"
              >
                Open Schedule Builder
              </button>
              <button
                type="button"
                onClick={() => handleNavigateToAction(getEventActionHref(previewEvent.event.id, "printSummary"), {
                  eventId: previewEvent.event.id,
                  eventName: asText(previewEvent.event.name) || "Untitled Event",
                  toolLabel: "Print Summary",
                })}
                className="cfsp-btn cfsp-btn-secondary"
              >
                Print Event Summary
              </button>
              {canOperate ? (
                <button
                  type="button"
                  onClick={() => handleNavigateToAction(getEventActionHref(previewEvent.event.id, "facultyPacket"), {
                    eventId: previewEvent.event.id,
                    eventName: asText(previewEvent.event.name) || "Untitled Event",
                    toolLabel: "Faculty Packet",
                  })}
                  className="cfsp-btn cfsp-btn-secondary"
                >
                  Send Faculty Packet
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => handleNavigateToAction(getEventActionHref(previewEvent.event.id, "roomOps"), {
                  eventId: previewEvent.event.id,
                  eventName: asText(previewEvent.event.name) || "Untitled Event",
                  toolLabel: "Room Operations",
                })}
                className="cfsp-btn cfsp-btn-secondary"
              >
                Open Room Operations
              </button>
            </div>
          </aside>
        ) : null}

        {dashboardFeedIssues.length ? (
          <section className={`cfsp-panel border px-5 py-4 ${dashboardIssuesAreNonBlocking ? "border-amber-200 bg-amber-50/85" : "border-red-200 bg-red-50/85"}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className={`cfsp-kicker ${dashboardIssuesAreNonBlocking ? "text-amber-700" : "text-red-700"}`}>
                  {dashboardIssuesAreNonBlocking ? "Signal recovered" : "Signal interrupted"}
                </p>
                <p className={`mt-1 text-sm font-semibold ${dashboardIssuesAreNonBlocking ? "text-amber-700" : "text-red-700"}`}>
                  {dashboardIssuesAreNonBlocking
                    ? "Events are loaded, but one dashboard feed reported a warning."
                    : "One dashboard feed could not be loaded. Refresh or try again shortly."}
                </p>
                <div className="mt-2 grid gap-1">
                  {dashboardFeedIssues.map((issue) => (
                    <p key={`issue-${issue.source}`} className={`text-xs font-bold ${dashboardIssuesAreNonBlocking ? "text-amber-700" : "text-red-700"}`}>
                      Source: {issue.source} · {issue.message || DASHBOARD_FEED_UNAVAILABLE_MESSAGE}
                    </p>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={handleRetryDashboardFeeds}
                className="cfsp-btn cfsp-btn-secondary"
              >
                Retry
              </button>
            </div>
          </section>
        ) : null}
        {!eventsLoading && !scopedEvents.length && !dashboardFeedIssues.some((issue) => issue.source === "events") ? (
          <section className="cfsp-panel px-5 py-5 text-sm font-semibold text-[var(--cfsp-text-muted)]">
            No events available in this scope.
          </section>
        ) : null}
      </div>
    </SiteShell>
  );
}

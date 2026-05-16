"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SimVitalsDashboardPreview } from "../components/SimVitals";
import SiteShell from "../components/SiteShell";
import { isPastEvent } from "../lib/eventArchive";
import {
  getEventCoverageVisualState,
  getEventCoverageVisualTone,
  getEventCoverageVisualToneWithBase,
} from "../lib/eventCoverageVisual";
import { classifyEventPresentation, getEventBadgeAppearance, isStandaloneTrainingEvent } from "../lib/eventClassification";
import { getBestEventTeamInfo } from "../lib/eventRoster";
import { eventMatchesOwnership, ownershipTextMatchesScheduleName } from "../lib/eventOwnership";

type MeResponse = {
  ok: boolean;
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
    status: string;
    email: string;
    profile_picture_url: string;
    notes: string;
  };
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
  assignments?: Array<{
    id?: string | null;
    event_id?: string | null;
    sp_id?: string | null;
    status?: string | null;
    confirmed?: boolean | null;
  }>;
  error?: string;
};

type AuthState = "loading" | "authed" | "guest";
type DashboardScope = "my" | "all";
type FinderChipKey = "needs_staffing" | "training_soon" | "live_today" | "materials_needed" | "recording_pending";
const MAX_ROSTER_CHIPS = 12;
const DASHBOARD_SECTION_PAGE_SIZE = 8;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const GLOBAL_EVENT_FINDER_COLLAPSED_KEY = "cfsp:dashboard-global-event-finder:collapsed";
const RECENT_EVENTS_STORAGE_KEY = "cfsp:recent-events";
const RECENT_EVENTS_LIMIT = 8;

const FINDER_CHIPS: Array<{ key: FinderChipKey; label: string }> = [
  { key: "needs_staffing", label: "Needs Staffing" },
  { key: "training_soon", label: "Training Soon" },
  { key: "live_today", label: "Live / Today" },
  { key: "materials_needed", label: "Materials Needed" },
  { key: "recording_pending", label: "Recording Pending" },
];

type EventWithMeta = {
  event: EventRecord;
  start: Date | null;
  needed: number;
  assigned: number;
  confirmed: number;
  shortage: number;
};

type FinderResult = {
  item: EventWithMeta;
  score: number;
  eventTypeLabel: string;
  staffingLabel: string;
  shortageLabel: string;
  trainingLabel: string;
  modeLabel: string;
  dateLabel: string;
};

type RecentEventEntry = {
  id: string;
  name: string;
  dateText: string;
  location: string;
  status: string;
  typeLabel: string;
  openedAt: string;
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseEventStart(event: EventRecord): Date | null {
  if (event.earliest_session_date) {
    const datePart = event.earliest_session_date;
    const timePart = event.earliest_session_start || "00:00:00";
    const dt = new Date(`${datePart}T${timePart}`);
    if (!Number.isNaN(dt.getTime())) return dt;
  }

  const firstSession = Array.isArray(event.sessions) && event.sessions.length > 0 ? event.sessions[0] : null;

  if (firstSession?.session_date) {
    const datePart = firstSession.session_date;
    const timePart = firstSession.start_time || "00:00:00";
    const iso = `${datePart}T${timePart}`;
    const dt = new Date(iso);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  if (event.date_text) {
    const dt = new Date(event.date_text);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  return null;
}

function eventLocation(event: EventRecord): string {
  const firstSession = Array.isArray(event.sessions) && event.sessions.length > 0 ? event.sessions[0] : null;
  return firstSession?.location || firstSession?.room || event.location || "Location TBD";
}

function getStartOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function getStartOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function isTodayOrTomorrow(date: Date | null, startOfToday: number) {
  if (!date) return false;
  const dayStart = getStartOfDay(date);
  const tomorrowStart = startOfToday + 24 * 60 * 60 * 1000;
  return dayStart === startOfToday || dayStart === tomorrowStart;
}

function getEventCoverageTone(event: EventWithMeta) {
  const state = getEventCoverageVisualState({
    needed: event.needed,
    assigned: event.assigned,
    confirmed: event.confirmed,
    archived: false,
  });
  const tone = getEventCoverageVisualTone(state);
  return {
    background: tone.pillBackground,
    borderColor: tone.pillBorder,
    color: tone.pillText,
    label: tone.label,
  };
}

function formatEventDate(start: Date | null, fallback?: string | null) {
  return start ? start.toLocaleString() : fallback || "Date TBD";
}

function formatFinderDate(start: Date | null, fallback?: string | null) {
  if (!start) return fallback || "Date TBD";
  return start.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatShortDateLabel(date: Date) {
  return date.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getRecentEventString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeRecentEventEntry(value: unknown): RecentEventEntry | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = getRecentEventString(record.id);
  if (!id) return null;

  return {
    id,
    name: getRecentEventString(record.name) || "Untitled Event",
    dateText: getRecentEventString(record.dateText),
    location: getRecentEventString(record.location),
    status: getRecentEventString(record.status),
    typeLabel: getRecentEventString(record.typeLabel),
    openedAt: getRecentEventString(record.openedAt),
  };
}

function readRecentEventsFromStorage() {
  if (typeof window === "undefined") return [] as RecentEventEntry[];

  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_EVENTS_STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeRecentEventEntry)
      .filter((entry): entry is RecentEventEntry => Boolean(entry))
      .slice(0, RECENT_EVENTS_LIMIT);
  } catch {
    return [];
  }
}

function formatRecentOpenedAt(value: string) {
  const openedAt = value ? new Date(value) : null;
  if (!openedAt || Number.isNaN(openedAt.getTime())) return "";

  const elapsedMs = Date.now() - openedAt.getTime();
  if (elapsedMs < 60_000) return "Just now";
  const elapsedMinutes = Math.floor(elapsedMs / 60_000);
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h ago`;
  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 7) return `${elapsedDays}d ago`;
  return openedAt.toLocaleDateString([], { month: "short", day: "numeric" });
}

function getStartOfWeek(date: Date) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  return new Date(next.getFullYear(), next.getMonth(), next.getDate());
}

function getEventBadges(event: EventRecord) {
  const presentation = classifyEventPresentation({
    name: event.name,
    status: event.status,
    notes: event.notes,
    location: event.location,
    spNeeded: event.sp_needed,
    assignmentCount: event.total_assignments ?? event.sp_assigned,
    confirmedCount: event.confirmed_assignments ?? event.sp_assigned,
  });

  return presentation.activeBadgeKinds.map((kind) => ({
    key: kind,
    label: kind === "virtual_sp" && presentation.primaryBadgeKind !== "virtual_sp" ? "Virtual" : getEventBadgeAppearance(kind) && (
      kind === "training"
        ? "Training"
        : kind === "virtual_sp"
          ? "Virtual SP"
          : kind === "hifi"
            ? "HiFi"
            : kind === "skills_workshop"
              ? "Skills"
              : "SP Event"
    ),
    ...getEventBadgeAppearance(kind),
  }));
}

function getPrimaryEventTypeLabel(event: EventRecord) {
  return asText(getEventBadges(event)[0]?.label) || "Event";
}

function isRecentStandaloneTrainingRecord(recent: RecentEventEntry, freshEvent?: EventRecord) {
  return isStandaloneTrainingEvent({
    name: freshEvent?.name ?? recent.name,
    status: freshEvent?.status ?? recent.status,
    notes: freshEvent?.notes,
    location: freshEvent?.location ?? recent.location,
    spNeeded: freshEvent?.sp_needed,
    assignmentCount: freshEvent?.total_assignments ?? freshEvent?.sp_assigned,
    confirmedCount: freshEvent?.confirmed_assignments ?? freshEvent?.sp_assigned,
  });
}

function normalizeFinderText(value: unknown) {
  return asText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function fuzzyTokenMatches(token: string, candidate: string) {
  if (!token) return true;
  if (candidate.includes(token)) return true;

  let tokenIndex = 0;
  for (const char of candidate) {
    if (char === token[tokenIndex]) tokenIndex += 1;
    if (tokenIndex === token.length) return true;
  }
  return false;
}

function getEventModalityLabel(event: EventRecord) {
  const text = normalizeFinderText([event.name, event.status, event.location, event.notes].join(" "));
  if (/\b(zoom|virtual|telehealth|remote|online)\b/.test(text)) return "Virtual";
  if (/\b(hybrid)\b/.test(text)) return "Hybrid";
  return "In Person";
}

function getTrainingReadinessLabel(event: EventRecord) {
  const text = normalizeFinderText([event.name, event.status, event.notes].join(" "));
  if (/\b(training ready|training complete|training completed|materials ready|recording ready)\b/.test(text)) {
    return "Training Ready";
  }
  if (/\b(training planned|training scheduled|training date|training link|zoom link|sp training)\b/.test(text)) {
    return "Training Planned";
  }
  if (text.includes("training")) return "Training Review";
  return "Training TBD";
}

function getFinderModeLabel(item: EventWithMeta) {
  const status = normalizeFinderText(item.event.status);
  if (/\b(live|in progress|running)\b/.test(status)) return "Live Mode";
  if (item.start && getStartOfDay(item.start) === getStartOfToday()) return "Live Today";
  return "Planning Mode";
}

function getEventFinderSearchText(item: EventWithMeta) {
  const teamInfo = getBestEventTeamInfo({
    notes: item.event.notes,
    schedule_owner_text: item.event.schedule_owner_text,
  });
  const badges = getEventBadges(item.event).map((badge) => badge.label);
  const sessionText = (item.event.sessions || [])
    .map((session) => [session.session_date, session.start_time, session.end_time, session.location, session.room].map(asText).join(" "))
    .join(" ");

  return normalizeFinderText([
    item.event.name,
    item.event.status,
    item.event.date_text,
    item.event.location,
    item.event.notes,
    item.event.schedule_owner_text,
    eventLocation(item.event),
    sessionText,
    teamInfo.teamLabel,
    teamInfo.facultyLabel,
    ...teamInfo.teamNames,
    ...teamInfo.facultyNames,
    ...badges,
    getPrimaryEventTypeLabel(item.event),
    getTrainingReadinessLabel(item.event),
    getEventModalityLabel(item.event),
    ...(item.event.assigned_sp_names || []),
  ].join(" "));
}

function isEditableFinderTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const editableTarget = target.closest("input, textarea, select, [contenteditable='true']");
  return Boolean(editableTarget);
}

function isEventToday(item: EventWithMeta) {
  return Boolean(item.start && getStartOfDay(item.start) === getStartOfToday());
}

function isEventUpcomingOrCurrent(item: EventWithMeta) {
  const text = normalizeFinderText(item.event.status);
  if (/\b(live|in progress|running)\b/.test(text)) return true;
  if (!item.start) return false;
  return item.start.getTime() >= Date.now() - 6 * 60 * 60 * 1000;
}

function isEventTrainingSoon(item: EventWithMeta) {
  const searchText = getEventFinderSearchText(item);
  if (!/\b(training|zoom|training planned|training scheduled|training date|sp training)\b/.test(searchText)) return false;
  if (!item.start) return true;
  const daysUntilEvent = Math.floor((item.start.getTime() - Date.now()) / MS_PER_DAY);
  return daysUntilEvent >= -1 && daysUntilEvent <= 21;
}

function eventHasTrainingOrMaterialContext(item: EventWithMeta) {
  const searchText = getEventFinderSearchText(item);
  return (
    getTrainingReadinessLabel(item.event) !== "Training TBD" ||
    /\b(material|materials|zoom|training)\b/.test(searchText)
  );
}

function eventMaterialsNeedReview(item: EventWithMeta) {
  const searchText = getEventFinderSearchText(item);
  return /\b(materials needed|material needed|awaiting faculty materials|awaiting materials|materials uploaded review needed|materials uploaded review)\b/.test(searchText);
}

function eventRecordingPending(item: EventWithMeta) {
  const searchText = getEventFinderSearchText(item);
  return /\b(recording pending|recording planned|recording status pending|recording status planned|recording review)\b/.test(searchText);
}

function eventNeedsOperationalAttention(item: EventWithMeta) {
  return item.shortage > 0 || eventMaterialsNeedReview(item) || eventRecordingPending(item) || isEventTrainingSoon(item);
}

function eventMatchesFinderChip(item: EventWithMeta, chip: FinderChipKey) {
  if (chip === "needs_staffing") return item.shortage > 0;
  if (chip === "training_soon") return isEventTrainingSoon(item);
  if (chip === "live_today") return isEventToday(item) || getFinderModeLabel(item) === "Live Mode";
  if (chip === "materials_needed") return eventMaterialsNeedReview(item);
  if (chip === "recording_pending") return eventRecordingPending(item);
  return false;
}

function scoreFinderResult(
  item: EventWithMeta,
  query: string,
  options: {
    activeChip?: FinderChipKey | null;
    myEventIds?: Set<string>;
    scope?: DashboardScope;
  } = {}
) {
  const normalizedQuery = normalizeFinderText(query);
  if (options.activeChip && !eventMatchesFinderChip(item, options.activeChip)) return 0;
  if (!normalizedQuery && !options.activeChip) return 0;

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const name = normalizeFinderText(item.event.name);
  const searchText = getEventFinderSearchText(item);
  let score = options.activeChip ? 100 : 0;

  for (const token of tokens) {
    if (!fuzzyTokenMatches(token, searchText)) return 0;
    if (name === token) score += 96;
    else if (name.startsWith(token)) score += 54;
    else if (name.includes(token)) score += 38;
    else if (searchText.includes(token)) score += 18;
    else score += 8;
  }

  if (normalizedQuery) {
    if (name === normalizedQuery) score += 520;
    else if (name.startsWith(normalizedQuery)) score += 180;
    else if (name.includes(normalizedQuery)) score += 120;
  }

  if (isEventUpcomingOrCurrent(item)) score += 60;
  if (options.scope === "my" && options.myEventIds?.has(item.event.id)) score += 48;
  if (eventNeedsOperationalAttention(item)) score += 34;
  if (item.start) {
    const daysUntilEvent = Math.floor((item.start.getTime() - Date.now()) / MS_PER_DAY);
    if (daysUntilEvent >= 0) score += Math.max(0, 28 - Math.min(28, daysUntilEvent));
  }
  return score;
}

function renderAssignedPeople(names?: string[] | null) {
  const preview = (names || []).filter(Boolean);

  if (!preview.length) {
    return <span className="text-sm font-semibold text-[var(--cfsp-text-muted)]">No assigned SPs yet</span>;
  }

  const visible = preview.slice(0, MAX_ROSTER_CHIPS);
  const remaining = preview.length - visible.length;

  return (
    <>
      {visible.map((name) => (
        <span key={name} className="cfsp-chip">
          {name}
        </span>
      ))}
      {remaining > 0 ? <span className="cfsp-chip">+{remaining} more</span> : null}
    </>
  );
}

function TeamOwnershipBlock({
  notes,
  scheduleOwnerText,
}: {
  notes?: string | null;
  scheduleOwnerText?: string | null;
}) {
  const teamInfo = getBestEventTeamInfo({ notes, schedule_owner_text: scheduleOwnerText });

  return (
    <div
      className="rounded-[12px] px-4 py-3"
      style={{
        border: "1px solid var(--cfsp-border)",
        background: "linear-gradient(180deg, var(--cfsp-surface-muted) 0%, var(--cfsp-surface) 100%)",
      }}
    >
      <div className="cfsp-label">{teamInfo.teamLabel}</div>
      {teamInfo.teamNames.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {teamInfo.teamNames.map((name) => (
            <span
              key={name}
              className="inline-flex min-h-[32px] items-center rounded-full px-3 py-1 text-sm font-bold"
              style={{
                border: "1px solid var(--cfsp-border)",
                background: "var(--cfsp-surface)",
                color: "var(--cfsp-blue)",
              }}
            >
              {name}
            </span>
          ))}
        </div>
      ) : (
        <div className="mt-3 text-sm font-semibold" style={{ color: "var(--cfsp-warning)" }}>Team not assigned</div>
      )}
      {teamInfo.facultyNames.length ? (
        <div className="mt-3 grid gap-2">
          <div className="cfsp-label">{teamInfo.facultyLabel}</div>
          <div className="flex flex-wrap gap-2">
            {teamInfo.facultyNames.map((name) => (
              <span
                key={`faculty-${name}`}
                className="inline-flex min-h-[30px] items-center rounded-full px-3 py-1 text-sm font-bold"
                style={{
                  border: "1px solid var(--cfsp-border)",
                  background: "var(--cfsp-surface)",
                  color: "var(--cfsp-text)",
                }}
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {process.env.NODE_ENV !== "production" && !teamInfo.teamNames.length ? (
        <div className="mt-2 text-xs font-semibold text-[var(--cfsp-text-muted)]">
          Notes checked: {notes ? "yes" : "no"} · Ownership labels found: none
        </div>
      ) : null}
    </div>
  );
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

function getFirstName(fullName: string) {
  return asText(fullName).split(/\s+/).filter(Boolean)[0] || "";
}

function getEmailUsername(email: string) {
  const text = asText(email);
  const atIndex = text.indexOf("@");
  return atIndex > 0 ? text.slice(0, atIndex) : text;
}

function getGreetingName(me: MeResponse | null) {
  const fullNameFirst = getFirstName(asText(me?.profile?.full_name));
  if (fullNameFirst) return fullNameFirst;

  const scheduleName = asText(me?.profile?.schedule_match_name) || asText(me?.profile?.schedule_name);
  if (scheduleName) return scheduleName;

  const emailUsername = getEmailUsername(asText(me?.user?.email));
  if (emailUsername) return emailUsername;

  return asText(me?.user?.email) || "Member";
}

function WorkflowSection({
  sectionKey,
  title,
  description,
  items,
  emptyMessage,
  visibleCount,
  onLoadMore,
  browseHref,
  highlightedEventId,
  registerEventRef,
}: {
  sectionKey: "needsAttention" | "inProgress" | "ready";
  title: string;
  description: string;
  items: EventWithMeta[];
  emptyMessage: string;
  visibleCount: number;
  onLoadMore: (sectionKey: "needsAttention" | "inProgress" | "ready") => void;
  browseHref: string;
  highlightedEventId?: string | null;
  registerEventRef: (eventId: string, node: HTMLElement | null) => void;
}) {
  const visibleItems = items.slice(0, visibleCount);
  const remainingCount = Math.max(items.length - visibleItems.length, 0);
  const needsAttentionSection = sectionKey === "needsAttention";
  const sectionPanelStyle = needsAttentionSection
    ? {
        background: "var(--cfsp-attention-panel-bg)",
        border: "1px solid var(--cfsp-attention-panel-border)",
        boxShadow: "var(--cfsp-attention-panel-shadow)",
      }
    : undefined;
  const sectionHeaderStyle = needsAttentionSection
    ? {
        borderBottom: "1px solid rgba(20, 91, 150, 0.14)",
        background: "var(--cfsp-attention-panel-header)",
      }
    : { borderBottom: "1px solid var(--cfsp-border)" };
  const sectionTitleStyle = needsAttentionSection ? { color: "var(--cfsp-attention-title)", textShadow: "0 0 18px rgba(20, 91, 150, 0.12)" } : undefined;
  const sectionDescriptionStyle = needsAttentionSection ? { color: "var(--cfsp-attention-copy)" } : undefined;
  const sectionMetaStyle = needsAttentionSection ? { color: "var(--cfsp-attention-meta)" } : { color: "var(--cfsp-text-muted)" };
  const sectionLinkStyle = needsAttentionSection ? { color: "var(--cfsp-attention-link)" } : { color: "var(--cfsp-blue)" };

  return (
    <section className="cfsp-panel overflow-hidden" style={sectionPanelStyle}>
      <div className="px-5 py-4" style={sectionHeaderStyle}>
        <h2 className="cfsp-section-title text-[1.25rem]" style={sectionTitleStyle}>{title}</h2>
        <p className="cfsp-section-copy" style={sectionDescriptionStyle}>{description}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm font-bold">
          <span style={sectionMetaStyle}>
            Showing {Math.min(visibleItems.length, items.length)} of {items.length}
          </span>
          <Link href={browseHref} className="no-underline hover:underline" style={sectionLinkStyle}>
            View all matching events
          </Link>
        </div>
      </div>

      <div className="px-5 py-5">
        {items.length === 0 ? (
          <div className="cfsp-alert cfsp-alert-info">{emptyMessage}</div>
        ) : (
          <div className="grid gap-3">
            {visibleItems.map((item) => {
              const tone = getEventCoverageTone(item);
              const presentation = classifyEventPresentation({
                name: item.event.name,
                status: item.event.status,
                notes: item.event.notes,
                location: item.event.location,
                spNeeded: item.event.sp_needed,
                assignmentCount: item.event.total_assignments ?? item.event.sp_assigned,
                confirmedCount: item.event.confirmed_assignments ?? item.event.sp_assigned,
              });
              const badges = getEventBadges(item.event);
              const visualTone = getEventCoverageVisualToneWithBase(
                getEventCoverageVisualState({
                  needed: item.needed,
                  assigned: item.assigned,
                  confirmed: item.confirmed,
                  archived: false,
                }),
                presentation.primaryBadgeKind === "skills_workshop" ? "skills" : "default"
              );

              return (
                <article
                  key={item.event.id}
                  ref={(node) => registerEventRef(item.event.id, node)}
                  className="cursor-pointer rounded-[12px] px-4 py-4"
                  style={{
                    border:
                      highlightedEventId === item.event.id
                        ? "1px solid rgba(59, 130, 246, 0.55)"
                        : `1px solid ${visualTone.cardBorder}`,
                    background:
                      highlightedEventId === item.event.id
                        ? "linear-gradient(180deg, rgba(239, 246, 255, 0.98) 0%, rgba(219, 234, 254, 0.96) 100%)"
                        : needsAttentionSection
                          ? "linear-gradient(135deg, rgba(255, 255, 255, 0.72) 0%, rgba(231, 250, 255, 0.28) 48%, rgba(236, 255, 248, 0.2) 100%)"
                          : visualTone.cardBackground,
                    boxShadow:
                      highlightedEventId === item.event.id
                        ? "0 0 0 2px rgba(96, 165, 250, 0.18), 0 16px 36px rgba(59, 130, 246, 0.14)"
                        : needsAttentionSection
                          ? "0 14px 30px rgba(20, 91, 150, 0.12), 0 0 22px rgba(25, 138, 112, 0.08), inset 0 1px 0 rgba(255,255,255,0.12)"
                          : visualTone.cardShadow,
                    transition: "box-shadow 180ms ease, border-color 180ms ease, background 180ms ease",
                  }}
                
                data-clickable-event-card
                role="button"
                tabIndex={0}
                onClick={() => window.location.assign(`/events/${encodeURIComponent(item.event.id)}?family=n421`)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    window.location.assign(`/events/${encodeURIComponent(item.event.id)}?family=n421`);
                  }
                }}
              >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap gap-2">
                        <span className="cfsp-badge" style={tone}>
                          {tone.label}
                        </span>
                        {badges.map((badge) => (
                          <span
                            key={`${item.event.id}-${badge.key}`}
                            className="cfsp-badge"
                            style={{
                              background: badge.background,
                              border: `1px solid ${badge.border}`,
                              color: badge.color,
                            }}
                          >
                            {badge.label}
                          </span>
                        ))}
                      </div>

                      <h3 className="m-0 text-[1.12rem] font-black" style={{ color: needsAttentionSection ? "var(--cfsp-attention-title)" : visualTone.titleText }}>
                        {item.event.name?.trim() || "Untitled Event"}
                      </h3>

                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold" style={{ color: needsAttentionSection ? "var(--cfsp-attention-meta)" : "var(--cfsp-text-muted)" }}>
                        <span>{formatEventDate(item.start, item.event.date_text)}</span>
                        <span>{eventLocation(item.event)}</span>
                        <span>
                          Coverage {item.assigned}/{item.needed}
                        </span>
                      </div>

                      <div className="mt-3">
                        <TeamOwnershipBlock
                          notes={item.event.notes}
                          scheduleOwnerText={item.event.schedule_owner_text}
                        />
                      </div>

                      <div className="mt-3 grid gap-2">
                        <div className="cfsp-label">Assigned SPs</div>
                        <div className="flex flex-wrap gap-2">{renderAssignedPeople(item.event.assigned_sp_names)}</div>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
            {remainingCount > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="text-sm font-semibold text-[var(--cfsp-text-muted)]">
                  {remainingCount} more event{remainingCount === 1 ? "" : "s"} in this section.
                </div>
                <button type="button" onClick={() => onLoadMore(sectionKey)} className="cfsp-btn cfsp-btn-secondary">
                  Load More
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}

function GlobalEventFinder({
  items,
  myEventIds,
  scope,
  onOpenEvent,
}: {
  items: EventWithMeta[];
  myEventIds: Set<string>;
  scope: DashboardScope;
  onOpenEvent: (eventId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [activeChip, setActiveChip] = useState<FinderChipKey | null>(null);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const trimmedQuery = query.trim();
  const hasActiveSearch = Boolean(trimmedQuery || activeChip);

  const results = useMemo<FinderResult[]>(() => {
    if (!hasActiveSearch) return [];

    return items
      .map((item) => {
        const score = scoreFinderResult(item, trimmedQuery, { activeChip, myEventIds, scope });
        const staffingLabel = item.needed <= 0
          ? "No SP target"
          : item.shortage > 0
            ? "Staffing gap"
            : "Coverage ready";
        return {
          item,
          score,
          eventTypeLabel: getPrimaryEventTypeLabel(item.event),
          staffingLabel,
          shortageLabel: item.shortage > 0
            ? `${item.shortage} SP shortage`
            : item.needed > 0
              ? "Coverage met"
              : "No shortage",
          trainingLabel: getTrainingReadinessLabel(item.event),
          modeLabel: getFinderModeLabel(item),
          dateLabel: formatFinderDate(item.start, item.event.date_text),
        };
      })
      .filter((result) => result.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (!a.item.start && !b.item.start) return 0;
        if (!a.item.start) return 1;
        if (!b.item.start) return -1;
        return a.item.start.getTime() - b.item.start.getTime();
      })
      .slice(0, 7);
  }, [activeChip, hasActiveSearch, items, myEventIds, scope, trimmedQuery]);

  const chipOptions = useMemo(
    () =>
      FINDER_CHIPS.map((chip) => ({
        ...chip,
        count: items.filter((item) => eventMatchesFinderChip(item, chip.key)).length,
      })),
    [items]
  );
  const quickStats = useMemo(
    () => ({
      operations: items.length,
      attention: items.filter(eventNeedsOperationalAttention).length,
      today: items.filter((item) => eventMatchesFinderChip(item, "live_today")).length,
    }),
    [items]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const restoreTimer = window.setTimeout(() => {
      setCollapsed(false);
      window.localStorage.setItem(GLOBAL_EVENT_FINDER_COLLAPSED_KEY, "false");
    }, 0);

    return () => window.clearTimeout(restoreTimer);
  }, []);

  useEffect(() => {
    function handleSlashShortcut(event: KeyboardEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (event.key !== "/" || isEditableFinderTarget(event.target)) return;
      event.preventDefault();
      if (collapsed) {
        setCollapsed(false);
        window.localStorage.setItem(GLOBAL_EVENT_FINDER_COLLAPSED_KEY, "false");
      }
      window.requestAnimationFrame(() => inputRef.current?.focus());
      setResultsOpen(Boolean(trimmedQuery || activeChip));
    }

    window.addEventListener("keydown", handleSlashShortcut);
    return () => window.removeEventListener("keydown", handleSlashShortcut);
  }, [activeChip, collapsed, trimmedQuery]);

  function toggleCollapsed() {
    const nextCollapsed = !collapsed;
    setCollapsed(nextCollapsed);
    setResultsOpen(false);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(GLOBAL_EVENT_FINDER_COLLAPSED_KEY, String(nextCollapsed));
    }
  }

  function clearSearch() {
    setQuery("");
    setActiveChip(null);
    setResultsOpen(false);
    inputRef.current?.focus();
  }

  function openEvent(eventId: string) {
    setResultsOpen(false);
    onOpenEvent(eventId);
  }

  function toggleChip(chip: FinderChipKey) {
    const nextChip = activeChip === chip ? null : chip;
    setActiveChip(nextChip);
    setResultsOpen(Boolean(trimmedQuery || nextChip));
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  const consoleShellStyle = {
    border: "1px solid rgba(20, 91, 150, 0.18)",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(247,250,252,0.96) 100%)",
    boxShadow:
      "0 16px 36px rgba(24, 52, 78, 0.1), inset 0 1px 0 rgba(255,255,255,0.86)",
    backdropFilter: "blur(12px)",
    "--cfsp-attention-title": "#145b96",
    "--cfsp-attention-meta": "rgba(42, 82, 110, 0.78)",
    "--cfsp-attention-chip-bg": "rgba(255, 246, 232, 0.82)",
    "--cfsp-attention-chip-border": "rgba(168, 100, 17, 0.24)",
    "--cfsp-attention-chip-text": "#8a570d",
  };
  const consoleChipStyle = {
    border: "1px solid rgba(20, 91, 150, 0.14)",
    background: "rgba(255, 255, 255, 0.86)",
    color: "var(--cfsp-attention-title)",
  };

  if (collapsed) {
    return (
      <div
        className="relative rounded-[12px] px-3 py-2"
        style={consoleShellStyle}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={toggleCollapsed}
            className="flex min-w-0 items-center gap-2 text-left"
            aria-expanded="false"
          >
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: "var(--cfsp-green)", boxShadow: "0 0 12px rgba(25, 138, 112, 0.5)" }}
            />
            <span className="truncate text-[0.72rem] font-black uppercase tracking-[0.14em] text-[var(--cfsp-attention-title)]">
              CFSP Command Console
            </span>
            <span className="hidden text-xs font-semibold text-[var(--cfsp-attention-meta)] sm:inline">
              {quickStats.operations} events · {quickStats.attention} attention
            </span>
          </button>
          <button
            type="button"
            onClick={toggleCollapsed}
            className="rounded-full px-2.5 py-1 text-[0.68rem] font-bold transition"
            style={{
              border: "1px solid rgba(25, 138, 112, 0.18)",
              background: "rgba(255, 255, 255, 0.62)",
              color: "var(--cfsp-attention-title)",
            }}
          >
            Open Console
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative rounded-[16px] px-3.5 py-3"
      style={consoleShellStyle}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          clearSearch();
          return;
        }
        if (event.key === "Enter" && resultsOpen && results[0]) {
          event.preventDefault();
          openEvent(results[0].item.event.id);
        }
      }}
    >
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="flex shrink-0 items-center gap-2 lg:w-[190px]">
          <div className="cfsp-command-mark is-compact" aria-hidden="true">
            <span
              style={{
                position: "absolute",
                inset: "11px",
                borderRadius: "10px",
                border: "1px solid rgba(125, 211, 252, 0.16)",
                zIndex: 1,
              }}
            />
            <svg className="cfsp-command-mark-grid" aria-hidden="true" viewBox="0 0 88 64" fill="none">
              <path
                d="M4 44 H15 C20 44 21 33 27 33 H34 C40 33 41 20 48 20 C56 20 57 38 65 38 H74 C79 38 80 29 84 29"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M12 18 H30 M58 14 H76 M16 54 H42 M58 52 H78"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                opacity="0.38"
              />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="truncate text-[0.68rem] font-black uppercase tracking-[0.13em] text-[var(--cfsp-attention-title)]">CFSP Command Console</div>
            <div className="text-[0.66rem] font-semibold text-[var(--cfsp-attention-meta)]">Event signal lookup</div>
          </div>
        </div>

        <div
          className="flex min-h-[36px] min-w-0 flex-1 items-center gap-2 rounded-[10px] px-2.5 py-1.5"
          style={{
            border: "1px solid rgba(25, 138, 112, 0.22)",
            background: "rgba(255, 255, 255, 0.76)",
            boxShadow: resultsOpen ? "0 0 0 2px rgba(20, 91, 150, 0.2), 0 0 24px rgba(25, 138, 112, 0.12)" : "inset 0 1px 0 rgba(255,255,255,0.08)",
          }}
        >
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setResultsOpen(Boolean(event.target.value.trim() || activeChip));
            }}
            onFocus={() => setResultsOpen(hasActiveSearch)}
            aria-label="CFSP Command Console search"
            aria-expanded={resultsOpen && hasActiveSearch}
            aria-controls="global-event-finder-results"
            role="combobox"
            placeholder="Search events, staffing, readiness, locations..."
            className="min-w-0 flex-1 bg-transparent text-[0.92rem] font-bold outline-none text-[var(--cfsp-attention-title)] placeholder:text-[var(--cfsp-attention-meta)]"
          />
          <span
            className="hidden rounded-[6px] px-1.5 py-0.5 text-[0.58rem] font-black sm:inline"
            style={{
              border: "1px solid var(--cfsp-input-border)",
              background: "rgba(255,255,255,0.12)",
              color: "var(--cfsp-attention-meta)",
            }}
          >
            /
          </span>
          {query || activeChip ? (
            <button
              type="button"
              onClick={clearSearch}
              className="rounded-[7px] px-2 py-0.5 text-[0.62rem] font-bold transition"
              style={{ color: "var(--cfsp-attention-meta)" }}
              aria-label="Clear CFSP Command Console"
            >
              Clear
            </button>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1 text-[0.6rem] font-semibold">
          <span className="inline-flex items-center gap-1 rounded-[8px] px-2 py-0.5" style={consoleChipStyle}>
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--cfsp-blue)]" />
            {quickStats.operations} events
          </span>
          <span className="inline-flex items-center gap-1 rounded-[8px] px-2 py-0.5" style={{ border: "1px solid var(--cfsp-attention-chip-border)", background: "var(--cfsp-attention-chip-bg)", color: "var(--cfsp-attention-chip-text)" }}>
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
            {quickStats.attention} attention
          </span>
          <span className="inline-flex items-center gap-1 rounded-[8px] px-2 py-0.5" style={consoleChipStyle}>
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--cfsp-green)]" />
            {quickStats.today} live / today
          </span>
        </div>

        <button
          type="button"
          onClick={toggleCollapsed}
          className="shrink-0 rounded-[8px] px-2 py-0.5 text-[0.62rem] font-bold transition"
          style={{
            border: "1px solid rgba(25, 138, 112, 0.18)",
            background: "rgba(255, 255, 255, 0.58)",
            color: "var(--cfsp-attention-meta)",
          }}
          aria-expanded="true"
        >
          Hide Console
        </button>
      </div>

      <div
        className="mt-1.5 flex flex-wrap items-center gap-1 rounded-[10px] px-1.5 py-1"
        aria-label="Operational search toggles"
        style={{
          border: "1px solid rgba(20, 91, 150, 0.12)",
          background: "rgba(247, 250, 252, 0.86)",
        }}
      >
        {chipOptions.map((chip) => {
          const selected = activeChip === chip.key;
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => toggleChip(chip.key)}
              className="inline-flex h-6.5 items-center gap-1 rounded-[7px] border px-2 py-0 text-[0.6rem] font-semibold transition"
              style={{
                borderColor: selected ? "rgba(20, 91, 150, 0.42)" : "rgba(20, 91, 150, 0.12)",
                background: selected ? "#145b96" : "rgba(255, 255, 255, 0.78)",
                color: selected ? "#ffffff" : "var(--cfsp-attention-meta)",
                boxShadow: selected ? "0 6px 14px rgba(20, 91, 150, 0.16)" : "none",
              }}
              aria-pressed={selected}
            >
              {selected ? <span className="h-1.5 w-1.5 rounded-full bg-white/85" /> : <span className="h-1.5 w-1.5 rounded-full bg-[var(--cfsp-text-muted)]" />}
              {chip.label}
              <span className="rounded-full border border-transparent px-1.5 py-0 text-[0.58rem] font-bold" style={{ background: selected ? "rgba(255,255,255,0.18)" : "rgba(120, 130, 150, 0.12)" }}>
                {chip.count}
              </span>
            </button>
          );
        })}
      </div>

      {resultsOpen && hasActiveSearch ? (
        <div
          id="global-event-finder-results"
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 grid max-h-[360px] gap-1.5 overflow-y-auto rounded-[14px] p-2"
          style={{
            border: "1px solid var(--cfsp-border)",
            background: "var(--cfsp-surface)",
            boxShadow: "var(--cfsp-card-glow)",
          }}
        >
          {results.length ? (
            results.map((result) => {
              const eventId = encodeURIComponent(result.item.event.id);
              const eventHref = `/events/${eventId}`;
              const builderHref = `/events/${eventId}/schedule-builder`;
              const operationalHref = `${eventHref}#coverage-actions`;
              const showTrainingMaterialsAction = eventHasTrainingOrMaterialContext(result.item);

              return (
                <div
                  key={result.item.event.id}
                  role="option"
                  aria-selected="false"
                  className="rounded-[11px] border px-3 py-2.5 transition"
                  style={{
                    border: "1px solid var(--cfsp-border)",
                    background: "var(--cfsp-surface-muted)",
                    boxShadow: "0 10px 24px rgba(0, 0, 0, 0.05)",
                  }}
                >
                  <button type="button" onClick={() => openEvent(result.item.event.id)} className="w-full text-left">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-[0.98rem] font-black text-[var(--cfsp-text)]">
                          {result.item.event.name?.trim() || "Untitled Event"}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs font-semibold text-[var(--cfsp-text-muted)]">
                          <span>{result.dateLabel}</span>
                          <span>•</span>
                          <span>{eventLocation(result.item.event)}</span>
                        </div>
                      </div>
                      <span
                        className="rounded-lg px-2.5 py-1 text-[0.68rem] font-semibold"
                        style={{
                          border: "1px solid rgba(25, 138, 112, 0.3)",
                          background: "rgba(25, 138, 112, 0.16)",
                          color: "var(--cfsp-green-dark)",
                        }}
                      >
                        {result.modeLabel}
                      </span>
                    </div>

                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {[
                        result.eventTypeLabel,
                        result.trainingLabel,
                        result.staffingLabel,
                        result.shortageLabel,
                        getEventModalityLabel(result.item.event),
                      ].map((label) => (
                        <span
                          key={`${result.item.event.id}-${label}`}
                          className="rounded-lg px-2 py-1 text-[0.68rem] font-medium"
                          style={{
                            border: "1px solid var(--cfsp-border)",
                            background: label.toLowerCase().includes("shortage")
                              ? "rgba(248, 113, 113, 0.14)"
                              : "rgba(186, 230, 253, 0.08)",
                            color: label.toLowerCase().includes("shortage") ? "#fecaca" : "var(--cfsp-text)",
                          }}
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  </button>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Link
                      href={eventHref}
                      onClick={() => setResultsOpen(false)}
                      className="rounded-lg px-2.5 py-1 text-[0.66rem] font-semibold no-underline transition"
                      style={{
                        border: "1px solid var(--cfsp-blue)",
                        background: "rgba(20, 91, 150, 0.08)",
                        color: "var(--cfsp-blue)",
                      }}
                    >
                      Open Event
                    </Link>
                    <Link
                      href={builderHref}
                      onClick={() => setResultsOpen(false)}
                      className="rounded-lg px-2.5 py-1 text-[0.66rem] font-semibold no-underline transition"
                      style={{
                        border: "1px solid rgba(25, 138, 112, 0.35)",
                        background: "rgba(25, 138, 112, 0.08)",
                        color: "var(--cfsp-green-dark)",
                      }}
                    >
                      Open Builder
                    </Link>
                    {showTrainingMaterialsAction ? (
                      <Link
                        href={operationalHref}
                        onClick={() => setResultsOpen(false)}
                        className="rounded-lg px-2.5 py-1 text-[0.66rem] font-semibold no-underline transition"
                        style={{
                          border: "1px solid rgba(243, 187, 103, 0.44)",
                          background: "rgba(243, 187, 103, 0.12)",
                          color: "var(--cfsp-warning)",
                        }}
                      >
                        Training / Materials
                      </Link>
                    ) : null}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-[12px] border border-dashed border-[var(--cfsp-border)] px-3 py-5 text-sm font-semibold text-[var(--cfsp-text-muted)]">
              No matching operations found.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function RecentEventsPanel({
  recentEvents,
  eventsById,
  onClear,
}: {
  recentEvents: RecentEventEntry[];
  eventsById: Map<string, EventRecord>;
  onClear: () => void;
}) {
  const visibleRecentEvents = recentEvents.filter((recent) => {
    const freshEvent = eventsById.get(recent.id);
    return !isRecentStandaloneTrainingRecord(recent, freshEvent);
  });

  return (
    <section
      className="cfsp-panel rounded-[14px] px-4 py-4"
      style={{
        border: "1px solid rgba(20, 91, 150, 0.12)",
        background: "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(247,250,252,0.92) 100%)",
        boxShadow: "0 10px 26px rgba(24, 52, 78, 0.06)",
      }}
      aria-label="Recent Events"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="cfsp-label">Recent Events</div>
          <p className="mt-1 text-xs font-semibold text-[var(--cfsp-text-muted)]">
            Your last opened event workspaces on this device.
          </p>
        </div>
        {visibleRecentEvents.length ? (
          <button
            type="button"
            onClick={onClear}
            className="rounded-[8px] px-2 py-1 text-[0.68rem] font-bold"
            style={{
              border: "1px solid rgba(20, 91, 150, 0.12)",
              background: "rgba(255,255,255,0.74)",
              color: "var(--cfsp-text-muted)",
            }}
          >
            Clear recent
          </button>
        ) : null}
      </div>

      <div className="mt-3 grid gap-2">
        {visibleRecentEvents.length ? (
          visibleRecentEvents.map((recent) => {
            const freshEvent = eventsById.get(recent.id);
            const eventName = freshEvent?.name?.trim() || recent.name || "Untitled Event";
            const eventDate = freshEvent?.date_text || recent.dateText;
            const locationLabel = freshEvent ? eventLocation(freshEvent) : recent.location;
            const statusLabel = freshEvent?.status || recent.status || recent.typeLabel || "Event";
            const openedLabel = formatRecentOpenedAt(recent.openedAt);

            return (
              <article
                key={recent.id}
                className="cursor-pointer rounded-[12px] px-3 py-3"
                style={{
                  border: "1px solid rgba(20, 91, 150, 0.1)",
                  background: "rgba(255,255,255,0.72)",
                }}
              
                data-clickable-event-card
                role="button"
                tabIndex={0}
                onClick={() => window.location.assign(`/events/${encodeURIComponent(recent.id)}?family=n421`)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    window.location.assign(`/events/${encodeURIComponent(recent.id)}?family=n421`);
                  }
                }}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="m-0 truncate text-sm font-black text-[var(--cfsp-text)]">
                        {eventName}
                      </h3>
                      <span
                        className="rounded-full px-2 py-0.5 text-[0.62rem] font-black uppercase tracking-[0.08em]"
                        style={{
                          border: "1px solid rgba(20, 91, 150, 0.14)",
                          background: "rgba(20, 91, 150, 0.07)",
                          color: "var(--cfsp-blue)",
                        }}
                      >
                        {statusLabel}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-[var(--cfsp-text-muted)]">
                      <span>{eventDate || "Date TBD"}</span>
                      {locationLabel ? <span>{locationLabel}</span> : null}
                      {openedLabel ? <span>Opened {openedLabel}</span> : null}
                    </div>
                  </div>
                </div>
              </article>
            );
          })
        ) : (
          <div
            className="rounded-[12px] px-3 py-4 text-sm font-semibold text-[var(--cfsp-text-muted)]"
            style={{
              border: "1px dashed rgba(20, 91, 150, 0.18)",
              background: "rgba(255,255,255,0.58)",
            }}
          >
            Recently opened events will appear here.
          </div>
        )}
      </div>
    </section>
  );
}

export default function DashboardPage() {
  const router = useRouter();

  const [authState, setAuthState] = useState<AuthState>("loading");
  const [me, setMe] = useState<MeResponse | null>(null);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [assignments, setAssignments] = useState<EventsResponse["assignments"]>([]);
  const [error, setError] = useState("");
  const [scope, setScope] = useState<DashboardScope>("my");
  const [jumpDate, setJumpDate] = useState(() => toDateInputValue(new Date()));
  const [planningJumpMessage, setPlanningJumpMessage] = useState("");
  const [highlightedEventId, setHighlightedEventId] = useState<string | null>(null);
  const [pendingJumpEventId, setPendingJumpEventId] = useState<string | null>(null);
  const [recentEvents, setRecentEvents] = useState<RecentEventEntry[]>([]);
  const [sectionVisibleCounts, setSectionVisibleCounts] = useState({
    needsAttention: DASHBOARD_SECTION_PAGE_SIZE,
    inProgress: DASHBOARD_SECTION_PAGE_SIZE,
    ready: DASHBOARD_SECTION_PAGE_SIZE,
  });
  const hasValidatedSessionRef = useRef(false);
  const eventCardRefs = useRef<Record<string, HTMLElement | null>>({});

  function registerEventRef(eventId: string, node: HTMLElement | null) {
    eventCardRefs.current[eventId] = node;
  }

  function resetSectionVisibleCounts() {
    setSectionVisibleCounts({
      needsAttention: DASHBOARD_SECTION_PAGE_SIZE,
      inProgress: DASHBOARD_SECTION_PAGE_SIZE,
      ready: DASHBOARD_SECTION_PAGE_SIZE,
    });
  }

  function handleScopeChange(nextScope: DashboardScope) {
    setScope(nextScope);
    resetSectionVisibleCounts();
  }

  function handleClearRecentEvents() {
    setRecentEvents([]);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(RECENT_EVENTS_STORAGE_KEY);
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const restoreTimer = window.setTimeout(() => {
      setRecentEvents(readRecentEventsFromStorage());
    }, 0);

    function handleStorage(event: StorageEvent) {
      if (event.key === RECENT_EVENTS_STORAGE_KEY) {
        setRecentEvents(readRecentEventsFromStorage());
      }
    }

    window.addEventListener("storage", handleStorage);
    return () => {
      window.clearTimeout(restoreTimer);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setAuthState("loading");
        setError("");

        const meRes = await fetch("/api/me", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          headers: {
            "Cache-Control": "no-store",
            Pragma: "no-cache",
          },
        });

        if (cancelled) return;

        if (meRes.status === 401) {
          if (hasValidatedSessionRef.current) {
            setAuthState("authed");
            setError("Your session could not be refreshed for one request. Please retry.");
            return;
          }
          setAuthState("guest");
          router.replace("/login");
          return;
        }

        const meJson = (await meRes.json()) as MeResponse;

        if (!meRes.ok || !meJson.ok) {
          setAuthState("authed");
          setMe(meJson);
          setError(meJson.error || "Could not load current user.");
          return;
        }

        setMe(meJson);
        setAuthState("authed");
        hasValidatedSessionRef.current = true;

        const eventsRes = await fetch("/api/events", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          headers: {
            "Cache-Control": "no-store",
            Pragma: "no-cache",
          },
        });

        if (cancelled) return;

        if (eventsRes.status === 401) {
          setAuthState("authed");
          setEvents([]);
          setError("Your dashboard session is active, but events could not be refreshed right now.");
          return;
        }

        const eventsJson = (await eventsRes.json()) as EventsResponse;

        if (!eventsRes.ok) {
          setError(eventsJson.error || "Could not load events.");
          setEvents([]);
          return;
        }

        setEvents(Array.isArray(eventsJson.events) ? eventsJson.events : []);
        setAssignments(Array.isArray(eventsJson.assignments) ? eventsJson.assignments : []);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load dashboard.");
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const currentUserId = asText(me?.user?.id);
  const scheduleMatchName = asText(me?.profile?.schedule_match_name) || asText(me?.profile?.schedule_name);
  const legacyScheduleName = asText(me?.profile?.schedule_name);
  const firstName = getFirstName(asText(me?.profile?.full_name));
  const emailUsername = getEmailUsername(asText(me?.user?.email));
  const displayName = getGreetingName(me);
  const role = asText(me?.profile?.role).toLowerCase();
  const isAdmin = role.includes("admin");
  const isSp = role === "sp";
  const isFaculty = role === "faculty";
  const isOperator = role === "sim_op" || role === "admin" || role === "super_admin";
  const profileIncomplete = !asText(me?.profile?.full_name) || (!isSp && !scheduleMatchName);
  const spLinkPending = isSp && asText(me?.sp_link?.status).toLowerCase() !== "linked";
  const matchTerms = Array.from(new Set([scheduleMatchName, legacyScheduleName, firstName, emailUsername].filter(Boolean)));

  const primaryWorkflowEvents = useMemo(
    () => events.filter((event) => !isStandaloneTrainingEvent({
      name: event.name,
      status: event.status,
      notes: event.notes,
      location: event.location,
      spNeeded: event.sp_needed,
      assignmentCount: event.total_assignments ?? event.sp_assigned,
      confirmedCount: event.confirmed_assignments ?? event.sp_assigned,
    })),
    [events]
  );

  const eventMeta = useMemo(() => {
    return [...primaryWorkflowEvents]
      .map((event) => {
        const needed = Number(event.sp_needed || 0);
        const assigned = Number(event.total_assignments ?? event.sp_assigned ?? 0);
        const confirmed = Number(event.confirmed_assignments ?? event.sp_assigned ?? 0);
        return {
          event,
          start: parseEventStart(event),
          needed,
          assigned,
          confirmed,
          shortage: Math.max(needed - confirmed, 0),
        };
      })
      .filter(
        ({ event }) =>
          !isPastEvent({
            latestSessionDate: event.latest_session_date,
            earliestSessionDate: event.earliest_session_date,
            dateText: event.date_text,
            notes: event.notes,
          })
      )
      .sort((a, b) => {
        if (!a.start && !b.start) return 0;
        if (!a.start) return 1;
        if (!b.start) return -1;
        return a.start.getTime() - b.start.getTime();
      });
  }, [primaryWorkflowEvents]);

  const archivedEventCount = useMemo(
    () =>
      primaryWorkflowEvents.filter((event) =>
        isPastEvent({
          latestSessionDate: event.latest_session_date,
          earliestSessionDate: event.earliest_session_date,
          dateText: event.date_text,
          notes: event.notes,
        })
      ).length,
    [primaryWorkflowEvents]
  );

  const allVisibleEvents = eventMeta;
  const eventsById = useMemo(() => new Map(primaryWorkflowEvents.map((event) => [event.id, event])), [primaryWorkflowEvents]);

  const myMatchedEvents = useMemo(
    () =>
      eventMeta.filter(({ event }) =>
        eventMatchesProfile(
          event,
          currentUserId,
          scheduleMatchName || legacyScheduleName || emailUsername,
          firstName || emailUsername
        )
      ),
    [currentUserId, emailUsername, eventMeta, firstName, legacyScheduleName, scheduleMatchName]
  );
  const myEventIds = useMemo(() => new Set(myMatchedEvents.map((item) => item.event.id)), [myMatchedEvents]);

  const selectedEvents = isSp ? allVisibleEvents : scope === "my" ? myMatchedEvents : allVisibleEvents;
  const myAssignmentByEventId = useMemo(() => {
    const next = new Map<string, string>();
    (assignments || []).forEach((assignment) => {
      const eventId = asText(assignment?.event_id);
      if (!eventId || next.has(eventId)) return;
      next.set(eventId, asText(assignment?.status) || (assignment?.confirmed ? "confirmed" : "assigned"));
    });
    return next;
  }, [assignments]);
  const openShortageCount = useMemo(
    () => selectedEvents.reduce((sum, event) => sum + event.shortage, 0),
    [selectedEvents]
  );

  const startOfToday = useMemo(() => getStartOfToday(), []);

  const needsAttention = useMemo(
    () =>
      selectedEvents.filter(
        (item) => item.shortage > 0 && (isTodayOrTomorrow(item.start, startOfToday) || item.assigned === 0)
      ),
    [selectedEvents, startOfToday]
  );

  const inProgress = useMemo(
    () =>
      selectedEvents
        .filter((item) => item.needed > 0 && item.assigned > 0 && item.assigned < item.needed),
    [selectedEvents]
  );

  const ready = useMemo(
    () =>
      selectedEvents
        .filter((item) => item.needed <= 0 || item.assigned >= item.needed),
    [selectedEvents]
  );
  const monthEventCount = useMemo(() => {
    const selected = jumpDate ? new Date(`${jumpDate}T00:00:00`) : new Date();
    const year = selected.getFullYear();
    const month = selected.getMonth();
    return selectedEvents.filter((item) => item.start && item.start.getFullYear() === year && item.start.getMonth() === month).length;
  }, [jumpDate, selectedEvents]);
  const selectedJumpMonthLabel = useMemo(() => {
    const selected = jumpDate ? new Date(`${jumpDate}T00:00:00`) : new Date();
    return selected.toLocaleDateString([], { month: "long", year: "numeric" });
  }, [jumpDate]);
  const spConfirmedEvents = useMemo(
    () => selectedEvents.filter((item) => ["confirmed", "hired"].includes((myAssignmentByEventId.get(item.event.id) || "").toLowerCase())),
    [myAssignmentByEventId, selectedEvents]
  );
  const spTrainingEvents = useMemo(
    () =>
      selectedEvents.filter((item) => {
        const text = [item.event.name, item.event.status].map(asText).join(" ").toLowerCase();
        return text.includes("training");
      }),
    [selectedEvents]
  );

  function handleLoadMore(sectionKey: "needsAttention" | "inProgress" | "ready") {
    setSectionVisibleCounts((current) => ({
      ...current,
      [sectionKey]: current[sectionKey] + DASHBOARD_SECTION_PAGE_SIZE,
    }));
  }

  function jumpToEventDate(date: Date) {
    const targetDayStart = getStartOfDay(date);
    const target = selectedEvents.find((item) => item.start && getStartOfDay(item.start) >= targetDayStart);

    if (!target) {
      setPlanningJumpMessage("No events found after this date.");
      setPendingJumpEventId(null);
      setHighlightedEventId(null);
      return;
    }

    let sectionKey: "needsAttention" | "inProgress" | "ready" = "ready";
    let sectionIndex = ready.findIndex((item) => item.event.id === target.event.id);

    const needsIndex = needsAttention.findIndex((item) => item.event.id === target.event.id);
    if (needsIndex >= 0) {
      sectionKey = "needsAttention";
      sectionIndex = needsIndex;
    } else {
      const progressIndex = inProgress.findIndex((item) => item.event.id === target.event.id);
      if (progressIndex >= 0) {
        sectionKey = "inProgress";
        sectionIndex = progressIndex;
      }
    }

    if (sectionIndex >= 0) {
      setSectionVisibleCounts((current) => ({
        ...current,
        [sectionKey]: Math.max(current[sectionKey], sectionIndex + 1),
      }));
    }

    setPlanningJumpMessage(`Jumped to ${target.event.name?.trim() || "event"} on ${formatShortDateLabel(target.start || date)}.`);
    setPendingJumpEventId(target.event.id);
    setHighlightedEventId(target.event.id);
  }

  function handlePlanningJump(dateText: string) {
    setJumpDate(dateText);
    if (!dateText) return;
    jumpToEventDate(new Date(`${dateText}T00:00:00`));
  }

  function handleQuickDateJump(mode: "today" | "thisWeek" | "nextWeek" | "thisMonth" | "nextMonth") {
    const now = new Date();
    let target = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (mode === "thisWeek") {
      target = getStartOfWeek(now);
    } else if (mode === "nextWeek") {
      const nextWeek = getStartOfWeek(now);
      nextWeek.setDate(nextWeek.getDate() + 7);
      target = nextWeek;
    } else if (mode === "thisMonth") {
      target = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (mode === "nextMonth") {
      target = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    }

    const nextValue = toDateInputValue(target);
    setJumpDate(nextValue);
    jumpToEventDate(target);
  }

  useEffect(() => {
    if (!pendingJumpEventId) return;
    const node = eventCardRefs.current[pendingJumpEventId];
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "start" });
    const clearTimer = window.setTimeout(() => {
      setHighlightedEventId((current) => (current === pendingJumpEventId ? null : current));
      setPendingJumpEventId((current) => (current === pendingJumpEventId ? null : current));
    }, 2600);
    return () => window.clearTimeout(clearTimer);
  }, [pendingJumpEventId, sectionVisibleCounts]);

  if (authState === "loading") {
    return (
      <main className="cfsp-page">
        <div className="cfsp-container">
          <div className="cfsp-panel px-6 py-8">
            <h1 className="text-3xl font-black text-[var(--cfsp-text)]">Loading dashboard...</h1>
            <p className="mt-3 text-[var(--cfsp-text-muted)]">Checking your session and loading your workspace.</p>
          </div>
        </div>
      </main>
    );
  }

  if (authState === "guest") {
    return null;
  }

  return (
    <SiteShell
      title="Dashboard"
      subtitle={
        isSp
          ? "Use your SP portal to review assigned events, trainings, communications, and upcoming access details."
          : isFaculty
            ? "Use your dashboard to track course-facing events, communication checkpoints, and planning context without the full staffing toolset."
            : "Use your dashboard as a personal home base for matched events, staffing work, and profile setup."
      }
    >
      <div className="grid gap-5">
        {spLinkPending ? (
          <div className="cfsp-alert cfsp-alert-info flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-black text-[var(--cfsp-text)]">Your SP account is awaiting directory matching.</div>
              <div className="mt-1 text-sm text-[var(--cfsp-text-muted)]">
                {asText(me?.sp_link?.onboarding_message) || "Assigned events will appear automatically once your account is matched to the SP directory."}
              </div>
            </div>
            <Link href="/me" className="cfsp-btn cfsp-btn-secondary">
              Review Profile
            </Link>
          </div>
        ) : null}

        {profileIncomplete ? (
          <div className="cfsp-alert cfsp-alert-info flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-black text-[var(--cfsp-text)]">Complete your profile so CFSP can match events to you.</div>
              <div className="mt-1 text-sm text-[var(--cfsp-text-muted)]">
                {isSp ? "Add your full name so CFSP can keep your SP account linked correctly." : "Add your full name and schedule match name to improve event matching."}
              </div>
            </div>
            <Link href="/me" className="cfsp-btn cfsp-btn-secondary">
              Edit Profile
            </Link>
          </div>
        ) : null}

        <section className="grid gap-5 xl:grid-cols-[1.45fr_0.95fr]">
          <div
            className="rounded-[14px] px-5 py-5"
            style={{
              border: "1px solid var(--cfsp-border)",
              background: "var(--cfsp-dashboard-hero-bg)",
              boxShadow: "var(--cfsp-card-glow)",
            }}
          >
            <p className="cfsp-kicker">Home base</p>
            <h2 className="mt-3 text-[1.8rem] leading-tight font-black text-[var(--cfsp-text)]">
              Welcome back, {displayName}.
            </h2>
            <p className="mt-3 max-w-2xl text-[0.98rem] leading-6 text-[var(--cfsp-text-muted)]">
              {isSp
                ? "Start with your assigned events, confirmed work, and training access so you can prep quickly without digging through operations screens."
                : isFaculty
                  ? "Start with events connected to your teaching or course support work, then switch to the broader event list when you need more planning context."
                  : "A clean launchpad for finding events, opening core tools, and choosing which dashboard panels deserve your attention today."}
            </p>

            <div className="mt-5 rounded-[18px] border border-[rgba(20,91,150,0.13)] bg-[linear-gradient(135deg,rgba(255,255,255,0.86),rgba(232,246,250,0.58))] p-3 shadow-[0_14px_34px_rgba(20,91,150,0.08)]">
              <div className="cfsp-label">Quick launch</div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {[
                  { href: "/events", label: isSp ? "My Event Portal" : "Open Events Board", primary: true, show: true },
                  { href: "/events/new", label: "Create New Event", primary: true, show: !isSp && isOperator },
                  { href: "/events/upload", label: "Upload", primary: false, show: !isSp && isAdmin },
                  { href: "/schedule-builder", label: "Schedule Builder", primary: false, show: !isSp && isOperator },
                  { href: "/sps", label: "SP Database", primary: false, show: !isSp && isOperator },
                  { href: "/simvitals", label: "SimVitals", primary: false, show: true },
                  { href: "/settings", label: "Settings", primary: false, show: true },
                  { href: "/staff", label: "Staff", primary: false, show: !isSp && isAdmin },
                  { href: "/admin", label: "Admin", primary: false, show: !isSp && isOperator },
                  { href: "/me", label: isSp ? "Update Account" : "Edit Profile", primary: false, show: true },
                ].filter((action) => action.show).map((action) => (
                  <Link
                    key={action.href}
                    href={action.href}
                    className={`cfsp-btn ${action.primary ? "cfsp-btn-primary" : "cfsp-btn-secondary"} justify-center`}
                  >
                    {action.label}
                  </Link>
                ))}
              </div>
              {!isSp ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href="/events?view=archive" className="text-sm font-bold no-underline hover:underline" style={{ color: "var(--cfsp-blue)" }}>
                    Archive access
                  </Link>
                  <span className="text-sm font-semibold text-[var(--cfsp-text-muted)]">
                    SimVitals and deeper panels are available below when you want them.
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <div className="cfsp-panel rounded-[14px] px-4 py-4">
              <div className="cfsp-label">Dashboard view</div>
              {isSp ? (
                <div className="mt-3 rounded-[12px] border border-[var(--cfsp-border)] bg-[var(--cfsp-surface)] px-4 py-3 text-sm font-bold text-[var(--cfsp-text)]">
                  SP accounts stay focused on assigned events and upcoming trainings.
                </div>
              ) : (
                <div className="mt-3 inline-flex rounded-[12px] p-1" style={{ border: "1px solid var(--cfsp-border)", background: "var(--cfsp-surface)" }}>
                  <button
                    type="button"
                    onClick={() => handleScopeChange("my")}
                    className="min-w-[120px] rounded-[10px] px-4 py-2 text-sm font-black transition"
                    style={{
                      background: scope === "my" ? "var(--cfsp-blue)" : "transparent",
                      color: scope === "my" ? "#ffffff" : "var(--cfsp-text-muted)",
                    }}
                  >
                    My Events
                  </button>
                  <button
                    type="button"
                    onClick={() => handleScopeChange("all")}
                    className="min-w-[120px] rounded-[10px] px-4 py-2 text-sm font-black transition"
                    style={{
                      background: scope === "all" ? "var(--cfsp-blue)" : "transparent",
                      color: scope === "all" ? "#ffffff" : "var(--cfsp-text-muted)",
                    }}
                  >
                    All Events
                  </button>
                </div>
              )}
              <p className="mt-3 text-sm leading-6 text-[var(--cfsp-text-muted)]">
                {isSp
                  ? "Open an assigned event to view your materials, Zoom access, training details, and communications."
                  : isFaculty
                    ? scope === "my"
                      ? "Showing events matched to your profile, faculty ownership notes, or schedule match name."
                      : "Showing the broader event list while keeping staffing workflows operator-only."
                  : scope === "my"
                    ? "Showing events matched to your profile, schedule match name, or imported staffing notes."
                  : "Showing the full visible event list across the app."}
              </p>
              {archivedEventCount > 0 ? (
                <div className="mt-3">
                  <Link href="/events?view=archive" className="text-sm font-bold no-underline hover:underline" style={{ color: "var(--cfsp-blue)" }}>
                    View Archive ({archivedEventCount})
                  </Link>
                </div>
              ) : null}
            </div>

            {!isSp && isOperator ? (
              <Link
                href="/admin"
                className="cfsp-panel rounded-[14px] px-4 py-4 no-underline transition-transform hover:-translate-y-0.5"
              >
                <div className="cfsp-label">Quick action</div>
                <div className="mt-2 text-lg font-black text-[var(--cfsp-text)]">Open admin tools</div>
                <p className="mt-2 text-sm leading-6 text-[var(--cfsp-text-muted)]">
                  Launch imports, people tools, and other workflow shortcuts directly.
                </p>
              </Link>
            ) : isFaculty ? (
              <div className="cfsp-panel rounded-[14px] px-4 py-4">
                <div className="cfsp-label">Faculty workspace</div>
                <div className="mt-2 text-lg font-black text-[var(--cfsp-text)]">Course-facing planning and communication</div>
                <p className="mt-2 text-sm leading-6 text-[var(--cfsp-text-muted)]">
                  Faculty accounts stay focused on event context, course communication, and planning visibility without admin staffing controls.
                </p>
              </div>
            ) : (
              <div className="cfsp-panel rounded-[14px] px-4 py-4">
                <div className="cfsp-label">SP portal</div>
                <div className="mt-2 text-lg font-black text-[var(--cfsp-text)]">Assignments, trainings, and access</div>
                <p className="mt-2 text-sm leading-6 text-[var(--cfsp-text-muted)]">
                  Your event pages are filtered to show only your dates, communications, and training resources.
                </p>
              </div>
            )}

            <div className="cfsp-panel rounded-[14px] px-4 py-4">
              <div className="cfsp-label">Dashboard panels</div>
              <div className="mt-2 text-lg font-black text-[var(--cfsp-text)]">Choose what to show</div>
              <p className="mt-2 text-sm leading-6 text-[var(--cfsp-text-muted)]">
                Keep Home clean, then open the panels that matter for the moment.
              </p>
              <div className="mt-4 grid gap-2">
                <details className="rounded-[12px] border border-[var(--cfsp-border)] bg-[var(--cfsp-surface)] px-3 py-2">
                  <summary className="cursor-pointer text-sm font-black text-[var(--cfsp-text)]">Recent Events</summary>
                  <div className="mt-3">
                    <RecentEventsPanel
                      recentEvents={recentEvents}
                      eventsById={eventsById}
                      onClear={handleClearRecentEvents}
                    />
                  </div>
                </details>
                <details className="rounded-[12px] border border-[var(--cfsp-border)] bg-[var(--cfsp-surface)] px-3 py-2">
                  <summary className="cursor-pointer text-sm font-black text-[var(--cfsp-text)]">Latest SimVitals Signals</summary>
                  <div className="mt-3">
                    <SimVitalsDashboardPreview />
                    <div className="mt-3">
                      <Link href="/simvitals" className="cfsp-btn cfsp-btn-secondary">
                        Open SimVitals
                      </Link>
                    </div>
                  </div>
                </details>
                {!isSp && isOperator ? (
                  <details className="rounded-[12px] border border-[var(--cfsp-border)] bg-[var(--cfsp-surface)] px-3 py-2">
                    <summary className="cursor-pointer text-sm font-black text-[var(--cfsp-text)]">Admin Tools</summary>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link href="/admin" className="cfsp-btn cfsp-btn-secondary">Admin</Link>
                      <Link href="/staff" className="cfsp-btn cfsp-btn-secondary">Staff</Link>
                      <Link href="/settings" className="cfsp-btn cfsp-btn-secondary">Settings</Link>
                    </div>
                  </details>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <section className="relative z-10">
          <div className="mb-3">
            <div className="cfsp-kicker">Command search</div>
            <h3 className="mt-1 text-[1.35rem] font-black text-[var(--cfsp-text)]">
              Search events, SPs, schedules, materials...
            </h3>
          </div>
          <GlobalEventFinder
            items={allVisibleEvents}
            myEventIds={myEventIds}
            scope={scope}
            onOpenEvent={(eventId) => router.push(`/events/${encodeURIComponent(eventId)}`)}
          />
        </section>

        <details
          className="rounded-[14px] px-4 py-3"
          style={{
            border: "1px solid rgba(25, 138, 112, 0.14)",
            background: "linear-gradient(90deg, rgba(255,255,255,0.72), rgba(236,255,248,0.56), rgba(239,246,255,0.48))",
            boxShadow: "0 10px 28px rgba(20, 91, 150, 0.06)",
          }}
          aria-label="Dashboard telemetry summary"
        >
          <summary className="cursor-pointer text-sm font-black text-[var(--cfsp-text)]">
            Home stats and panel preferences
          </summary>
          <div className="mt-3 flex flex-wrap items-center gap-2">
          {[
            { label: isSp ? "Assigned Events" : scope === "my" ? "My Events" : "All Events", value: selectedEvents.length },
            { label: isSp ? "Confirmed / Hired" : "Needs Attention", value: isSp ? spConfirmedEvents.length : needsAttention.length },
            { label: isSp ? "Trainings" : "In Progress", value: isSp ? spTrainingEvents.length : inProgress.length },
            { label: isSp ? "Upcoming Access" : "Open SP Shortage", value: isSp ? selectedEvents.length : openShortageCount },
          ].map((stat) => (
            <div
              key={stat.label}
              className="inline-flex items-center gap-2 rounded-[10px] px-3 py-1.5 text-sm"
              style={{
                border: "1px solid rgba(20, 91, 150, 0.14)",
                background: "rgba(255,255,255,0.66)",
                color: "var(--cfsp-text-muted)",
              }}
            >
              <span className="text-[0.64rem] font-black uppercase tracking-[0.12em]">{stat.label}</span>
              <span className="text-base font-black text-[var(--cfsp-blue)]">{stat.value}</span>
            </div>
          ))}
          </div>
        </details>

        <details className="cfsp-panel rounded-[14px] px-5 py-4">
          <summary className="cursor-pointer text-sm font-black text-[var(--cfsp-text)]">
            Planning Calendar
          </summary>
        <section className="cfsp-planning-calendar-panel mt-4 rounded-[14px] px-5 py-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="cfsp-kicker cfsp-planning-calendar-kicker">Planning Calendar</div>
              <div className="cfsp-planning-calendar-title mt-2 text-[1.2rem] font-black">
                {new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
              </div>
              <div className="cfsp-planning-calendar-muted mt-1 text-sm font-semibold">
                {selectedJumpMonthLabel} · {monthEventCount} upcoming event{monthEventCount === 1 ? "" : "s"}
              </div>
            </div>

            <div className="grid gap-3 xl:min-w-[520px]">
              <div className="flex flex-wrap gap-2">
                {[
                  { key: "today", label: "Today" },
                  { key: "thisWeek", label: "This Week" },
                  { key: "nextWeek", label: "Next Week" },
                  { key: "thisMonth", label: "This Month" },
                  { key: "nextMonth", label: "Next Month" },
                ].map((button) => (
                  <button
                    key={button.key}
                    type="button"
                    onClick={() => handleQuickDateJump(button.key as "today" | "thisWeek" | "nextWeek" | "thisMonth" | "nextMonth")}
                    className="cfsp-btn cfsp-btn-secondary cfsp-planning-calendar-button"
                  >
                    {button.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <label className="grid min-w-[220px] gap-2">
                  <span className="cfsp-label cfsp-planning-calendar-label">Jump to date</span>
                  <input
                    type="date"
                    value={jumpDate}
                    onChange={(event) => handlePlanningJump(event.target.value)}
                    className="cfsp-input cfsp-planning-calendar-input"
                  />
                </label>
                <div className="cfsp-planning-calendar-muted text-sm font-semibold">
                  Jump to the first event on or after the selected date.
                </div>
              </div>
            </div>
          </div>

          {planningJumpMessage ? (
            <div className="cfsp-planning-calendar-muted mt-3 text-sm font-semibold">{planningJumpMessage}</div>
          ) : null}
        </section>
        </details>

        {error ? <div className="cfsp-alert cfsp-alert-error">{error}</div> : null}

        {!error && eventMeta.length === 0 && events.length > 0 ? (
          <div className="cfsp-alert cfsp-alert-info flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-black text-[var(--cfsp-text)]">Your events are still in CFSP.</div>
              <div className="mt-1 text-sm text-[var(--cfsp-text-muted)]">
                There are no upcoming events right now, but {archivedEventCount} imported event{archivedEventCount === 1 ? "" : "s"} are still available in the Events board.
              </div>
            </div>
            <Link href="/events" className="cfsp-btn cfsp-btn-secondary">
              Open Events Board
            </Link>
          </div>
        ) : null}

        {!error && scope === "my" && selectedEvents.length === 0 ? (
          <div className="cfsp-panel px-6 py-6">
            <h3 className="m-0 text-[1.2rem] font-black text-[var(--cfsp-text)]">No events are matched to your profile yet.</h3>
            <p className="mt-3 text-sm leading-6 text-[var(--cfsp-text-muted)]">
              CFSP is currently using <strong>{matchTerms.length ? matchTerms.join(", ") : "no schedule match name"}</strong> to match your events.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/me" className="cfsp-btn cfsp-btn-secondary">
                Edit Profile
              </Link>
              <button type="button" onClick={() => handleScopeChange("all")} className="cfsp-btn cfsp-btn-primary">
                View All Events
              </button>
            </div>
            {isAdmin ? (
              <p className="mt-4 text-sm leading-6 text-[var(--cfsp-text-muted)]">
                You have admin access, so you can switch to All Events while profile matching is being completed.
              </p>
            ) : null}
          </div>
        ) : null}

        {!error && !(scope === "my" && selectedEvents.length === 0) ? (
          <details className="cfsp-panel rounded-[14px] px-5 py-4">
            <summary className="cursor-pointer text-sm font-black text-[var(--cfsp-text)]">
              Ready / upcoming event panels
            </summary>
            <div className="mt-4 grid gap-5">
              <WorkflowSection
                sectionKey="ready"
                title="Ready"
                description="Events with full coverage already in place and ready to run."
                items={ready}
                visibleCount={sectionVisibleCounts.ready}
                onLoadMore={handleLoadMore}
                browseHref={scope === "my" ? "/events" : "/events?view=all"}
                highlightedEventId={highlightedEventId}
                registerEventRef={registerEventRef}
                emptyMessage={
                  scope === "my"
                    ? "No fully staffed matched events are ready yet."
                    : "No fully staffed upcoming events are ready yet."
                }
              />
            </div>
          </details>
        ) : null}
      </div>
    </SiteShell>
  );
}

"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import GlobalCommandSearch from "../components/GlobalCommandSearch";
import { SimVitalsDashboardPreview } from "../components/SimVitals";
import SiteShell from "../components/SiteShell";
import { isPastEvent } from "../lib/eventArchive";
import { buildFinderIndexedEvent } from "../lib/eventFinder";
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
const MAX_ROSTER_CHIPS = 12;
const DASHBOARD_SECTION_PAGE_SIZE = 8;
const RECENT_EVENTS_STORAGE_KEY = "cfsp:recent-events";
const RECENT_EVENTS_LIMIT = 8;
const DASHBOARD_PANEL_STATE_KEY = "cfsp:dashboard-panels:v1";

type DashboardPanelId = "recentEvents" | "simvitals" | "adminTools" | "planningCalendar" | "readyUpcoming" | "homeStats";

const DASHBOARD_PANEL_DEFAULT_STATE: Record<DashboardPanelId, boolean> = {
  recentEvents: false,
  simvitals: false,
  adminTools: false,
  planningCalendar: false,
  readyUpcoming: false,
  homeStats: false,
};

type EventWithMeta = {
  event: EventRecord;
  start: Date | null;
  needed: number;
  assigned: number;
  confirmed: number;
  shortage: number;
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

function DashboardPanel({
  title,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section
      className="rounded-[14px] border border-[var(--cfsp-border)] bg-[var(--cfsp-surface)] px-4 py-3"
      style={{ boxShadow: "0 10px 26px rgba(24, 52, 78, 0.06)" }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={isOpen}
      >
        <span className="text-sm font-black text-[var(--cfsp-text)]">{title}</span>
        <span
          className="rounded-full border border-[var(--cfsp-border)] px-2 py-1 text-xs font-bold"
          style={{ color: "var(--cfsp-text-muted)" }}
        >
          {isOpen ? "Hide" : "Show"}
        </span>
      </button>
      {isOpen ? <div className="mt-3 border-t border-[var(--cfsp-border)] pt-3">{children}</div> : null}
    </section>
  );
}

function getDashboardPanelState(raw: unknown) {
  if (!raw || typeof raw !== "object") return null;
  if (Array.isArray(raw)) return null;
  const next = raw as Record<string, unknown>;
  const casted: Partial<Record<DashboardPanelId, boolean>> = {};
  for (const key of Object.keys(DASHBOARD_PANEL_DEFAULT_STATE) as DashboardPanelId[]) {
    if (typeof next[key] === "boolean") casted[key] = next[key];
  }
  return casted;
}

export default function DashboardPage() {
  const router = useRouter();

  const [authState, setAuthState] = useState<AuthState>("loading");
  const [me, setMe] = useState<MeResponse | null>(null);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [assignments, setAssignments] = useState<EventsResponse["assignments"]>([]);
  const [error, setError] = useState("");
  const [scope, setScope] = useState<DashboardScope>("my");
  const [jumpDate, setJumpDate] = useState(() => toDateInputValue(new Date()));
  const [planningJumpMessage, setPlanningJumpMessage] = useState("");
  const [highlightedEventId, setHighlightedEventId] = useState<string | null>(null);
  const [pendingJumpEventId, setPendingJumpEventId] = useState<string | null>(null);
  const [recentEvents, setRecentEvents] = useState<RecentEventEntry[]>([]);
  const [panelState, setPanelState] = useState<Record<DashboardPanelId, boolean>>(() => {
    if (typeof window === "undefined") {
      return DASHBOARD_PANEL_DEFAULT_STATE;
    }

    const saved = window.localStorage.getItem(DASHBOARD_PANEL_STATE_KEY);
    if (!saved) {
      return DASHBOARD_PANEL_DEFAULT_STATE;
    }

    try {
      const parsed = JSON.parse(saved);
      const restored = getDashboardPanelState(parsed);
      if (!restored) {
        return DASHBOARD_PANEL_DEFAULT_STATE;
      }
      return {
        ...DASHBOARD_PANEL_DEFAULT_STATE,
        ...restored,
      };
    } catch {
      return DASHBOARD_PANEL_DEFAULT_STATE;
    }
  });
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

  function persistPanelState(nextState: Record<DashboardPanelId, boolean>) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(DASHBOARD_PANEL_STATE_KEY, JSON.stringify(nextState));
  }

  function togglePanel(panelId: DashboardPanelId) {
    setPanelState((current) => {
      const next = {
        ...current,
        [panelId]: !current[panelId],
      };
      persistPanelState(next);
      return next;
    });
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
        setEventsLoading(true);

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
          setEventsLoading(false);
          setError("Your dashboard session is active, but events could not be refreshed right now.");
          return;
        }

        const eventsJson = (await eventsRes.json()) as EventsResponse;

        if (!eventsRes.ok) {
          setError(eventsJson.error || "Could not load events.");
          setEvents([]);
          setEventsLoading(false);
          return;
        }

        setEvents(Array.isArray(eventsJson.events) ? eventsJson.events : []);
        setAssignments(Array.isArray(eventsJson.assignments) ? eventsJson.assignments : []);
        setEventsLoading(false);
      } catch (err) {
        if (cancelled) return;
        setEventsLoading(false);
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
  const quickActions = useMemo(
    () =>
      [
        { href: "/events", label: "Open Events Board", show: true },
        { href: "/events/new", label: "Create New Event", show: !isSp },
        { href: "/events/upload", label: "Upload", show: !isSp && isOperator },
        { href: "/schedule-builder", label: "Schedule Builder", show: !isSp && isOperator },
        { href: "/sps", label: "SP Database", show: !isSp && isOperator },
        { href: "/simvitals", label: "SimVitals", show: true },
        { href: "/settings", label: "Settings", show: true },
        { href: "/staff", label: "Staff", show: !isSp && isAdmin },
        { href: "/admin", label: "Admin", show: !isSp && isOperator },
        { href: "/me", label: isSp ? "Edit Profile" : "Edit Profile", show: true },
      ].filter((action) => action.show),
    [isAdmin, isOperator, isSp]
  );

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
  const allVisibleFinderEntries = useMemo(
    () => primaryWorkflowEvents.map((event) => buildFinderIndexedEvent(event)),
    [primaryWorkflowEvents]
  );
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
      <div className="mx-auto grid w-full max-w-6xl gap-4 px-3 py-1 md:px-0">
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

        <section className="cfsp-dashboard-launchpad">
          <div className="cfsp-dashboard-launchpad-row">
            <div className="min-w-0">
              <p className="cfsp-kicker">Home base</p>
              <h2 className="cfsp-dashboard-welcome">Welcome back, {displayName}.</h2>
            </div>
            <span className="cfsp-dashboard-role-chip">
              {isSp ? "SP Profile" : isFaculty ? "Faculty Profile" : "Operations Profile"}
            </span>
          </div>

          <p className="cfsp-dashboard-summary">
            {isSp
              ? "Start with assigned events, confirmed work, and training access."
              : isFaculty
                ? "Track course-facing events and support work from one launchpad."
                : "Find events quickly, launch actions, and keep operations moving."}
          </p>

          <div className="cfsp-dashboard-toolbar">
            {isSp ? (
              <div className="rounded-[12px] border border-[var(--cfsp-border)] bg-white px-4 py-3 text-sm font-bold text-[var(--cfsp-text)]">
                SP accounts stay focused on assigned events and upcoming trainings.
              </div>
            ) : (
              <div className="cfsp-dashboard-segmented">
                <button
                  type="button"
                  onClick={() => handleScopeChange("my")}
                  className="cfsp-dashboard-segmented-btn"
                  data-active={scope === "my" ? "true" : "false"}
                >
                  My Events <span className="cfsp-dashboard-segmented-count">{myMatchedEvents.length}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleScopeChange("all")}
                  className="cfsp-dashboard-segmented-btn"
                  data-active={scope === "all" ? "true" : "false"}
                >
                  All Events <span className="cfsp-dashboard-segmented-count">{allVisibleEvents.length}</span>
                </button>
                <Link href="/events?view=archive" className="cfsp-dashboard-archive-link">
                  Archive <span className="cfsp-dashboard-segmented-count">{archivedEventCount}</span>
                </Link>
              </div>
            )}
            <div className="cfsp-dashboard-stats-row">
              {[
                { label: "Needs Staffing", value: needsAttention.length },
                { label: "In Progress", value: inProgress.length },
                { label: "Live / Today", value: selectedEvents.filter((item) => item.start && isTodayOrTomorrow(item.start, startOfToday)).length },
                { label: "Open Shortage", value: openShortageCount },
              ].map((stat) => (
                <div key={stat.label} className="cfsp-dashboard-stat-chip">
                  <span>{stat.label}</span>
                  <strong>{stat.value}</strong>
                </div>
              ))}
            </div>
          </div>

          <GlobalCommandSearch
            entries={allVisibleFinderEntries}
            myEventIds={myEventIds}
            scope={scope}
            loading={eventsLoading}
            placeholder="Find event…"
            onOpenEvent={(eventId) => router.push(`/events/${encodeURIComponent(eventId)}`)}
          />

          <div className="cfsp-dashboard-quick-actions">
            <div className="cfsp-label">Quick actions</div>
            <div className="cfsp-dashboard-quick-grid">
              {quickActions.map((action) => (
                <Link key={action.href} href={action.href} className="cfsp-dashboard-quick-tile">
                  <span>{action.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-3">
          <div className="cfsp-label">Operational Panels</div>
          <div className="grid gap-3">
            <DashboardPanel title="Recent Events" isOpen={panelState.recentEvents} onToggle={() => togglePanel("recentEvents")}>
              <RecentEventsPanel
                recentEvents={recentEvents}
                eventsById={eventsById}
                onClear={handleClearRecentEvents}
              />
            </DashboardPanel>

            <DashboardPanel title="Latest SimVitals Signals" isOpen={panelState.simvitals} onToggle={() => togglePanel("simvitals")}>
              <div className="grid gap-3">
                <SimVitalsDashboardPreview />
                <Link href="/simvitals" className="cfsp-btn cfsp-btn-secondary" style={{ justifySelf: "flex-start" }}>
                  Open SimVitals
                </Link>
              </div>
            </DashboardPanel>

            {!isSp && isOperator ? (
              <DashboardPanel title="Admin Tools" isOpen={panelState.adminTools} onToggle={() => togglePanel("adminTools")}>
                <div className="flex flex-wrap gap-2">
                  <Link href="/admin" className="cfsp-btn cfsp-btn-secondary">Admin</Link>
                  <Link href="/staff" className="cfsp-btn cfsp-btn-secondary">Staff</Link>
                  <Link href="/settings" className="cfsp-btn cfsp-btn-secondary">Settings</Link>
                </div>
              </DashboardPanel>
            ) : null}

            <DashboardPanel title="Planning Calendar" isOpen={panelState.planningCalendar} onToggle={() => togglePanel("planningCalendar")}>
              <section className="cfsp-planning-calendar-panel rounded-[14px] px-5 py-4">
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

                {planningJumpMessage ? <div className="cfsp-planning-calendar-muted mt-3 text-sm font-semibold">{planningJumpMessage}</div> : null}
              </section>
            </DashboardPanel>

            <DashboardPanel title="Ready / upcoming event panels" isOpen={panelState.readyUpcoming} onToggle={() => togglePanel("readyUpcoming")}>
              <div className="grid gap-5">
                <WorkflowSection
                  sectionKey="needsAttention"
                  title="Needs Attention"
                  description="Events needing immediate staffing support and upcoming actions."
                  items={needsAttention}
                  visibleCount={sectionVisibleCounts.needsAttention}
                  onLoadMore={handleLoadMore}
                  browseHref={scope === "my" ? "/events" : "/events?view=all"}
                  highlightedEventId={highlightedEventId}
                  registerEventRef={registerEventRef}
                  emptyMessage={scope === "my" ? "No immediate staffing needs right now." : "No immediate staffing needs right now."}
                />
                <WorkflowSection
                  sectionKey="inProgress"
                  title="In Progress"
                  description="Events with partial coverage and open action next steps."
                  items={inProgress}
                  visibleCount={sectionVisibleCounts.inProgress}
                  onLoadMore={handleLoadMore}
                  browseHref={scope === "my" ? "/events" : "/events?view=all"}
                  highlightedEventId={highlightedEventId}
                  registerEventRef={registerEventRef}
                  emptyMessage={scope === "my" ? "No in-progress events found." : "No in-progress events found."}
                />
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
                  emptyMessage={scope === "my" ? "No fully staffed matched events are ready yet." : "No fully staffed upcoming events are ready yet."}
                />
              </div>
            </DashboardPanel>

            <DashboardPanel title="Home stats and preferences" isOpen={panelState.homeStats} onToggle={() => togglePanel("homeStats")}>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { label: isSp ? "Assigned Events" : scope === "my" ? "My Events" : "All Events", value: selectedEvents.length },
                  { label: isSp ? "Confirmed / Hired" : "Needs Attention", value: isSp ? spConfirmedEvents.length : needsAttention.length },
                  { label: isSp ? "Trainings" : "In Progress", value: isSp ? spTrainingEvents.length : inProgress.length },
                  { label: isSp ? "Upcoming Access" : "Open SP Shortage", value: isSp ? selectedEvents.length : openShortageCount },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="inline-flex items-center gap-2 rounded-[10px] px-3 py-1.5 text-sm"
                    style={{ border: "1px solid rgba(20, 91, 150, 0.14)", background: "rgba(255,255,255,0.66)", color: "var(--cfsp-text-muted)" }}
                  >
                    <span className="text-[0.64rem] font-black uppercase tracking-[0.12em]">{stat.label}</span>
                    <span className="text-base font-black text-[var(--cfsp-blue)]">{stat.value}</span>
                  </div>
                ))}
              </div>
            </DashboardPanel>
          </div>
        </section>

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
      </div>
    </SiteShell>
  );
}

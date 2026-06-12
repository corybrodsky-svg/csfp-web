"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import SiteShell from "../components/SiteShell";
import { compareByArchiveDate, isPastEvent } from "../lib/eventArchive";
import {
  getEventCoverageVisualState,
  getEventCoverageVisualToneWithBase,
} from "../lib/eventCoverageVisual";
import { formatHumanDate, getImportedYearHint } from "../lib/eventDateUtils";
import { classifyEventPresentation, getEventBadgeAppearance } from "../lib/eventClassification";
import { getBestEventTeamInfo } from "../lib/eventRoster";
import { sanitizePublicErrorMessage } from "../lib/safeErrorMessage";
import { formatDisplayTime } from "../lib/timeFormat";

type EventRow = {
  id: string;
  name: string | null;
  status: string | null;
  date_text: string | null;
  location: string | null;
  sp_needed: number | null;
  notes: string | null;
  schedule_owner_text?: string | null;
  earliest_session_date?: string | null;
  latest_session_date?: string | null;
  earliest_session_start?: string | null;
  latest_session_end?: string | null;
  assigned_sp_names?: string[] | null;
  assigned_sp_emails?: string[] | null;
  session_locations?: string[] | null;
  total_assignments?: number | null;
  confirmed_assignments?: number | null;
  backup_confirmed_assignments?: number | null;
  working_confirmed_assignments?: number | null;
  shortage?: number | null;
};

type EventsResponse = {
  events?: EventRow[];
  error?: string;
};

type EventView = "current" | "archive" | "all";
const MAX_ROSTER_CHIPS = 12;
const EVENTS_PAGE_SIZE = 25;

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function formatEventDate(event: EventRow) {
  const dateSource = event.earliest_session_date || event.date_text;
  if (!dateSource) return "Date TBD";
  return formatHumanDate(dateSource, getImportedYearHint(event.notes)) || dateSource;
}

function formatEventTime(event: EventRow) {
  if (event.earliest_session_start && event.latest_session_end) {
    return `${formatDisplayTime(event.earliest_session_start)} - ${formatDisplayTime(event.latest_session_end)}`;
  }
  if (event.earliest_session_start || event.latest_session_end) {
    return formatDisplayTime(event.earliest_session_start || event.latest_session_end);
  }
  return "Time TBD";
}

function getEventBadges(event: EventRow) {
  const needed = Number(event.sp_needed || 0);
  const assignmentCount = Number(event.total_assignments || 0);
  const confirmedCount = Number(event.confirmed_assignments || 0);
  const presentation = classifyEventPresentation({
    name: event.name,
    status: event.status,
    notes: event.notes,
    location: event.location,
    spNeeded: needed,
    assignmentCount,
    confirmedCount,
  });

  return presentation.activeBadgeKinds.map((kind) => ({
    key: kind,
    label:
      kind === "training"
        ? "Training"
        : kind === "virtual_sp"
          ? presentation.primaryBadgeKind === "virtual_sp"
            ? "Virtual SP"
            : "Virtual"
          : kind === "hifi"
            ? "HiFi"
            : kind === "skills_workshop"
              ? "Skills"
              : "SP Event",
    ...getEventBadgeAppearance(kind),
  }));
}

function getEventSearchText(event: EventRow) {
  const badges = getEventBadges(event);
  const teamInfo = getBestEventTeamInfo(event);

  return [
    event.name,
    event.status,
    event.date_text,
    formatEventDate(event),
    formatEventTime(event),
    event.location,
    ...(event.session_locations || []),
    ...badges.map((badge) => badge.label),
    teamInfo.teamText,
    ...teamInfo.teamNames,
    teamInfo.facultyText,
    ...teamInfo.facultyNames,
    ...(event.assigned_sp_names || []),
    ...(event.assigned_sp_emails || []),
  ]
    .map(asText)
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function renderRosterChips(names?: string[] | null) {
  const roster = (names || []).filter(Boolean);
  if (!roster.length) {
    return <span style={{ color: "var(--cfsp-text-muted)", fontWeight: 700 }}>No assigned SPs yet.</span>;
  }

  const visible = roster.slice(0, MAX_ROSTER_CHIPS);
  const remaining = roster.length - visible.length;

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

export default function EventsPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<EventView>("current");
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(EVENTS_PAGE_SIZE);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const requestedView = params.get("view");
    if (requestedView === "archive" || requestedView === "all" || requestedView === "current") {
      setView(requestedView);
    }
    setSearchQuery(params.get("search") || "");
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadEvents() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch("/api/events", {
          cache: "no-store",
          credentials: "include",
          headers: {
            "Cache-Control": "no-store",
            Pragma: "no-cache",
          },
        });
        const data = (await response.json().catch(() => null)) as EventsResponse | null;

        if (!response.ok) {
          throw new Error(sanitizePublicErrorMessage(data?.error, "Could not load events right now."));
        }

        if (!cancelled) {
          setEvents(data?.events || []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(sanitizePublicErrorMessage(err instanceof Error ? err.message : err, "Could not load events right now."));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadEvents();

    return () => {
      cancelled = true;
    };
  }, []);

  const primaryWorkflowEvents = events;

  const eventBuckets = useMemo(() => {
    const upcoming = primaryWorkflowEvents
      .filter((event) =>
        !isPastEvent({
          latestSessionDate: event.latest_session_date,
          earliestSessionDate: event.earliest_session_date,
          dateText: event.date_text,
          notes: event.notes,
        })
      )
      .sort((a, b) =>
        compareByArchiveDate(
          {
            latestSessionDate: a.latest_session_date,
            earliestSessionDate: a.earliest_session_date,
            dateText: a.date_text,
            notes: a.notes,
            name: a.name,
          },
          {
            latestSessionDate: b.latest_session_date,
            earliestSessionDate: b.earliest_session_date,
            dateText: b.date_text,
            notes: b.notes,
            name: b.name,
          },
          "asc"
        )
      );

    const archive = primaryWorkflowEvents
      .filter((event) =>
        isPastEvent({
          latestSessionDate: event.latest_session_date,
          earliestSessionDate: event.earliest_session_date,
          dateText: event.date_text,
          notes: event.notes,
        })
      )
      .sort((a, b) =>
        compareByArchiveDate(
          {
            latestSessionDate: a.latest_session_date,
            earliestSessionDate: a.earliest_session_date,
            dateText: a.date_text,
            notes: a.notes,
            name: a.name,
          },
          {
            latestSessionDate: b.latest_session_date,
            earliestSessionDate: b.earliest_session_date,
            dateText: b.date_text,
            notes: b.notes,
            name: b.name,
          },
          "desc"
        )
      );

    return {
      upcoming,
      archive,
      all: [...upcoming, ...archive],
    };
  }, [primaryWorkflowEvents]);

  const filteredEvents = useMemo(() => {
    if (view === "archive") return eventBuckets.archive;
    if (view === "all") return eventBuckets.all;
    return eventBuckets.upcoming;
  }, [eventBuckets, view]);

  const searchedEvents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return filteredEvents;
    return filteredEvents.filter((event) => getEventSearchText(event).includes(query));
  }, [filteredEvents, searchQuery]);

  const visibleEvents = useMemo(
    () => searchedEvents.slice(0, visibleCount),
    [searchedEvents, visibleCount]
  );

  useEffect(() => {
    setVisibleCount(EVENTS_PAGE_SIZE);
  }, [view, searchQuery]);

  const totals = useMemo(() => {
    return searchedEvents.reduce(
      (sum, event) => {
        sum.needed += Number(event.sp_needed || 0);
        sum.assigned += Number(event.total_assignments || 0);
        const primaryConfirmed = Number(event.confirmed_assignments || 0);
        const backupConfirmed = Number(event.backup_confirmed_assignments || 0);
        const totalConfirmed = Number(
          event.working_confirmed_assignments !== undefined && event.working_confirmed_assignments !== null
            ? event.working_confirmed_assignments
            : primaryConfirmed + backupConfirmed
        );
        sum.confirmed += primaryConfirmed;
        sum.backupConfirmed += backupConfirmed;
        sum.totalConfirmed += totalConfirmed;
        sum.shortage += Number(event.shortage || 0);
        return sum;
      },
      { needed: 0, assigned: 0, confirmed: 0, backupConfirmed: 0, totalConfirmed: 0, shortage: 0 }
    );
  }, [searchedEvents]);

  return (
    <SiteShell
      title="Events"
      subtitle="Review the event board, coverage, and command center access."
    >
      <main style={{ padding: 24, display: "grid", gap: 24 }}>
        <section
          style={{
            border: "1px solid var(--cfsp-border)",
            borderRadius: 18,
            padding: 20,
            background: "linear-gradient(180deg, var(--cfsp-surface-muted) 0%, var(--cfsp-surface) 100%)",
            boxShadow: "var(--cfsp-card-glow)",
          }}
        >
          <h1 style={{ margin: 0, fontSize: 32, color: "var(--cfsp-text)" }}>Events Board</h1>
          <p style={{ margin: "10px 0 0", color: "var(--cfsp-text-muted)", maxWidth: 780 }}>
            Open any event to jump straight into its command center. Dashboard is the main browsing home, and this board remains the broad operational overview.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 16 }}>
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search the events board by name, course, date, room, team, faculty, or SP..."
              style={{
                flex: "1 1 420px",
                minWidth: 260,
                border: "1px solid var(--cfsp-border-strong)",
                borderRadius: 14,
                padding: "12px 14px",
                background: "var(--cfsp-surface)",
                color: "var(--cfsp-text)",
                fontWeight: 700,
              }}
            />
            {searchQuery.trim() ? (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                style={{
                  border: "1px solid var(--cfsp-button-secondary-border)",
                  borderRadius: 14,
                  padding: "12px 14px",
                  background: "var(--cfsp-button-secondary-bg)",
                  color: "var(--cfsp-button-secondary-text)",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Clear
              </button>
            ) : null}
          </div>
          <div style={{ marginTop: 10, color: "var(--cfsp-text-muted)", fontWeight: 700 }}>
            Showing {Math.min(visibleEvents.length, searchedEvents.length)} of {searchedEvents.length} events
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
              marginTop: 18,
            }}
          >
              <SummaryCard label="All Events" value={String(eventBuckets.all.length)} />
              <SummaryCard label="Upcoming" value={String(eventBuckets.upcoming.length)} />
              <SummaryCard label="Archive" value={String(eventBuckets.archive.length)} />
              <SummaryCard label="Showing" value={String(visibleEvents.length)} />
              <SummaryCard label="SP Needed" value={String(totals.needed)} />
              <SummaryCard label="Primary confirmed" value={String(totals.confirmed)} />
              <SummaryCard label="Backup confirmed" value={String(totals.backupConfirmed)} />
              <SummaryCard label="Total confirmed" value={String(totals.totalConfirmed)} />
              <SummaryCard label="Assigned" value={String(totals.assigned)} />
              <SummaryCard label="Shortage" value={String(totals.shortage)} tone={totals.shortage > 0 ? "warning" : "default"} />
            </div>
        </section>

        <section
          style={{
            border: "1px solid var(--cfsp-border)",
            borderRadius: 16,
            padding: 18,
            background: "var(--cfsp-surface)",
            boxShadow: "var(--cfsp-card-glow)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <h2 style={{ margin: 0 }}>Events</h2>
              <p style={{ margin: "6px 0 0", color: "var(--cfsp-text-muted)" }}>
                {view === "archive"
                  ? "Past events are shown newest first."
                  : view === "all"
                  ? "Showing every event returned by Supabase, including past, current, future, and unknown-date events."
                  : "Showing current, upcoming, and unknown-date events only."}
              </p>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div
                style={{
                  display: "inline-flex",
                  borderRadius: 999,
                  border: "1px solid var(--cfsp-border)",
                  padding: 4,
                  background: "var(--cfsp-surface-muted)",
                }}
              >
                {[
                  { key: "current", label: `Upcoming / Current (${eventBuckets.upcoming.length})` },
                  { key: "archive", label: `Archive / Past Events (${eventBuckets.archive.length})` },
                  { key: "all", label: `All Events (${eventBuckets.all.length})` },
                ].map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setView(option.key as EventView)}
                    style={{
                      border: "none",
                      borderRadius: 999,
                      padding: "8px 12px",
                      background: view === option.key ? "var(--cfsp-blue)" : "transparent",
                      color: view === option.key ? "#ffffff" : "var(--cfsp-text-muted)",
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <Link
                href="/events/new"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  textDecoration: "none",
                  borderRadius: 999,
                  padding: "10px 14px",
                  background: "var(--cfsp-blue)",
                  color: "#ffffff",
                  fontWeight: 800,
                }}
              >
                New Event
              </Link>
            </div>
          </div>

          {loading ? <p>Loading events...</p> : null}
          {error ? <p style={{ color: "var(--cfsp-danger)" }}>{error}</p> : null}
          {!loading && !error && searchedEvents.length === 0 ? (
            <p style={{ color: "var(--cfsp-text-muted)", fontWeight: 700 }}>
              {searchQuery.trim()
                ? "No events match this search in the current view."
                : view === "archive"
                ? "No archived events found."
                : view === "all"
                ? "No events were returned. Check imports or Supabase data."
                : "No upcoming events found. View All Events or Archive."}
            </p>
          ) : null}

          <div style={{ display: "grid", gap: 14, marginTop: 16 }}>
                {visibleEvents.map((event) => {
                  const presentation = classifyEventPresentation({
                    name: event.name,
                    status: event.status,
                    notes: event.notes,
                    location: event.location,
                    spNeeded: Number(event.sp_needed || 0),
                    assignmentCount: Number(event.total_assignments || 0),
                    confirmedCount: Number(event.confirmed_assignments || 0),
                  });
                  const badges = getEventBadges(event);
                  const needed = Number(event.sp_needed || 0);
                  const assigned = Number(event.total_assignments || 0);
                  const primaryConfirmed = Number(event.confirmed_assignments || 0);
                  const backupConfirmed = Number(event.backup_confirmed_assignments || 0);
                  const totalConfirmed = Number(
                    event.working_confirmed_assignments !== undefined && event.working_confirmed_assignments !== null
                      ? event.working_confirmed_assignments
                      : primaryConfirmed + backupConfirmed
                  );
                  const shortage = Math.max(Number(event.shortage || 0), 0);
                  const teamInfo = getBestEventTeamInfo(event);
                  const archived = isPastEvent({
                    latestSessionDate: event.latest_session_date,
                    earliestSessionDate: event.earliest_session_date,
                dateText: event.date_text,
                notes: event.notes,
              });
              const visualState = getEventCoverageVisualState({
                needed,
                assigned,
                confirmed: primaryConfirmed,
                archived,
              });
                  const tone = getEventCoverageVisualToneWithBase(
                    visualState,
                    presentation.primaryBadgeKind === "skills_workshop" ? "skills" : "default"
                  );

              return (
                <Link
                  key={event.id}
                  href={`/events/${event.id}`}
                  style={{
                    display: "block",
                    textDecoration: "none",
                    color: "inherit",
                    border: `1px solid ${tone.cardBorder}`,
                    borderRadius: 16,
                    padding: 16,
                    background: tone.cardBackground,
                    boxShadow: tone.cardShadow,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ display: "grid", gap: 8 }}>
                      <strong style={{ fontSize: 20, color: tone.titleText }}>{event.name || "Untitled Event"}</strong>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {badges.map((badge) => (
                          <span
                            key={`${event.id}-${badge.key}`}
                            style={{
                              borderRadius: 999,
                              padding: "6px 10px",
                              background: badge.background,
                              border: `1px solid ${badge.border}`,
                              color: badge.color,
                              fontWeight: 900,
                              fontSize: 12,
                            }}
                          >
                            {badge.label}
                          </span>
                        ))}
                        <span
                          style={{
                            borderRadius: 999,
                            padding: "6px 10px",
                            background: tone.pillBackground,
                            border: `1px solid ${tone.pillBorder}`,
                            color: tone.pillText,
                            fontWeight: 800,
                            fontSize: 12,
                          }}
                        >
                          {shortage > 0 && assigned > 0
                            ? `${event.status || "No status"} · ${tone.label}`
                            : event.status || tone.label}
                        </span>
                      </div>
                    </div>
                    <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 700, textAlign: "right" }}>
                      <div>{formatEventDate(event)}</div>
                      <div style={{ marginTop: 4 }}>{formatEventTime(event)}</div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                      gap: 10,
                      marginTop: 14,
                    }}
                  >
                    <MetricBlock label="Location" value={event.location || "Location TBD"} />
                    <MetricBlock
                      label={teamInfo.teamLabel}
                      value={teamInfo.teamNames.join(", ") || "Team not assigned"}
                      valueColor={teamInfo.teamNames.length ? "var(--cfsp-blue)" : "var(--cfsp-warning)"}
                    />
                    <MetricBlock
                      label={teamInfo.facultyLabel}
                      value={teamInfo.facultyNames.join(", ") || "Faculty not assigned"}
                      valueColor={teamInfo.facultyNames.length ? "var(--cfsp-text)" : "var(--cfsp-text-muted)"}
                    />
                      <MetricBlock label="SP Needed" value={String(needed)} />
                      <MetricBlock label="Assigned" value={String(assigned)} />
                      <MetricBlock label="Primary confirmed" value={String(primaryConfirmed)} />
                      <MetricBlock label="Backup confirmed" value={String(backupConfirmed)} />
                      <MetricBlock label="Total confirmed" value={String(totalConfirmed)} />
                      <MetricBlock
                        label="Shortage"
                        value={String(shortage)}
                        valueColor={shortage > 0 ? "var(--cfsp-warning)" : "var(--cfsp-green)"}
                    />
                  </div>
                  <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", color: "var(--cfsp-text-muted)" }}>
                      Assigned SPs
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {renderRosterChips(event.assigned_sp_names)}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
          {searchedEvents.length > visibleEvents.length ? (
            <div style={{ display: "flex", justifyContent: "center", marginTop: 18 }}>
              <button
                type="button"
                onClick={() => setVisibleCount((current) => current + EVENTS_PAGE_SIZE)}
                style={{
                  border: "1px solid var(--cfsp-button-secondary-border)",
                  borderRadius: 999,
                  padding: "12px 18px",
                  background: "var(--cfsp-button-secondary-bg)",
                  color: "var(--cfsp-button-secondary-text)",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Load More
              </button>
            </div>
          ) : null}
        </section>
      </main>
    </SiteShell>
  );
}

function SummaryCard(props: { label: string; value: string; tone?: "default" | "warning" }) {
  const warning = props.tone === "warning";

  return (
    <div
      style={{
        border: "1px solid var(--cfsp-border)",
        borderRadius: 14,
        padding: 14,
        background: warning ? "var(--cfsp-warning-soft)" : "var(--cfsp-surface-muted)",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", color: "var(--cfsp-text-muted)" }}>{props.label}</div>
      <div style={{ marginTop: 6, fontSize: 22, fontWeight: 900, color: warning ? "var(--cfsp-warning)" : "var(--cfsp-text)" }}>{props.value}</div>
    </div>
  );
}

function MetricBlock(props: { label: string; value: string; valueColor?: string }) {
  return (
    <div
      style={{
        border: "1px solid var(--cfsp-border)",
        borderRadius: 12,
        padding: 12,
        background: "var(--cfsp-surface)",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", color: "var(--cfsp-text-muted)" }}>{props.label}</div>
      <div style={{ marginTop: 6, fontWeight: 900, color: props.valueColor || "var(--cfsp-text)" }}>{props.value}</div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import SiteShell from "../components/SiteShell";
import { formatHumanDate, getDateSortValue, getImportedYearHint } from "../lib/eventDateUtils";
import { classifyEventPresentation, getEventBadgeAppearance } from "../lib/eventClassification";
import { eventMatchesOwnership } from "../lib/eventOwnership";
import { getEventTeamInfo } from "../lib/eventRoster";

type EventRow = {
  id: string;
  name: string | null;
  status: string | null;
  date_text: string | null;
  location: string | null;
  sp_needed: number | null;
  created_at: string | null;
  notes: string | null;
  earliest_session_date: string | null;
  assigned_sp_names: string[] | null;
  total_assignments: number | null;
  confirmed_assignments: number | null;
  shortage: number | null;
};

type MeResponse = {
  user?: {
    id: string;
    email?: string | null;
  };
  profile?: {
    full_name: string | null;
    schedule_name?: string | null;
    email: string | null;
    role: string | null;
    is_active: boolean | null;
  } | null;
  error?: string;
};

type EventsViewMode = "all" | "assigned";
type DateFilterMode = "active" | "past" | "all";

type EventWithMeta = {
  event: EventRow;
  eventDateValue: number;
  needed: number;
  assigned: number;
  confirmed: number;
  shortage: number;
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseEventDateValue(event: EventRow): number {
  const fallbackYear = getImportedYearHint(event.notes);
  return getDateSortValue(event.earliest_session_date || event.date_text || event.created_at, fallbackYear);
}

function sortEventsByDateThenName(a: EventRow, b: EventRow) {
  const aDate = parseEventDateValue(a);
  const bDate = parseEventDateValue(b);

  if (aDate !== bDate) return aDate - bDate;
  return asText(a.name).localeCompare(asText(b.name));
}

function getDisplayDate(event: EventRow) {
  return event.earliest_session_date
    ? formatHumanDate(event.earliest_session_date, getImportedYearHint(event.notes))
    : formatHumanDate(event.date_text, getImportedYearHint(event.notes));
}

function estimateSessionCount(event: EventRow) {
  const raw = asText(event.date_text);
  if (!raw) return event.earliest_session_date ? 1 : null;

  const parts = raw
    .split(/\n|,|;/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length > 1) return parts.length;
  return event.earliest_session_date || raw ? 1 : null;
}

function getStatusTone(status: string) {
  const normalized = status.toLowerCase();

  if (normalized.includes("complete")) {
    return { background: "#eaf7f2", border: "#bfe4d6", color: "#196b57" };
  }
  if (normalized.includes("progress")) {
    return { background: "#edf5fb", border: "#c7dcee", color: "#165a96" };
  }
  if (normalized.includes("scheduled")) {
    return { background: "#f4f7fb", border: "#d6e0e8", color: "#4f677d" };
  }
  return { background: "#fff6e9", border: "#f1d1a7", color: "#9f630e" };
}

function getStartOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function getStartOfDayFromValue(timestamp: number) {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function isTodayOrTomorrow(timestamp: number, startOfToday: number) {
  if (!Number.isFinite(timestamp) || timestamp === Number.MAX_SAFE_INTEGER) return false;
  const dayStart = getStartOfDayFromValue(timestamp);
  return dayStart === startOfToday || dayStart === startOfToday + 24 * 60 * 60 * 1000;
}

function matchesDateFilter(event: EventRow, filterMode: DateFilterMode, startOfToday: number) {
  if (filterMode === "all") return true;

  const eventDate = parseEventDateValue(event);
  if (!Number.isFinite(eventDate) || eventDate === Number.MAX_SAFE_INTEGER) {
    return filterMode === "active";
  }

  if (filterMode === "past") return eventDate < startOfToday;
  return eventDate >= startOfToday;
}

function getToggleButtonClass(active: boolean) {
  return `cfsp-btn ${active ? "cfsp-btn-primary" : "cfsp-btn-secondary"}`;
}

function getWorkflowTone(kind: "shortage" | "partial" | "full") {
  if (kind === "shortage") {
    return { background: "#fff2f1", border: "#efc4c0", color: "#af2f26", label: "Shortage" };
  }
  if (kind === "partial") {
    return { background: "#fff6e8", border: "#f1d1a7", color: "#a86411", label: "Partial" };
  }
  return { background: "#eaf7f2", border: "#bfe4d6", color: "#196b57", label: "Full" };
}

function getWorkflowToneForEvent(item: EventWithMeta) {
  if (item.shortage > 0 && item.assigned === 0) return getWorkflowTone("shortage");
  if (item.shortage > 0) return getWorkflowTone("partial");
  return getWorkflowTone("full");
}

function EventWorkflowSection({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: EventWithMeta[];
}) {
  return (
    <section className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="m-0 text-[1.2rem] font-black text-[#14304f]">{title}</h3>
          <p className="mt-1 mb-0 text-sm leading-6 text-[#5e7388]">{description}</p>
        </div>
        <div className="text-sm font-semibold text-[#5e7388]">
          {items.length} event{items.length === 1 ? "" : "s"}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="cfsp-alert cfsp-alert-info">No events in this section right now.</div>
      ) : (
        <div className="grid gap-3">
          {items.map((item) => {
            const event = item.event;
            const eventMeta = classifyEventPresentation({
              name: event.name,
              status: event.status,
              notes: event.notes,
              location: event.location,
              spNeeded: event.sp_needed,
              assignmentCount: item.assigned,
              confirmedCount: item.confirmed,
            });
            const badgeAppearance = getEventBadgeAppearance(eventMeta.primaryBadgeKind);
            const statusTone = getStatusTone(asText(event.status) || "needs sps");
            const workflowTone = getWorkflowToneForEvent(item);
            const assignedPreview = (event.assigned_sp_names || []).filter(Boolean).slice(0, 5);
            const sessionCount = estimateSessionCount(event);
            const teamInfo = getEventTeamInfo(event.notes);
            const teamLabel = teamInfo.names.length
              ? `${teamInfo.label || "Team"}: ${teamInfo.names.join(", ")}`
              : "No sim staff listed";

            return (
              <article
                key={event.id}
                className="rounded-[14px] border border-[#d9e4ec] bg-white px-5 py-5 shadow-[0_8px_22px_rgba(20,48,79,0.05)]"
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="mb-3 flex flex-wrap gap-2">
                      <span className="cfsp-badge" style={statusTone}>
                        {event.status || "No status"}
                      </span>
                      <span className="cfsp-badge" style={badgeAppearance}>
                        {eventMeta.primaryBadgeLabel}
                      </span>
                      <span className="cfsp-badge" style={workflowTone}>
                        {workflowTone.label}
                      </span>
                    </div>

                    <h3 className="m-0 text-[1.45rem] leading-tight font-black text-[#14304f]">
                      {event.name || "Untitled Event"}
                    </h3>

                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold text-[#5e7388]">
                      <span>{getDisplayDate(event) || "Date TBD"}</span>
                      <span>{event.location || "Location TBD"}</span>
                      <span>
                        {sessionCount === null
                          ? "Session count unavailable"
                          : `${sessionCount} session${sessionCount === 1 ? "" : "s"}`}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Link href={`/events/${event.id}#coverage-actions`} className="cfsp-btn cfsp-btn-primary">
                      Quick Assign
                    </Link>
                    <Link href={`/events/${event.id}`} className="cfsp-btn cfsp-btn-secondary">
                      Open Event
                    </Link>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-4">
                  <div className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
                    <div className="cfsp-label">Coverage</div>
                    <div className="mt-2 text-xl font-black text-[#14304f]">
                      {item.confirmed} / {item.needed}
                    </div>
                  </div>
                  <div className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
                    <div className="cfsp-label">Event Type</div>
                    <div className="mt-2 text-base font-black text-[#14304f]">{eventMeta.primaryBadgeLabel}</div>
                  </div>
                  <div className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
                    <div className="cfsp-label">Location</div>
                    <div className="mt-2 text-base font-black text-[#14304f]">{event.location || "TBD"}</div>
                  </div>
                  <div className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
                    <div className="cfsp-label">Team / Staff</div>
                    <div className={`mt-2 text-sm font-bold ${teamInfo.names.length ? "text-[#14304f]" : "text-[#af2f26]"}`}>
                      {teamLabel}
                    </div>
                    {process.env.NODE_ENV !== "production" && !teamInfo.names.length ? (
                      <div className="mt-2 text-xs font-semibold text-[#6a7e91]">
                        Notes checked: {event.notes ? "yes" : "no"} · Ownership labels found: none
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-5 grid gap-2">
                  <div className="cfsp-label">Assigned SPs</div>
                  <div className="flex flex-wrap gap-2">
                    {assignedPreview.length ? (
                      assignedPreview.map((name) => (
                        <span key={`${event.id}-${name}`} className="cfsp-chip">
                          {name}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm font-semibold text-[#6a7e91]">No assigned SPs yet</span>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function EventsPage() {
  const router = useRouter();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [viewMode, setViewMode] = useState<EventsViewMode>("all");
  const [dateFilterMode, setDateFilterMode] = useState<DateFilterMode>("active");

  const redirectToLogin = useCallback(() => {
    router.replace("/login");
    router.refresh();
  }, [router]);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      setLoading(true);

      try {
        const [meResponse, eventsResponse] = await Promise.all([
          fetch("/api/me", { cache: "no-store" }),
          fetch("/api/events", { cache: "no-store" }),
        ]);

        const meBody = (await meResponse.json().catch(() => null)) as MeResponse | null;
        const eventsBody = await eventsResponse.json().catch(() => null);

        if (cancelled) return;

        if (meResponse.status === 401 || eventsResponse.status === 401) {
          redirectToLogin();
          return;
        }

        if (!meResponse.ok) {
          console.error("Failed to load /api/me", meResponse.status);
          return;
        }

        if (!eventsResponse.ok) {
          console.error("Failed to load /api/events", eventsResponse.status);
          return;
        }

        const eventRows = Array.isArray(eventsBody?.events) ? (eventsBody.events as EventRow[]) : [];
        setMe(meBody);
        setEvents([...(eventRows || [])].sort(sortEventsByDateThenName));
        setErrorMessage("");
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : "Could not load events.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void refresh();
    window.addEventListener("focus", refresh);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", refresh);
    };
  }, [redirectToLogin]);

  const isSuperAdmin = asText(me?.profile?.role) === "super_admin";
  const currentUserId = asText(me?.user?.id);
  const profileName = asText(me?.profile?.full_name);
  const userEmail = asText(me?.user?.email);
  const ownershipMatchName = asText(me?.profile?.schedule_name) || profileName || userEmail;
  const assignedEvents = useMemo(
    () => events.filter((event) => eventMatchesOwnership(event, currentUserId, ownershipMatchName)),
    [currentUserId, events, ownershipMatchName]
  );
  const activeViewMode: EventsViewMode = isSuperAdmin ? viewMode : "assigned";
  const scopedEvents = useMemo(
    () => (activeViewMode === "all" ? events : assignedEvents),
    [activeViewMode, assignedEvents, events]
  );
  const startOfToday = useMemo(() => getStartOfToday(), []);
  const visibleEvents = useMemo(
    () => scopedEvents.filter((event) => matchesDateFilter(event, dateFilterMode, startOfToday)),
    [dateFilterMode, scopedEvents, startOfToday]
  );

  const workflowEvents = useMemo<EventWithMeta[]>(
    () =>
      visibleEvents
        .map((event) => {
          const needed = Number(event.sp_needed || 0);
          const assigned = Number(event.total_assignments || 0);
          const confirmed = Number(event.confirmed_assignments || 0);
          return {
            event,
            eventDateValue: parseEventDateValue(event),
            needed,
            assigned,
            confirmed,
            shortage: Math.max(needed - confirmed, 0),
          };
        })
        .sort((a, b) => a.eventDateValue - b.eventDateValue || asText(a.event.name).localeCompare(asText(b.event.name))),
    [visibleEvents]
  );

  const needsStaff = useMemo(
    () =>
      workflowEvents.filter(
        (item) => item.shortage > 0 && (item.assigned === 0 || isTodayOrTomorrow(item.eventDateValue, startOfToday))
      ),
    [startOfToday, workflowEvents]
  );

  const inProgress = useMemo(
    () =>
      workflowEvents.filter(
        (item) =>
          item.shortage > 0 &&
          item.assigned > 0 &&
          !(item.assigned === 0 || isTodayOrTomorrow(item.eventDateValue, startOfToday))
      ),
    [startOfToday, workflowEvents]
  );

  const ready = useMemo(
    () => workflowEvents.filter((item) => item.needed <= 0 || item.confirmed >= item.needed),
    [workflowEvents]
  );

  const totalConfirmed = visibleEvents.reduce((sum, event) => sum + Number(event.confirmed_assignments || 0), 0);
  const totalNeeded = visibleEvents.reduce((sum, event) => sum + Number(event.sp_needed || 0), 0);
  const totalShortage = visibleEvents.reduce((sum, event) => sum + Number(event.shortage || 0), 0);

  return (
    <SiteShell
      title="Events"
      subtitle="Review live simulation events, staffing coverage, and operational priorities in one compact board."
    >
      <div className="grid gap-5">
        {errorMessage ? <div className="cfsp-alert cfsp-alert-error">Events error: {errorMessage}</div> : null}

        <section className="cfsp-panel-muted rounded-[12px] border border-[#dce6ee] px-5 py-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 flex-1">
              <p className="cfsp-kicker">{isSuperAdmin ? "Super Admin View" : "Events Board"}</p>
              <h2 className="mt-3 text-[1.8rem] leading-tight font-black text-[#14304f]">
                {loading ? "Loading events..." : `${visibleEvents.length} operational events`}
              </h2>
              <p className="mt-2 max-w-3xl text-[0.98rem] leading-6 text-[#5e7388]">
                Keep upcoming work front and center, review coverage, and jump straight into staffing actions.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link href="/events/new" className="cfsp-btn cfsp-btn-primary">
                Create Event
              </Link>
              <Link href="/events/upload" className="cfsp-btn cfsp-btn-secondary">
                Import Events
              </Link>
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
            <div className="rounded-[12px] border border-[#d9e4ec] bg-white px-4 py-4">
              <div className="cfsp-label">Scope</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {isSuperAdmin ? (
                  <>
                    <button type="button" onClick={() => setViewMode("all")} className={getToggleButtonClass(activeViewMode === "all")}>
                      All Events
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode("assigned")}
                      className={getToggleButtonClass(activeViewMode === "assigned")}
                    >
                      My Assigned Events
                    </button>
                  </>
                ) : (
                  <span className="cfsp-chip">My Assigned Events</span>
                )}
              </div>
            </div>

            <div className="rounded-[12px] border border-[#d9e4ec] bg-white px-4 py-4">
              <div className="cfsp-label">Date Range</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  { value: "active" as DateFilterMode, label: "Upcoming + Current" },
                  { value: "past" as DateFilterMode, label: "Past Events" },
                  { value: "all" as DateFilterMode, label: "All Events" },
                ].map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => setDateFilterMode(filter.value)}
                    className={getToggleButtonClass(dateFilterMode === filter.value)}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="cfsp-grid-stats">
          <div className="cfsp-stat-card">
            <div className="cfsp-label">Needs Staff</div>
            <div className="cfsp-stat-value">{needsStaff.length}</div>
          </div>
          <div className="cfsp-stat-card">
            <div className="cfsp-label">In Progress</div>
            <div className="cfsp-stat-value">{inProgress.length}</div>
          </div>
          <div className="cfsp-stat-card">
            <div className="cfsp-label">Ready</div>
            <div className="cfsp-stat-value">{ready.length}</div>
          </div>
          <div className="cfsp-stat-card">
            <div className="cfsp-label">Confirmed SPs</div>
            <div className="cfsp-stat-value">{totalConfirmed}</div>
          </div>
          <div className="cfsp-stat-card">
            <div className="cfsp-label">SPs Needed</div>
            <div className="cfsp-stat-value">{totalNeeded}</div>
          </div>
          <div className="cfsp-stat-card">
            <div className="cfsp-label">Open Shortage</div>
            <div className="cfsp-stat-value">{totalShortage}</div>
          </div>
        </section>

        {loading ? (
          <div className="cfsp-alert cfsp-alert-info">Loading events from Supabase...</div>
        ) : visibleEvents.length === 0 ? (
          <div className="cfsp-alert cfsp-alert-info">
            <h3 className="m-0 text-lg font-black text-[#14304f]">
              {dateFilterMode === "past"
                ? "No past events found"
                : activeViewMode === "all"
                  ? "No current or upcoming events"
                  : "No current or upcoming assigned events"}
            </h3>
            <p className="mt-2 mb-0 text-sm leading-6 text-[#5e7388]">
              {dateFilterMode === "past"
                ? "Past imported events will appear here when you switch into the archive-style view."
                : dateFilterMode === "all"
                  ? "Imported or manually created events will appear here once they exist. Use the import page or create a new event to begin building the schedule."
                  : "Switch to Past Events or All Events if you need to review older imported schedules."}
            </p>
          </div>
        ) : (
          <div className="grid gap-5">
            <EventWorkflowSection
              title="Needs Staff"
              description="Priority events that are short on confirmed coverage, especially with no assignments or approaching soon."
              items={needsStaff}
            />
            <EventWorkflowSection
              title="In Progress"
              description="Events that have some staffing movement but still need more coverage."
              items={inProgress}
            />
            <EventWorkflowSection
              title="Ready"
              description="Events that are fully covered or do not currently require SP staffing."
              items={ready}
            />
          </div>
        )}
      </div>
    </SiteShell>
  );
}

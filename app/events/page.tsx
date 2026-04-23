"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import SiteShell from "../components/SiteShell";
import { formatHumanDate, getDateSortValue, getImportedYearHint } from "../lib/eventDateUtils";
import { classifyEventPresentation, getEventBadgeAppearance } from "../lib/eventClassification";
import { eventMatchesOwnership } from "../lib/eventOwnership";

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

type DateGroup = {
  key: string;
  label: string;
  sortValue: number;
  events: EventRow[];
};

type EventsViewMode = "all" | "assigned";
type DateFilterMode = "active" | "past" | "all";

const shellCardStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #dbe4ee",
  borderRadius: "24px",
  padding: "20px",
  boxShadow: "0 12px 30px rgba(15, 23, 42, 0.06)",
};

const statCardStyle: React.CSSProperties = {
  border: "1px solid #dbe4ee",
  borderRadius: "18px",
  padding: "14px 16px",
  background: "#f8fbff",
};

const statLabelStyle: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 800,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const statValueStyle: React.CSSProperties = {
  marginTop: "8px",
  fontSize: "22px",
  fontWeight: 900,
  color: "#173b6c",
};

const groupHeaderStyle: React.CSSProperties = {
  position: "sticky",
  top: "12px",
  zIndex: 1,
  display: "inline-flex",
  alignItems: "center",
  borderRadius: "999px",
  padding: "8px 14px",
  background: "rgba(23, 59, 108, 0.92)",
  color: "#ffffff",
  fontWeight: 900,
  fontSize: "14px",
  letterSpacing: "0.02em",
  boxShadow: "0 10px 24px rgba(15, 23, 42, 0.18)",
};

const eventCardStyle: React.CSSProperties = {
  display: "grid",
  gap: "16px",
  border: "1px solid #dbe4ee",
  borderRadius: "24px",
  padding: "20px",
  background: "linear-gradient(180deg, #ffffff 0%, #fbfdff 100%)",
  boxShadow: "0 14px 32px rgba(15, 23, 42, 0.08)",
  textDecoration: "none",
};

const pillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  borderRadius: "999px",
  padding: "7px 11px",
  fontSize: "12px",
  fontWeight: 800,
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

function toDateKey(sortValue: number) {
  if (!Number.isFinite(sortValue) || sortValue <= 0 || sortValue === Number.MAX_SAFE_INTEGER) {
    return "unscheduled";
  }
  const date = new Date(sortValue);
  if (Number.isNaN(date.getTime())) return "unscheduled";
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatDateHeader(sortValue: number) {
  if (!Number.isFinite(sortValue) || sortValue <= 0 || sortValue === Number.MAX_SAFE_INTEGER) {
    return "Unscheduled";
  }
  const date = new Date(sortValue);
  if (Number.isNaN(date.getTime())) return "Unscheduled";
  return date.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    weekday: "long",
  });
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
    return { background: "#ecfdf3", border: "#86efac", color: "#166534" };
  }
  if (normalized.includes("progress")) {
    return { background: "#eff6ff", border: "#93c5fd", color: "#1d4ed8" };
  }
  if (normalized.includes("scheduled")) {
    return { background: "#f5f3ff", border: "#c4b5fd", color: "#6d28d9" };
  }
  return { background: "#fff7ed", border: "#fdba74", color: "#9a3412" };
}

function getStartOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
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

async function parseApiError(response: Response) {
  try {
    const body = await response.json();
    return asText(body?.error) || `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
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
  console.error("Events page load failed", error);
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
  const viewingLabel = activeViewMode === "all" ? "Viewing: All Events" : "Viewing: My Assigned Events";
  const dateFilterLabel =
    dateFilterMode === "active"
      ? "Showing: Upcoming + Current"
      : dateFilterMode === "past"
        ? "Showing: Past Events"
        : "Showing: All Events";

  const groupedEvents = useMemo<DateGroup[]>(() => {
    const groups = new Map<string, DateGroup>();

    visibleEvents.forEach((event) => {
      const sortValue = parseEventDateValue(event);
      const key = toDateKey(sortValue);
      const existing = groups.get(key);

      if (existing) {
        existing.events.push(event);
        return;
      }

      groups.set(key, {
        key,
        label: formatDateHeader(sortValue),
        sortValue: key === "unscheduled" ? Number.MAX_SAFE_INTEGER : sortValue,
        events: [event],
      });
    });

    return [...groups.values()]
      .sort((a, b) => a.sortValue - b.sortValue || a.label.localeCompare(b.label))
      .map((group) => ({
        ...group,
        events: [...group.events].sort(sortEventsByDateThenName),
      }));
  }, [visibleEvents]);

  const totalConfirmed = visibleEvents.reduce((sum, event) => sum + Number(event.confirmed_assignments || 0), 0);
  const totalNeeded = visibleEvents.reduce((sum, event) => sum + Number(event.sp_needed || 0), 0);
  const totalShortage = visibleEvents.reduce((sum, event) => sum + Number(event.shortage || 0), 0);

  return (
    <SiteShell
      title="Events"
      subtitle="Chronological operations board for imported schedules, staffing needs, and day-to-day review."
    >
      {errorMessage ? (
        <div
          style={{
            ...shellCardStyle,
            borderColor: "#fecaca",
            background: "#fff5f5",
            color: "#991b1b",
            fontWeight: 700,
          }}
        >
          Events error: {errorMessage}
        </div>
      ) : null}

      <div
        style={{
          ...shellCardStyle,
          background: "linear-gradient(135deg, #173b6c 0%, #245ca1 65%, #2e6db5 100%)",
          color: "#ffffff",
          border: "none",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "16px",
            flexWrap: "wrap",
            alignItems: "end",
          }}
        >
          <div style={{ maxWidth: "720px" }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                borderRadius: "999px",
                padding: "7px 12px",
                background: "rgba(255,255,255,0.14)",
                fontWeight: 900,
                fontSize: "12px",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              {isSuperAdmin ? "Super Admin View" : "Events Board"}
            </div>
            <div
              style={{
                display: "flex",
                gap: "10px",
                flexWrap: "wrap",
                alignItems: "center",
                marginTop: "12px",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  borderRadius: "999px",
                  padding: "8px 12px",
                  background: "rgba(255,255,255,0.14)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  fontWeight: 800,
                  fontSize: "13px",
                }}
              >
                {viewingLabel}
              </span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  borderRadius: "999px",
                  padding: "8px 12px",
                  background: "rgba(255,255,255,0.14)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  fontWeight: 800,
                  fontSize: "13px",
                }}
              >
                {dateFilterLabel}
              </span>
              {isSuperAdmin ? (
                <div
                  style={{
                    display: "inline-flex",
                    gap: "6px",
                    padding: "4px",
                    borderRadius: "999px",
                    background: "rgba(255,255,255,0.1)",
                    border: "1px solid rgba(255,255,255,0.16)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setViewMode("all")}
                    style={{
                      border: "none",
                      borderRadius: "999px",
                      padding: "9px 12px",
                      fontWeight: 900,
                      cursor: "pointer",
                      background: activeViewMode === "all" ? "#ffffff" : "transparent",
                      color: activeViewMode === "all" ? "#173b6c" : "#ffffff",
                    }}
                  >
                    All Events
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("assigned")}
                    style={{
                      border: "none",
                      borderRadius: "999px",
                      padding: "9px 12px",
                      fontWeight: 900,
                      cursor: "pointer",
                      background: activeViewMode === "assigned" ? "#ffffff" : "transparent",
                      color: activeViewMode === "assigned" ? "#173b6c" : "#ffffff",
                    }}
                  >
                    My Assigned Events
                  </button>
                </div>
              ) : null}
            </div>
            <div
              style={{
                display: "flex",
                gap: "10px",
                flexWrap: "wrap",
                alignItems: "center",
                marginTop: "12px",
              }}
            >
              {[
                { value: "active" as DateFilterMode, label: "Upcoming + Current" },
                { value: "past" as DateFilterMode, label: "Past Events" },
                { value: "all" as DateFilterMode, label: "All Events" },
              ].map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setDateFilterMode(filter.value)}
                  style={{
                    border: "none",
                    borderRadius: "999px",
                    padding: "9px 12px",
                    fontWeight: 900,
                    cursor: "pointer",
                    background: dateFilterMode === filter.value ? "#ffffff" : "rgba(255,255,255,0.12)",
                    color: dateFilterMode === filter.value ? "#173b6c" : "#ffffff",
                    borderColor: "transparent",
                  }}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <h2 style={{ margin: "14px 0 0", fontSize: "34px", lineHeight: 1.08 }}>
              {loading ? "Loading events..." : `${visibleEvents.length} Events Loaded`}
            </h2>
            <p style={{ margin: "10px 0 0", color: "rgba(255,255,255,0.84)", lineHeight: 1.7, fontWeight: 600 }}>
              Upcoming and current work stays front and center by default, while past imported events remain
              available when you need to review them.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gap: "10px",
              minWidth: "220px",
            }}
          >
            <Link
              href="/events/new"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "14px",
                padding: "12px 16px",
                textDecoration: "none",
                fontWeight: 900,
                background: "#ffffff",
                color: "#173b6c",
              }}
            >
              Create Event
            </Link>
            <Link
              href="/events/upload"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "14px",
                padding: "12px 16px",
                textDecoration: "none",
                fontWeight: 800,
                background: "rgba(255,255,255,0.12)",
                color: "#ffffff",
                border: "1px solid rgba(255,255,255,0.24)",
              }}
            >
              Import More Events
            </Link>
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "12px",
        }}
      >
        <div style={statCardStyle}>
          <div style={statLabelStyle}>Events Loaded</div>
          <div style={statValueStyle}>{visibleEvents.length}</div>
        </div>
        <div style={statCardStyle}>
          <div style={statLabelStyle}>Date Groups</div>
          <div style={statValueStyle}>{groupedEvents.length}</div>
        </div>
        <div style={statCardStyle}>
          <div style={statLabelStyle}>Confirmed SPs</div>
          <div style={statValueStyle}>{totalConfirmed}</div>
        </div>
        <div style={statCardStyle}>
          <div style={statLabelStyle}>SPs Needed</div>
          <div style={statValueStyle}>{totalNeeded}</div>
        </div>
        <div style={statCardStyle}>
          <div style={statLabelStyle}>Open Shortage</div>
          <div style={statValueStyle}>{totalShortage}</div>
        </div>
      </div>

      {loading ? (
        <div style={shellCardStyle}>Loading events from Supabase...</div>
      ) : visibleEvents.length === 0 ? (
        <div style={shellCardStyle}>
          <h3 style={{ marginTop: 0, color: "#173b6c" }}>
            {dateFilterMode === "past"
              ? "No past events found"
              : activeViewMode === "all"
                ? "No current or upcoming events"
                : "No current or upcoming assigned events"}
          </h3>
          <p style={{ marginBottom: 0, color: "#64748b", lineHeight: 1.7 }}>
            {dateFilterMode === "past"
              ? "Past imported events will appear here when you switch into the archive-style view."
              : dateFilterMode === "all"
                ? "Imported or manually created events will appear here once they exist. Use the import page or create a new event to begin building the schedule."
                : "Switch to Past Events or All Events if you need to review older imported schedules."}
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: "22px" }}>
          {groupedEvents.map((group) => (
            <section key={group.key} style={{ display: "grid", gap: "12px" }}>
              <div style={groupHeaderStyle}>
                {group.label}
                <span style={{ opacity: 0.76, marginLeft: "10px", fontSize: "12px" }}>
                  {group.events.length} event{group.events.length === 1 ? "" : "s"}
                </span>
              </div>

              <div style={{ display: "grid", gap: "12px" }}>
                {group.events.map((event) => {
                  const needed = Number(event.sp_needed || 0);
                  const confirmedAssignments = Number(event.confirmed_assignments || 0);
                  const totalAssignments = Number(event.total_assignments || 0);
                  const shortage = Number(event.shortage || 0);
                  const sessionCount = estimateSessionCount(event);
                  const assignedPreview = (event.assigned_sp_names || []).filter(Boolean).slice(0, 4);
                  const eventMeta = classifyEventPresentation({
                    name: event.name,
                    status: event.status,
                    notes: event.notes,
                    location: event.location,
                    spNeeded: event.sp_needed,
                    assignmentCount: totalAssignments,
                    confirmedCount: confirmedAssignments,
                  });
                  const badgeAppearance = getEventBadgeAppearance(eventMeta.primaryBadgeKind);
                  const statusTone = getStatusTone(asText(event.status) || "needs sps");
                  const coverageTone =
                    shortage > 0
                      ? { background: "#fff7ed", border: "#fdba74", color: "#9a3412" }
                      : { background: "#ecfdf3", border: "#86efac", color: "#166534" };

                  return (
                    <Link key={event.id} href={`/events/${event.id}`} style={eventCardStyle}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "16px",
                          flexWrap: "wrap",
                          alignItems: "start",
                        }}
                      >
                        <div style={{ flex: "1 1 560px", minWidth: 260 }}>
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                            <span
                              style={{
                                ...pillStyle,
                                background: statusTone.background,
                                color: statusTone.color,
                                border: `1px solid ${statusTone.border}`,
                              }}
                            >
                              {event.status || "No status"}
                            </span>
                            <span
                              style={{
                                ...pillStyle,
                                background: badgeAppearance.background,
                                color: badgeAppearance.color,
                                border: `1px solid ${badgeAppearance.border}`,
                              }}
                            >
                              {eventMeta.primaryBadgeLabel}
                            </span>
                            <span
                              style={{
                                ...pillStyle,
                                background: coverageTone.background,
                                color: coverageTone.color,
                                border: `1px solid ${coverageTone.border}`,
                              }}
                            >
                              {shortage > 0 ? `${shortage} open` : "Covered"}
                            </span>
                          </div>

                          <h2
                            style={{
                              margin: "12px 0 0",
                              fontSize: "30px",
                              lineHeight: 1.08,
                              color: "#173b6c",
                            }}
                          >
                            {event.name || "Untitled Event"}
                          </h2>

                          <div
                            style={{
                              display: "flex",
                              gap: "14px",
                              flexWrap: "wrap",
                              alignItems: "center",
                              marginTop: "10px",
                              color: "#475569",
                              fontWeight: 700,
                            }}
                          >
                            <span>{getDisplayDate(event) || "Date TBD"}</span>
                            <span>{event.location || "Location TBD"}</span>
                            <span>
                              {sessionCount === null
                                ? "Session count unavailable"
                                : `${sessionCount} session${sessionCount === 1 ? "" : "s"}`}
                            </span>
                          </div>
                        </div>

                        <div
                          style={{
                            display: "grid",
                            gap: "8px",
                            minWidth: "180px",
                            justifyItems: "end",
                          }}
                        >
                          <div style={{ color: "#173b6c", fontWeight: 900 }}>Open Event</div>
                          <div style={{ color: "#64748b", fontWeight: 700, fontSize: "13px" }}>
                            Review staffing, notes, and sessions
                          </div>
                        </div>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                          gap: "10px",
                        }}
                      >
                        <div style={statCardStyle}>
                          <div style={statLabelStyle}>SP Coverage</div>
                          <div style={{ ...statValueStyle, fontSize: "18px" }}>
                            {confirmedAssignments} / {needed}
                          </div>
                        </div>
                        <div style={statCardStyle}>
                          <div style={statLabelStyle}>Assignments</div>
                          <div style={{ ...statValueStyle, fontSize: "18px" }}>{totalAssignments}</div>
                        </div>
                        <div style={statCardStyle}>
                          <div style={statLabelStyle}>Shortage</div>
                          <div
                            style={{
                              ...statValueStyle,
                              fontSize: "18px",
                              color: shortage > 0 ? "#b45309" : "#166534",
                            }}
                          >
                            {shortage}
                          </div>
                        </div>
                        <div style={statCardStyle}>
                          <div style={statLabelStyle}>Location</div>
                          <div style={{ ...statValueStyle, fontSize: "18px" }}>{event.location || "TBD"}</div>
                        </div>
                      </div>

                      <div style={{ display: "grid", gap: "8px" }}>
                        <div style={{ ...statLabelStyle, fontSize: "11px" }}>Assigned SPs</div>
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                          {assignedPreview.length ? (
                            assignedPreview.map((name) => (
                              <span
                                key={`${event.id}-${name}`}
                                style={{
                                  ...pillStyle,
                                  background: "#f8fbff",
                                  color: "#173b6c",
                                  border: "1px solid #dbe4ee",
                                }}
                              >
                                {name}
                              </span>
                            ))
                          ) : (
                            <span style={{ color: "#64748b", fontWeight: 700 }}>No assigned SPs yet</span>
                          )}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </SiteShell>
  );
}

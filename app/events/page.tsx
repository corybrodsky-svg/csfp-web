"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import SiteShell from "../components/SiteShell";
import { formatHumanDate, getDateSortValue, getImportedYearHint } from "../lib/eventDateUtils";
import { classifyEventPresentation, getEventBadgeAppearance } from "../lib/eventClassification";
import { eventMatchesOwnership } from "../lib/eventOwnership";

type EventsMode = "all" | "mine";
type ArchivedRange = "30" | "90" | "365" | "all";

type FolderSummary = {
  name: string;
  totalCount: number;
  upcomingCount: number;
  archivedCount: number;
};

type EventRow = {
  id: string;
  name: string | null;
  status: string | null;
  date_text: string | null;
  location: string | null;
  sp_needed: number | null;
  created_at: string | null;
  notes: string | null;
  owner_id?: string | null;
  owner_name?: string | null;
  schedule_owner_text?: string | null;
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

const cardStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #dbe4ee",
  borderRadius: "24px",
  padding: "18px",
  boxShadow: "0 10px 26px rgba(15, 23, 42, 0.06)",
  marginBottom: "14px",
};

const mutedCardStyle: React.CSSProperties = {
  background: "#f8fafc",
  border: "1px solid #dbe4ee",
  borderRadius: "18px",
  padding: "14px",
};

const statGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: "10px",
  marginTop: "12px",
};

const statCard: React.CSSProperties = {
  border: "1px solid #dbe4ee",
  borderRadius: "16px",
  padding: "12px",
  background: "#f8fbff",
};

const statLabel: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 700,
  color: "#64748b",
  textTransform: "uppercase",
};

const statValue: React.CSSProperties = {
  fontSize: "18px",
  fontWeight: 800,
  color: "#173b6c",
};

const buttonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  border: "1px solid #cfd8e3",
  borderRadius: "14px",
  padding: "12px 16px",
  fontWeight: 700,
  color: "#173b6c",
  background: "#ffffff",
  minHeight: "46px",
};

const compactButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  minHeight: "40px",
  padding: "9px 12px",
  background: "#ffffff",
};

const segmentedButton = (active: boolean): React.CSSProperties => ({
  border: active ? "1px solid #173b6c" : "1px solid #cbd5e1",
  background: active ? "#173b6c" : "#ffffff",
  color: active ? "#ffffff" : "#173b6c",
  borderRadius: "999px",
  padding: "10px 14px",
  fontWeight: 900,
  cursor: "pointer",
});

const archiveRangeButton = (active: boolean): React.CSSProperties => ({
  border: active ? "1px solid #334155" : "1px solid #cbd5e1",
  background: active ? "#334155" : "#ffffff",
  color: active ? "#ffffff" : "#475569",
  borderRadius: "999px",
  padding: "8px 12px",
  fontWeight: 800,
  cursor: "pointer",
});

const eventBadgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  borderRadius: "999px",
  padding: "8px 12px",
  fontWeight: 800,
  fontSize: "13px",
};

const shortagePill = (isCovered: boolean): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  borderRadius: "999px",
  padding: "8px 12px",
  fontWeight: 800,
  fontSize: "13px",
  background: isCovered ? "#ecfdf3" : "#fff7ed",
  color: isCovered ? "#166534" : "#9a3412",
  border: isCovered ? "1px solid #bbf7d0" : "1px solid #fed7aa",
});

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
  return (a.name || "").localeCompare(b.name || "");
}

function getDisplayDate(event: EventRow) {
  return event.earliest_session_date
    ? formatHumanDate(event.earliest_session_date, getImportedYearHint(event.notes))
    : formatHumanDate(event.date_text, getImportedYearHint(event.notes));
}

function deriveEventFolderName(event: EventRow) {
  const eventText = [
    event.name,
    event.status,
    event.notes,
    event.location,
    event.owner_name,
    event.schedule_owner_text,
  ]
    .map(asText)
    .join(" ")
    .toLowerCase();

  if (eventText.includes("salus")) return "Salus at Drexel";
  if (eventText.includes("cnhp") || eventText.includes("cicsp")) return "CNHP / CICSP";
  if (
    eventText.includes("pa program") ||
    eventText.includes("physician assistant") ||
    /\bpa\b/.test(eventText)
  ) {
    return "PA Program";
  }
  if (eventText.includes("drexel")) return "Drexel University";
  return "Other Programs";
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
  const [mode, setMode] = useState<EventsMode>("all");
  const [archivedRange, setArchivedRange] = useState<ArchivedRange>("365");
  const [selectedFolder, setSelectedFolder] = useState("all");
  const [events, setEvents] = useState<EventRow[]>([]);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [showArchivedEvents, setShowArchivedEvents] = useState(false);

  const redirectToLogin = useCallback(() => {
    router.replace("/login");
    router.refresh();
    window.location.replace("/login");
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
          setErrorMessage(meBody?.error || "Could not load current user.");
          setLoading(false);
          return;
        }

        if (!eventsResponse.ok) {
          setErrorMessage(asText(eventsBody?.error) || (await parseApiError(eventsResponse)));
          setLoading(false);
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

  const currentUserId = asText(me?.user?.id);
  const profileName = asText(me?.profile?.full_name);
  const userEmail = asText(me?.user?.email);
  const ownershipMatchName = asText(me?.profile?.schedule_name) || profileName || userEmail;
  const isSuperAdmin = asText(me?.profile?.role) === "super_admin";

  const myEvents = useMemo(
    () => events.filter((event) => eventMatchesOwnership(event, currentUserId, ownershipMatchName)),
    [currentUserId, events, ownershipMatchName]
  );

  const baseSelectedEvents = mode === "mine" ? myEvents : events;
  const selectedEvents = useMemo(
    () =>
      isSuperAdmin && mode === "all" && selectedFolder !== "all"
        ? baseSelectedEvents.filter((event) => deriveEventFolderName(event) === selectedFolder)
        : baseSelectedEvents,
    [baseSelectedEvents, isSuperAdmin, mode, selectedFolder]
  );

  const todayStart = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }, []);

  const upcomingEvents = useMemo(
    () => selectedEvents.filter((event) => parseEventDateValue(event) >= todayStart),
    [selectedEvents, todayStart]
  );

  const archivedEvents = useMemo(
    () => selectedEvents.filter((event) => parseEventDateValue(event) < todayStart),
    [selectedEvents, todayStart]
  );

  const archivedCutoff = useMemo(() => {
    if (archivedRange === "all") return Number.NEGATIVE_INFINITY;
    return todayStart - Number(archivedRange) * 24 * 60 * 60 * 1000;
  }, [archivedRange, todayStart]);

  const filteredArchivedEvents = useMemo(
    () => archivedEvents.filter((event) => archivedRange === "all" || parseEventDateValue(event) >= archivedCutoff),
    [archivedCutoff, archivedEvents, archivedRange]
  );

  const folderSummaries = useMemo<FolderSummary[]>(() => {
    if (!isSuperAdmin || mode !== "all") return [];

    const summaryMap = new Map<string, FolderSummary>();

    events.forEach((event) => {
      const folderName = deriveEventFolderName(event);
      const current = summaryMap.get(folderName) || {
        name: folderName,
        totalCount: 0,
        upcomingCount: 0,
        archivedCount: 0,
      };

      current.totalCount += 1;
      if (parseEventDateValue(event) >= todayStart) {
        current.upcomingCount += 1;
      } else {
        current.archivedCount += 1;
      }

      summaryMap.set(folderName, current);
    });

    return [...summaryMap.values()].sort((a, b) => {
      const activeDiff = b.upcomingCount - a.upcomingCount;
      if (activeDiff !== 0) return activeDiff;
      return a.name.localeCompare(b.name);
    });
  }, [events, isSuperAdmin, mode, todayStart]);

  const totalNeeded = selectedEvents.reduce((sum, event) => sum + Number(event.sp_needed || 0), 0);
  const totalConfirmed = selectedEvents.reduce((sum, event) => sum + Number(event.confirmed_assignments || 0), 0);
  const totalShortage = selectedEvents.reduce((sum, event) => sum + Number(event.shortage || 0), 0);

  return (
    <SiteShell
      title="Events"
      subtitle="Detailed events board for active operations, upcoming coverage, and archived history."
    >
      {errorMessage ? (
        <div
          style={{
            ...cardStyle,
            borderColor: "#fecaca",
            background: "#fff5f5",
            color: "#991b1b",
            fontWeight: 700,
          }}
        >
          Events error: {errorMessage}
        </div>
      ) : null}

      <div style={cardStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "12px",
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: "14px",
          }}
        >
          <div>
            <div style={statLabel}>View Mode</div>
            <div style={{ marginTop: "6px", color: "#64748b", fontWeight: 700 }}>
              {isSuperAdmin && mode === "all"
                ? "Super admin view starts with operational folders derived from existing event data."
                : "Explore the full event board or just the events currently assigned to your ownership match."}
            </div>
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button type="button" onClick={() => setMode("all")} style={segmentedButton(mode === "all")}>
              All Events
            </button>
            <button type="button" onClick={() => setMode("mine")} style={segmentedButton(mode === "mine")}>
              My Events
            </button>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: "14px",
          }}
        >
          <div style={statCard}>
            <div style={statLabel}>{mode === "mine" ? "My Events" : "Total Events"}</div>
            <div style={statValue}>{selectedEvents.length}</div>
          </div>

          <div style={statCard}>
            <div style={statLabel}>Upcoming / Current</div>
            <div style={statValue}>{upcomingEvents.length}</div>
          </div>

          <div style={statCard}>
            <div style={statLabel}>Confirmed SPs</div>
            <div style={statValue}>{totalConfirmed}</div>
          </div>

          <div style={statCard}>
            <div style={statLabel}>Archived</div>
            <div style={statValue}>{archivedEvents.length}</div>
          </div>
        </div>

        <div style={{ ...statGrid, marginTop: "10px" }}>
          <div style={statCard}>
            <div style={statLabel}>SPs Needed</div>
            <div style={statValue}>{totalNeeded}</div>
          </div>
          <div style={statCard}>
            <div style={statLabel}>Remaining Shortage</div>
            <div style={statValue}>{totalShortage}</div>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={cardStyle}>Loading events from Supabase...</div>
      ) : isSuperAdmin && mode === "all" && selectedFolder === "all" ? (
        <>
          <div style={cardStyle}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "12px",
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <div>
                <h2 style={{ margin: 0, color: "#173b6c" }}>Program Folders</h2>
                <p style={{ margin: "6px 0 0", color: "#64748b", fontWeight: 700 }}>
                  Open a folder to view just that program’s events.
                </p>
              </div>
              <Link href="/dashboard" style={buttonStyle}>
                Back to Dashboard
              </Link>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "12px",
            }}
          >
            {folderSummaries.map((folder) => (
              <button
                key={folder.name}
                type="button"
                onClick={() => setSelectedFolder(folder.name)}
                style={{
                  ...cardStyle,
                  marginBottom: 0,
                  cursor: "pointer",
                  textAlign: "left",
                  padding: "16px",
                }}
              >
                <div style={{ color: "#173b6c", fontWeight: 900, fontSize: "18px" }}>{folder.name}</div>
                <div style={{ marginTop: "6px", color: "#64748b", fontWeight: 700 }}>
                  {folder.totalCount} event{folder.totalCount === 1 ? "" : "s"}
                </div>
                <div style={{ marginTop: "10px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <span style={{ ...eventBadgeStyle, padding: "6px 10px", fontSize: "12px", background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1d4ed8" }}>
                    {folder.upcomingCount} active
                  </span>
                  <span style={{ ...eventBadgeStyle, padding: "6px 10px", fontSize: "12px", background: "#f8fafc", border: "1px solid #cbd5e1", color: "#475569" }}>
                    {folder.archivedCount} archived
                  </span>
                </div>
              </button>
            ))}
          </div>
        </>
      ) : upcomingEvents.length === 0 && archivedEvents.length === 0 ? (
        <div style={cardStyle}>
          {mode === "mine" ? "No events currently match your ownership." : "No events found in Supabase."}
        </div>
      ) : (
        <>
          <div style={cardStyle}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "12px",
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <div>
                <h2 style={{ margin: 0, color: "#173b6c" }}>Upcoming & Current Events</h2>
                <p style={{ margin: "6px 0 0", color: "#64748b", fontWeight: 700 }}>
                  {isSuperAdmin && mode === "all" && selectedFolder !== "all"
                    ? `Showing events in ${selectedFolder}.`
                    : "Active events stay at the top so planning, staffing, and follow-up remain focused."}
                </p>
              </div>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                {isSuperAdmin && mode === "all" && selectedFolder !== "all" ? (
                  <button type="button" onClick={() => setSelectedFolder("all")} style={buttonStyle}>
                    All Folders
                  </button>
                ) : null}
                <Link href="/dashboard" style={buttonStyle}>
                  Back to Dashboard
                </Link>
              </div>
            </div>
          </div>

          {upcomingEvents.length === 0 ? (
            <div style={cardStyle}>
              {mode === "mine"
                ? "No upcoming or current events currently match your ownership."
                : "No upcoming or current events found."}
            </div>
          ) : (
            upcomingEvents.map((event) => {
              const needed = Number(event.sp_needed || 0);
              const totalAssignments = Number(event.total_assignments || 0);
              const confirmedAssignments = Number(event.confirmed_assignments || 0);
              const shortage = Number(event.shortage || 0);
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
              const isWorkshop = eventMeta.isSkillsWorkshop;
              const isCovered = shortage === 0 && needed > 0;
              const coverageText =
                isWorkshop
                  ? "Skills Workshop"
                  : needed > 0
                    ? `${confirmedAssignments} confirmed / ${needed} needed`
                    : `${confirmedAssignments} confirmed`;
              const assignedPreview = (event.assigned_sp_names || []).filter(Boolean);

              return (
                <div key={event.id} style={cardStyle}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 16,
                      flexWrap: "wrap",
                      alignItems: "flex-start",
                    }}
                  >
                    <div style={{ flex: "1 1 560px", minWidth: 280 }}>
                      <h2 style={{ margin: 0, fontSize: "28px", color: "#173b6c", lineHeight: 1.15 }}>
                        {event.name || "Untitled Event"}
                      </h2>

                      <div
                        style={{
                          marginTop: 8,
                          display: "flex",
                          gap: 8,
                          flexWrap: "wrap",
                          alignItems: "center",
                        }}
                        >
                          <span style={{ color: "#64748b", fontWeight: 700 }}>{event.status || "No status"}</span>
                        <span
                          style={
                            {
                              ...(isWorkshop
                                ? eventBadgeStyle
                                : shortagePill(isCovered)),
                              padding: "6px 10px",
                              fontSize: "12px",
                              background: badgeAppearance.background,
                              color: badgeAppearance.color,
                              border: `1px solid ${badgeAppearance.border}`,
                            }
                          }
                        >
                          {eventMeta.primaryBadgeLabel}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <Link href={`/events/${event.id}`} style={buttonStyle}>
                        Open Event
                      </Link>
                    </div>
                  </div>

                  <div style={statGrid}>
                    <div style={statCard}>
                      <div style={statLabel}>Date</div>
                      <div style={statValue}>{getDisplayDate(event) || "—"}</div>
                    </div>

                    <div style={statCard}>
                      <div style={statLabel}>Location</div>
                      <div style={statValue}>{event.location || "—"}</div>
                    </div>

                    <div style={statCard}>
                      <div style={statLabel}>SPs Needed</div>
                      <div style={statValue}>{needed}</div>
                    </div>

                    <div style={statCard}>
                      <div style={statLabel}>{isWorkshop ? "Event Type" : "SP Coverage"}</div>
                      <div
                        style={{
                          ...statValue,
                          color: isWorkshop ? "#0f766e" : isCovered ? "#166534" : shortage > 0 ? "#9a3412" : "#173b6c",
                        }}
                      >
                        {coverageText}
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: 12, color: "#173b6c", lineHeight: 1.7 }}>
                    <div style={{ color: "#64748b", fontWeight: 700 }}>
                      {totalAssignments} total assignment{totalAssignments === 1 ? "" : "s"}
                    </div>
                    <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {assignedPreview.length ? (
                        assignedPreview.map((name) => (
                          <span
                            key={`${event.id}-${name}`}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              borderRadius: "999px",
                              padding: "6px 10px",
                              background: "#f8fbff",
                              border: "1px solid #dbe4ee",
                              fontWeight: 800,
                              fontSize: "13px",
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
                </div>
              );
            })
          )}

          {archivedEvents.length ? (
            <div style={cardStyle}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "12px",
                  flexWrap: "wrap",
                  alignItems: "center",
                  marginBottom: "12px",
                }}
              >
                <div>
                  <h2 style={{ margin: 0, color: "#475569" }}>Archived Events</h2>
                  <p style={{ margin: "6px 0 0", color: "#94a3b8", fontWeight: 700 }}>
                    Past events remain stored and explorable here for at least the past year and beyond.
                  </p>
                </div>

                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button type="button" onClick={() => setArchivedRange("30")} style={archiveRangeButton(archivedRange === "30")}>
                    Past 30 Days
                  </button>
                  <button type="button" onClick={() => setArchivedRange("90")} style={archiveRangeButton(archivedRange === "90")}>
                    Past 90 Days
                  </button>
                  <button type="button" onClick={() => setArchivedRange("365")} style={archiveRangeButton(archivedRange === "365")}>
                    Past Year
                  </button>
                  <button type="button" onClick={() => setArchivedRange("all")} style={archiveRangeButton(archivedRange === "all")}>
                    All Archived
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowArchivedEvents((current) => !current)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                  border: "1px solid #dbe4ee",
                  borderRadius: "16px",
                  padding: "14px 16px",
                  background: "#f8fafc",
                  color: "#475569",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                <span>
                  Archived Events ({filteredArchivedEvents.length}
                  {archivedRange !== "all" ? ` shown of ${archivedEvents.length}` : ""})
                </span>
                <span style={{ fontSize: "13px", fontWeight: 800 }}>{showArchivedEvents ? "Hide" : "Show"}</span>
              </button>

              {showArchivedEvents ? (
                <div style={{ display: "grid", gap: "10px", marginTop: "14px" }}>
                  {filteredArchivedEvents.length === 0 ? (
                    <div style={{ ...mutedCardStyle, color: "#64748b", fontWeight: 700 }}>
                      No archived events fall within this range.
                    </div>
                  ) : (
                    filteredArchivedEvents.map((event) => {
                      const needed = Number(event.sp_needed || 0);
                      const confirmedAssignments = Number(event.confirmed_assignments || 0);
                      const shortage = Number(event.shortage || 0);
                      const eventMeta = classifyEventPresentation({
                        name: event.name,
                        status: event.status,
                        notes: event.notes,
                        location: event.location,
                        spNeeded: event.sp_needed,
                        assignmentCount: Math.max(
                          Number(event.total_assignments || 0),
                          Number(event.confirmed_assignments || 0)
                        ),
                        confirmedCount: confirmedAssignments,
                      });
                      const badgeAppearance = getEventBadgeAppearance(eventMeta.primaryBadgeKind);
                      const isCovered = shortage === 0 && needed > 0;
                      const assignedPreview = (event.assigned_sp_names || []).filter(Boolean).slice(0, 3);

                      return (
                        <div key={event.id} style={mutedCardStyle}>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: "12px",
                              flexWrap: "wrap",
                              alignItems: "center",
                            }}
                          >
                            <div style={{ flex: "1 1 360px" }}>
                              <div
                                style={{
                                  display: "flex",
                                  gap: "8px",
                                  flexWrap: "wrap",
                                  alignItems: "center",
                                }}
                              >
                                <div style={{ color: "#475569", fontWeight: 900, fontSize: "18px" }}>
                                  {event.name || "Untitled Event"}
                                </div>
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    borderRadius: "999px",
                                    padding: "5px 8px",
                                    background: "#e2e8f0",
                                    color: "#475569",
                                    fontWeight: 900,
                                    fontSize: "11px",
                                    textTransform: "uppercase",
                                  }}
                                >
                                  Archived
                                </span>
                                <span
                                  style={{
                                    ...eventBadgeStyle,
                                    padding: "5px 8px",
                                    fontSize: "11px",
                                    textTransform: "uppercase",
                                    background: badgeAppearance.background,
                                    color: badgeAppearance.color,
                                    border: `1px solid ${badgeAppearance.border}`,
                                  }}
                                >
                                  {eventMeta.primaryBadgeLabel}
                                </span>
                              </div>

                              <div style={{ marginTop: "6px", color: "#64748b", fontWeight: 700, lineHeight: 1.6 }}>
                                {getDisplayDate(event)} · {event.location || "Location TBD"}
                              </div>

                              <div style={{ marginTop: "6px", color: "#64748b", fontWeight: 700, fontSize: "13px" }}>
                                {confirmedAssignments} confirmed / {needed} needed
                              </div>

                              {assignedPreview.length ? (
                                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "8px" }}>
                                  {assignedPreview.map((name) => (
                                    <span
                                      key={`${event.id}-${name}`}
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        borderRadius: "999px",
                                        padding: "5px 8px",
                                        background: "#ffffff",
                                        border: "1px solid #dbe4ee",
                                        color: "#64748b",
                                        fontWeight: 800,
                                        fontSize: "12px",
                                      }}
                                    >
                                      {name}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                            </div>

                            <div style={{ display: "grid", gap: "10px", justifyItems: "end" }}>
                              <span
                                style={{
                                  ...shortagePill(isCovered),
                                  padding: "5px 8px",
                                  fontSize: "11px",
                                  opacity: 0.85,
                                }}
                            >
                              {eventMeta.primaryBadgeLabel}
                            </span>

                              <Link href={`/events/${event.id}`} style={compactButtonStyle}>
                                Open Event
                              </Link>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </SiteShell>
  );
}

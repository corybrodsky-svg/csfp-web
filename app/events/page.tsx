"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import SiteShell from "../components/SiteShell";
import { formatHumanDate, getDateSortValue, getImportedYearHint } from "../lib/eventDateUtils";

type EventsMode = "all" | "mine";

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

function normalizeMatchValue(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function getScheduleNameVariants(value: string) {
  const normalized = normalizeMatchValue(value);
  if (!normalized) return [];

  const variants = new Set<string>([normalized]);
  const parts = normalized.split(" ").filter(Boolean);
  if (parts.length > 1) {
    variants.add(parts[0]);
    variants.add(parts.slice(0, 2).join(" "));
  }

  return Array.from(variants);
}

function ownershipTextMatchesScheduleName(ownerText: string, scheduleName: string) {
  const normalizedOwner = normalizeMatchValue(ownerText);
  const normalizedSchedule = normalizeMatchValue(scheduleName);
  if (!normalizedOwner || !normalizedSchedule) return false;

  const ownerSegments = normalizedOwner
    .split(/\/|,|;|&|\band\b/)
    .map((segment) => normalizeMatchValue(segment))
    .filter(Boolean);
  const ownerCandidates = Array.from(new Set([normalizedOwner, ...ownerSegments]));
  const scheduleVariants = getScheduleNameVariants(normalizedSchedule);

  return scheduleVariants.some((variant) =>
    ownerCandidates.some(
      (candidate) => candidate === variant || candidate.includes(variant) || variant.includes(candidate)
    )
  );
}

function getOwnershipTextFromNotes(notes: string) {
  const match = notes.match(/Event Lead\/Team:\s*(.+)/i);
  return match ? asText(match[1]) : "";
}

function eventMatchesOwnership(event: EventRow, currentUserId: string, scheduleName: string) {
  if (asText(event.owner_id) === currentUserId) return true;
  if (ownershipTextMatchesScheduleName(asText(event.schedule_owner_text), scheduleName)) return true;
  return ownershipTextMatchesScheduleName(getOwnershipTextFromNotes(asText(event.notes)), scheduleName);
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
  const [events, setEvents] = useState<EventRow[]>([]);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [showPastEvents, setShowPastEvents] = useState(false);

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

  const myEvents = useMemo(
    () => events.filter((event) => eventMatchesOwnership(event, currentUserId, ownershipMatchName)),
    [currentUserId, events, ownershipMatchName]
  );

  const selectedEvents = mode === "mine" ? myEvents : events;

  const todayStart = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }, []);

  const upcomingEvents = useMemo(
    () => selectedEvents.filter((event) => parseEventDateValue(event) >= todayStart),
    [selectedEvents, todayStart]
  );

  const pastEvents = useMemo(
    () => selectedEvents.filter((event) => parseEventDateValue(event) < todayStart),
    [selectedEvents, todayStart]
  );

  const totalNeeded = selectedEvents.reduce((sum, event) => sum + Number(event.sp_needed || 0), 0);
  const totalConfirmed = selectedEvents.reduce((sum, event) => sum + Number(event.confirmed_assignments || 0), 0);
  const totalShortage = selectedEvents.reduce((sum, event) => sum + Number(event.shortage || 0), 0);

  return (
    <SiteShell
      title="Events"
      subtitle="Supabase event list with live SP assignment coverage and earliest-date sorting."
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
              Switch between the full event board and the events currently assigned to your account.
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
            <div style={statLabel}>SPs Needed</div>
            <div style={statValue}>{totalNeeded}</div>
          </div>

          <div style={statCard}>
            <div style={statLabel}>Confirmed SPs</div>
            <div style={statValue}>{totalConfirmed}</div>
          </div>

          <div style={statCard}>
            <div style={statLabel}>Remaining Shortage</div>
            <div style={statValue}>{totalShortage}</div>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={cardStyle}>Loading events from Supabase...</div>
      ) : upcomingEvents.length === 0 && pastEvents.length === 0 ? (
        <div style={cardStyle}>
          {mode === "mine" ? "No events currently match your ownership." : "No events found in Supabase."}
        </div>
      ) : (
        <>
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
              const isCovered = shortage === 0 && needed > 0;
              const coverageText =
                needed > 0
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
                          style={{
                            ...shortagePill(isCovered),
                            padding: "6px 10px",
                            fontSize: "12px",
                          }}
                        >
                          {needed > 0
                            ? shortage === 0
                              ? "Coverage complete"
                              : `${shortage} still needed`
                            : "No SP target"}
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
                      <div style={statLabel}>SP Coverage</div>
                      <div
                        style={{
                          ...statValue,
                          color: isCovered ? "#166534" : shortage > 0 ? "#9a3412" : "#173b6c",
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

          {pastEvents.length ? (
            <div style={cardStyle}>
              <button
                type="button"
                onClick={() => setShowPastEvents((current) => !current)}
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
                <span>Past Events ({pastEvents.length})</span>
                <span style={{ fontSize: "13px", fontWeight: 800 }}>{showPastEvents ? "Hide" : "Show"}</span>
              </button>

              {showPastEvents ? (
                <div style={{ display: "grid", gap: "10px", marginTop: "14px" }}>
                  {pastEvents.map((event) => {
                    const needed = Number(event.sp_needed || 0);
                    const confirmedAssignments = Number(event.confirmed_assignments || 0);
                    const shortage = Number(event.shortage || 0);
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
                                Past
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
                              {needed > 0
                                ? shortage === 0
                                  ? "Coverage complete"
                                  : `${shortage} still needed`
                                : "No SP target"}
                            </span>

                            <Link href={`/events/${event.id}`} style={compactButtonStyle}>
                              Open Event
                            </Link>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </SiteShell>
  );
}

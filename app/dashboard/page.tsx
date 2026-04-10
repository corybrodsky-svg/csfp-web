"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import SiteShell from "../components/SiteShell";
import { formatHumanDate, getDateSortValue, getImportedYearHint } from "../lib/eventDateUtils";
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

const heroStyle: React.CSSProperties = {
  background: "linear-gradient(135deg, #163a6b 0%, #1f4f8f 55%, #f8fbff 100%)",
  border: "1px solid #bfdbfe",
  borderRadius: "24px",
  padding: "24px",
  color: "#ffffff",
  marginBottom: "18px",
};

const sectionStyle: React.CSSProperties = {
  border: "1px solid #dbe4ee",
  borderRadius: "20px",
  padding: "18px",
  background: "#ffffff",
  boxShadow: "0 10px 26px rgba(15, 23, 42, 0.06)",
};

const statGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: "12px",
};

const statCard: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.18)",
  borderRadius: "18px",
  padding: "14px",
  background: "rgba(255,255,255,0.12)",
};

const secondaryStatCard: React.CSSProperties = {
  border: "1px solid #dbe4ee",
  borderRadius: "16px",
  padding: "14px",
  background: "#f8fbff",
};

const statLabel: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const statValue: React.CSSProperties = {
  marginTop: "6px",
  fontSize: "30px",
  fontWeight: 900,
  lineHeight: 1,
};

const actionLinkStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  border: "1px solid #cfd8e3",
  borderRadius: "12px",
  padding: "11px 14px",
  fontWeight: 800,
  color: "#173b6c",
  background: "#ffffff",
};

const compactEventRow: React.CSSProperties = {
  border: "1px solid #dbe4ee",
  borderRadius: "16px",
  padding: "14px",
  background: "#ffffff",
};

const skillsWorkshopBadgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: "999px",
  padding: "7px 10px",
  background: "#ecfeff",
  border: "1px solid #99f6e4",
  color: "#0f766e",
  fontWeight: 900,
  fontSize: "12px",
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function formatDate(event: EventRow) {
  const fallbackYear = getImportedYearHint(event.notes);
  return formatHumanDate(event.earliest_session_date || event.date_text, fallbackYear);
}

function getEventSortValue(event: EventRow) {
  const fallbackYear = getImportedYearHint(event.notes);
  return getDateSortValue(event.earliest_session_date || event.date_text || event.created_at, fallbackYear);
}

async function parseApiError(response: Response) {
  try {
    const body = await response.json();
    return asText(body?.error) || `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}

function isPastEvent(event: EventRow, todayStart: number) {
  return getEventSortValue(event) < todayStart;
}

function isWithinRange(event: EventRow, start: number, end: number) {
  const sortValue = getEventSortValue(event);
  return sortValue >= start && sortValue < end;
}

function isSkillsWorkshopEvent(event: EventRow) {
  const needed = Number(event.sp_needed || 0);
  const assignmentCount = Math.max(
    Number(event.total_assignments || 0),
    Number(event.confirmed_assignments || 0)
  );
  return needed <= 0 && assignmentCount === 0;
}

export default function DashboardPage() {
  const router = useRouter();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const redirectToLogin = useCallback(() => {
    router.replace("/login");
    router.refresh();
    window.location.replace("/login");
  }, [router]);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      setLoading(true);
      setErrorMessage("");

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

        const nextEvents = Array.isArray(eventsBody?.events)
          ? [...(eventsBody.events as EventRow[])].sort((a, b) => {
              const dateDiff = getEventSortValue(a) - getEventSortValue(b);
              if (dateDiff !== 0) return dateDiff;
              return asText(a.name).localeCompare(asText(b.name));
            })
          : [];

        setMe(meBody);
        setEvents(nextEvents);
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : "Could not load dashboard.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadDashboard();
    window.addEventListener("focus", loadDashboard);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", loadDashboard);
    };
  }, [redirectToLogin]);

  const currentUserId = asText(me?.user?.id);
  const profileName = asText(me?.profile?.full_name);
  const userEmail = asText(me?.user?.email);
  const userName = profileName || userEmail || "CFSP user";
  const ownershipMatchName = asText(me?.profile?.schedule_name) || profileName || userEmail;

  const myEvents = useMemo(
    () => events.filter((event) => eventMatchesOwnership(event, currentUserId, ownershipMatchName)),
    [currentUserId, events, ownershipMatchName]
  );

  const todayStart = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }, []);

  const tomorrowStart = todayStart + 24 * 60 * 60 * 1000;
  const weekEnd = todayStart + 7 * 24 * 60 * 60 * 1000;
  const yearAgo = todayStart - 365 * 24 * 60 * 60 * 1000;

  const activeEvents = useMemo(
    () => events.filter((event) => !isPastEvent(event, todayStart)),
    [events, todayStart]
  );

  const todayEvents = useMemo(
    () => activeEvents.filter((event) => isWithinRange(event, todayStart, tomorrowStart)),
    [activeEvents, todayStart, tomorrowStart]
  );

  const thisWeekEvents = useMemo(
    () => activeEvents.filter((event) => isWithinRange(event, todayStart, weekEnd)),
    [activeEvents, todayStart, weekEnd]
  );

  const myUpcomingEvents = useMemo(
    () => myEvents.filter((event) => !isPastEvent(event, todayStart)).slice(0, 5),
    [myEvents, todayStart]
  );

  const needingActionEvents = useMemo(
    () =>
      activeEvents
        .filter(
          (event) =>
            !isSkillsWorkshopEvent(event) &&
            (Number(event.shortage || 0) > 0 || asText(event.status).toLowerCase().includes("need"))
        )
        .sort((a, b) => {
          const shortageDiff = Number(b.shortage || 0) - Number(a.shortage || 0);
          if (shortageDiff !== 0) return shortageDiff;
          return getEventSortValue(a) - getEventSortValue(b);
        })
        .slice(0, 6),
    [activeEvents]
  );

  const archivedEvents = useMemo(
    () => events.filter((event) => isPastEvent(event, todayStart)),
    [events, todayStart]
  );

  const archivedPastYear = useMemo(
    () => archivedEvents.filter((event) => getEventSortValue(event) >= yearAgo),
    [archivedEvents, yearAgo]
  );

  const archivedRecent = useMemo(
    () => [...archivedEvents].sort((a, b) => getEventSortValue(b) - getEventSortValue(a)).slice(0, 4),
    [archivedEvents]
  );

  const totalShortage = activeEvents.reduce((sum, event) => sum + Number(event.shortage || 0), 0);
  const myShortage = myEvents.reduce((sum, event) => sum + Number(event.shortage || 0), 0);

  return (
    <SiteShell
      title="Dashboard"
      subtitle="Operational home page for what needs attention now, this week, and on your plate next."
    >
      {errorMessage ? (
        <div
          style={{
            ...sectionStyle,
            borderColor: "#fecaca",
            background: "#fff5f5",
            color: "#991b1b",
            fontWeight: 700,
            marginBottom: "14px",
          }}
        >
          Dashboard error: {errorMessage}
        </div>
      ) : null}

      <section style={heroStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "16px",
            flexWrap: "wrap",
            alignItems: "flex-start",
          }}
        >
          <div style={{ maxWidth: "720px" }}>
            <div style={{ fontSize: "12px", fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.85 }}>
              CFSP Command Center
            </div>
            <h2 style={{ margin: "10px 0 0", fontSize: "38px", lineHeight: 1.05 }}>
              {loading ? "Loading dashboard..." : `Welcome back, ${userName}`}
            </h2>
            <p style={{ margin: "12px 0 0", maxWidth: "620px", lineHeight: 1.7, opacity: 0.95 }}>
              Today’s operational snapshot: shortages, events needing action, and your next upcoming assignments.
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <Link href="/events" style={{ ...actionLinkStyle, border: "none", background: "#ffffff", color: "#173b6c" }}>
              Open Events Board
            </Link>
            <Link href="/events/new" style={{ ...actionLinkStyle, border: "1px solid rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.12)", color: "#ffffff" }}>
              New Event
            </Link>
          </div>
        </div>

        <section style={{ ...statGrid, marginTop: "18px" }}>
          <div style={statCard}>
            <div style={{ ...statLabel, opacity: 0.85 }}>Needs Action</div>
            <div style={statValue}>{loading ? "..." : needingActionEvents.length}</div>
          </div>
          <div style={statCard}>
            <div style={{ ...statLabel, opacity: 0.85 }}>Open Shortage</div>
            <div style={statValue}>{loading ? "..." : totalShortage}</div>
          </div>
          <div style={statCard}>
            <div style={{ ...statLabel, opacity: 0.85 }}>Today</div>
            <div style={statValue}>{loading ? "..." : todayEvents.length}</div>
          </div>
          <div style={statCard}>
            <div style={{ ...statLabel, opacity: 0.85 }}>This Week</div>
            <div style={statValue}>{loading ? "..." : thisWeekEvents.length}</div>
          </div>
        </section>
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "1.15fr 0.85fr",
          gap: "14px",
          alignItems: "start",
        }}
      >
        <div style={{ display: "grid", gap: "14px" }}>
          <section style={sectionStyle}>
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
                <h2 style={{ margin: 0, color: "#173b6c" }}>Needs Attention</h2>
                <p style={{ margin: "6px 0 0", color: "#64748b", fontWeight: 700 }}>
                  Active events with shortage risk or immediate staffing follow-up.
                </p>
              </div>
              <Link href="/events" style={actionLinkStyle}>
                Detailed Events Board
              </Link>
            </div>

            <div style={{ display: "grid", gap: "10px", marginTop: "14px" }}>
              {loading ? (
                <div style={compactEventRow}>Loading operational priorities...</div>
              ) : needingActionEvents.length === 0 ? (
                <div style={{ ...compactEventRow, color: "#64748b", fontWeight: 700 }}>
                  No active events currently need action.
                </div>
              ) : (
                needingActionEvents.map((event) => (
                  <div key={event.id} style={compactEventRow}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "12px",
                        flexWrap: "wrap",
                        alignItems: "center",
                      }}
                    >
                      <div style={{ flex: "1 1 320px" }}>
                        <div style={{ color: "#173b6c", fontWeight: 900, fontSize: "18px" }}>
                          {event.name || "Untitled Event"}
                        </div>
                        <div style={{ marginTop: "4px", color: "#64748b", fontWeight: 700 }}>
                          {formatDate(event)} · {event.location || "Location TBD"}
                        </div>
                        <div style={{ marginTop: "6px", color: "#334155", fontWeight: 800 }}>
                          {Number(event.confirmed_assignments || 0)} confirmed / {Number(event.sp_needed || 0)} needed
                        </div>
                      </div>

                      <div style={{ display: "grid", gap: "8px", justifyItems: "end" }}>
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            borderRadius: "999px",
                            padding: "7px 10px",
                            background: Number(event.shortage || 0) > 0 ? "#fff7ed" : "#ecfdf3",
                            border: Number(event.shortage || 0) > 0 ? "1px solid #fed7aa" : "1px solid #86efac",
                            color: Number(event.shortage || 0) > 0 ? "#9a3412" : "#166534",
                            fontWeight: 900,
                            fontSize: "12px",
                          }}
                        >
                          {Number(event.shortage || 0) > 0
                            ? `${Number(event.shortage || 0)} still needed`
                            : "Coverage complete"}
                        </div>
                        <Link href={`/events/${event.id}`} style={actionLinkStyle}>
                          Open Event
                        </Link>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section style={sectionStyle}>
            <h2 style={{ margin: 0, color: "#173b6c" }}>My Upcoming Events</h2>
            <p style={{ margin: "6px 0 0", color: "#64748b", fontWeight: 700 }}>
              Your owned upcoming events, matched using schedule ownership and notes parsing.
            </p>

            <div style={{ display: "grid", gap: "10px", marginTop: "14px" }}>
              {loading ? (
                <div style={compactEventRow}>Loading your assignments...</div>
              ) : myUpcomingEvents.length === 0 ? (
                <div style={{ ...compactEventRow, color: "#64748b", fontWeight: 700 }}>
                  No upcoming events currently match your ownership.
                </div>
              ) : (
                myUpcomingEvents.map((event) => (
                  <div key={event.id} style={compactEventRow}>
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
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                        <div style={{ color: "#173b6c", fontWeight: 900 }}>{event.name || "Untitled Event"}</div>
                        {isSkillsWorkshopEvent(event) ? (
                          <span style={skillsWorkshopBadgeStyle}>Skills Workshop</span>
                        ) : null}
                      </div>
                      <div style={{ marginTop: "4px", color: "#64748b", fontWeight: 700 }}>
                        {formatDate(event)} · {event.location || "Location TBD"}
                      </div>
                      </div>
                      <Link href={`/events/${event.id}`} style={actionLinkStyle}>
                        Open Event
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <div style={{ display: "grid", gap: "14px" }}>
          <section style={sectionStyle}>
            <h2 style={{ margin: 0, color: "#173b6c" }}>Today / This Week</h2>
            <div style={{ ...statGrid, marginTop: "14px" }}>
              <div style={secondaryStatCard}>
                <div style={statLabel}>Today</div>
                <div style={{ ...statValue, fontSize: "24px" }}>{loading ? "..." : todayEvents.length}</div>
              </div>
              <div style={secondaryStatCard}>
                <div style={statLabel}>This Week</div>
                <div style={{ ...statValue, fontSize: "24px" }}>{loading ? "..." : thisWeekEvents.length}</div>
              </div>
              <div style={secondaryStatCard}>
                <div style={statLabel}>My Open Shortage</div>
                <div style={{ ...statValue, fontSize: "24px" }}>{loading ? "..." : myShortage}</div>
              </div>
              <div style={secondaryStatCard}>
                <div style={statLabel}>My Upcoming</div>
                <div style={{ ...statValue, fontSize: "24px" }}>{loading ? "..." : myUpcomingEvents.length}</div>
              </div>
            </div>
          </section>

          <section style={sectionStyle}>
            <h2 style={{ margin: 0, color: "#173b6c" }}>Archived Snapshot</h2>
            <p style={{ margin: "6px 0 0", color: "#64748b", fontWeight: 700 }}>
              Past events stay available on the Events board without taking over the active dashboard.
            </p>

            <div style={{ ...statGrid, marginTop: "14px" }}>
              <div style={secondaryStatCard}>
                <div style={statLabel}>Archived</div>
                <div style={{ ...statValue, fontSize: "24px" }}>{loading ? "..." : archivedEvents.length}</div>
              </div>
              <div style={secondaryStatCard}>
                <div style={statLabel}>Past Year</div>
                <div style={{ ...statValue, fontSize: "24px" }}>{loading ? "..." : archivedPastYear.length}</div>
              </div>
            </div>

            <div style={{ display: "grid", gap: "8px", marginTop: "14px" }}>
              {loading ? (
                <div style={{ color: "#64748b", fontWeight: 700 }}>Loading archive summary...</div>
              ) : archivedRecent.length === 0 ? (
                <div style={{ color: "#64748b", fontWeight: 700 }}>No archived events yet.</div>
              ) : (
                archivedRecent.map((event) => (
                  <div
                    key={event.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "10px",
                      alignItems: "center",
                      padding: "10px 12px",
                      borderRadius: "14px",
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                        <div style={{ color: "#475569", fontWeight: 800 }}>{event.name || "Untitled Event"}</div>
                        {isSkillsWorkshopEvent(event) ? (
                          <span style={skillsWorkshopBadgeStyle}>Skills Workshop</span>
                        ) : null}
                      </div>
                      <div style={{ marginTop: "2px", color: "#94a3b8", fontWeight: 700, fontSize: "13px" }}>
                        {formatDate(event)}
                      </div>
                    </div>
                    <Link href={`/events/${event.id}`} style={actionLinkStyle}>
                      View
                    </Link>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </section>
    </SiteShell>
  );
}

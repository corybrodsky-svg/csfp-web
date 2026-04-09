"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import SiteShell from "../components/SiteShell";
import { formatHumanDate, getDateSortValue, getImportedYearHint } from "../lib/eventDateUtils";

type DashboardMode = "all" | "mine";

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
  background: "linear-gradient(135deg, #163a6b 0%, #1f4f8f 45%, #f8fbff 100%)",
  border: "1px solid #bfdbfe",
  borderRadius: "24px",
  padding: "22px",
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
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: "12px",
};

const statCard: React.CSSProperties = {
  border: "1px solid #dbe4ee",
  borderRadius: "16px",
  padding: "14px",
  background: "#f8fbff",
};

const statLabel: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 700,
  color: "#64748b",
  textTransform: "uppercase",
};

const statValue: React.CSSProperties = {
  marginTop: "6px",
  fontSize: "24px",
  fontWeight: 900,
  color: "#173b6c",
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

const eventRowStyle: React.CSSProperties = {
  border: "1px solid #dbe4ee",
  borderRadius: "16px",
  padding: "14px",
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
      (candidate) =>
        candidate === variant ||
        candidate.includes(variant) ||
        variant.includes(candidate)
    )
  );
}

function getOwnershipLabel(event: EventRow) {
  return asText(event.owner_name) || asText(event.schedule_owner_text) || "Unassigned";
}

function formatDate(event: EventRow) {
  const fallbackYear = getImportedYearHint(event.notes);
  return formatHumanDate(event.earliest_session_date || event.date_text, fallbackYear);
}

function getEventSortValue(event: EventRow) {
  const fallbackYear = getImportedYearHint(event.notes);
  return getDateSortValue(event.earliest_session_date || event.date_text || event.created_at, fallbackYear);
}

function shortagePill(shortage: number, needed: number) {
  if (needed <= 0) {
    return {
      label: "No SP target",
      style: {
        background: "#f8fafc",
        color: "#475569",
        border: "1px solid #cbd5e1",
      },
    };
  }

  if (shortage <= 0) {
    return {
      label: "Coverage complete",
      style: {
        background: "#ecfdf3",
        color: "#166534",
        border: "1px solid #86efac",
      },
    };
  }

  return {
    label: `${shortage} still needed`,
    style: {
      background: shortage <= 2 ? "#fff7ed" : "#fff5f5",
      color: shortage <= 2 ? "#9a3412" : "#991b1b",
      border: shortage <= 2 ? "1px solid #fed7aa" : "1px solid #fecaca",
    },
  };
}

async function parseApiError(response: Response) {
  try {
    const body = await response.json();
    return asText(body?.error) || `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}

export default function DashboardPage() {
  const router = useRouter();
  const [mode, setMode] = useState<DashboardMode>("all");
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
          setErrorMessage(
            asText(eventsBody?.error) || (await parseApiError(eventsResponse))
          );
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
  const isUsingEmailFallback = !profileName && Boolean(userEmail);
  const scheduleName = asText(me?.profile?.schedule_name);

  const myEvents = useMemo(
    () =>
      events.filter((event) => {
        if (asText(event.owner_id) === currentUserId) return true;
        return ownershipTextMatchesScheduleName(asText(event.schedule_owner_text), scheduleName);
      }),
    [currentUserId, events, scheduleName]
  );

  const selectedEvents = mode === "mine" ? myEvents : events;

  const metrics = useMemo(() => {
    const totalEvents = selectedEvents.length;
    const totalNeeded = selectedEvents.reduce((sum, event) => sum + Number(event.sp_needed || 0), 0);
    const totalConfirmed = selectedEvents.reduce(
      (sum, event) => sum + Number(event.confirmed_assignments || 0),
      0
    );
    const totalShortage = selectedEvents.reduce((sum, event) => sum + Number(event.shortage || 0), 0);
    const atRisk = selectedEvents.filter((event) => Number(event.shortage || 0) > 0).length;

    return {
      totalEvents,
      totalNeeded,
      totalConfirmed,
      totalShortage,
      atRisk,
    };
  }, [selectedEvents]);

  const priorityEvents = useMemo(
    () =>
      [...selectedEvents]
        .filter((event) => Number(event.shortage || 0) > 0 || (event.status || "").toLowerCase().includes("need"))
        .sort((a, b) => {
          const shortageDiff = Number(b.shortage || 0) - Number(a.shortage || 0);
          if (shortageDiff !== 0) return shortageDiff;
          return getEventSortValue(a) - getEventSortValue(b);
        })
        .slice(0, 5),
    [selectedEvents]
  );

  const upcomingEvents = useMemo(
    () => [...selectedEvents].sort((a, b) => getEventSortValue(a) - getEventSortValue(b)).slice(0, 6),
    [selectedEvents]
  );

  const myWorkload = useMemo(() => {
    const openShortage = myEvents.reduce((sum, event) => sum + Number(event.shortage || 0), 0);
    const covered = myEvents.filter((event) => Number(event.shortage || 0) <= 0 && Number(event.sp_needed || 0) > 0).length;
    return {
      eventCount: myEvents.length,
      openShortage,
      covered,
      needingAttention: myEvents.filter((event) => Number(event.shortage || 0) > 0).length,
    };
  }, [myEvents]);

  return (
    <SiteShell
      title="Dashboard"
      subtitle="CFSP operations home base for event coverage, ownership, and upcoming work."
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
            <h2 style={{ margin: "10px 0 0", fontSize: "36px", lineHeight: 1.05 }}>
              {loading ? "Loading dashboard..." : `Welcome back, ${userName}`}
            </h2>
            <p style={{ margin: "12px 0 0", maxWidth: "620px", lineHeight: 1.7, opacity: 0.95 }}>
              Monitor event coverage, focus on shortage risk, and move directly into the highest-priority work.
            </p>
            {!loading && isUsingEmailFallback ? (
              <div
                style={{
                  marginTop: "14px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "10px",
                  flexWrap: "wrap",
                  padding: "10px 12px",
                  borderRadius: "14px",
                  background: "rgba(255,255,255,0.14)",
                  border: "1px solid rgba(255,255,255,0.24)",
                }}
              >
                <span style={{ fontWeight: 700, lineHeight: 1.5 }}>
                  Finish your profile so your dashboard reflects your name and assignments correctly.
                </span>
                <Link
                  href="/me"
                  style={{
                    ...actionLinkStyle,
                    padding: "8px 12px",
                    background: "#ffffff",
                    color: "#173b6c",
                    border: "none",
                  }}
                >
                  Complete Profile
                </Link>
              </div>
            ) : null}
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <Link href="/events/new" style={{ ...actionLinkStyle, border: "none", background: "#ffffff", color: "#173b6c" }}>
              New Event
            </Link>
            <Link href="/events/upload" style={{ ...actionLinkStyle, border: "1px solid rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.12)", color: "#ffffff" }}>
              Upload Schedule
            </Link>
            <Link href="/events" style={{ ...actionLinkStyle, border: "1px solid rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.12)", color: "#ffffff" }}>
              Open Events
            </Link>
          </div>
        </div>
      </section>

      <section style={{ ...sectionStyle, marginBottom: "14px" }}>
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
            <div style={{ ...statLabel, color: "#173b6c" }}>View Mode</div>
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
      </section>

      <section style={{ ...statGrid, marginBottom: "14px" }}>
        <div style={statCard}>
          <div style={statLabel}>{mode === "mine" ? "My Events" : "Total Events"}</div>
          <div style={statValue}>{loading ? "..." : metrics.totalEvents}</div>
        </div>
        <div style={statCard}>
          <div style={statLabel}>Confirmed SPs</div>
          <div style={statValue}>{loading ? "..." : metrics.totalConfirmed}</div>
        </div>
        <div style={statCard}>
          <div style={statLabel}>Open Shortage</div>
          <div style={statValue}>{loading ? "..." : metrics.totalShortage}</div>
        </div>
        <div style={statCard}>
          <div style={statLabel}>Priority Events</div>
          <div style={statValue}>{loading ? "..." : metrics.atRisk}</div>
        </div>
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "1.3fr 0.9fr",
          gap: "14px",
          alignItems: "start",
        }}
      >
        <div style={{ display: "grid", gap: "14px" }}>
          <div style={sectionStyle}>
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
                <h2 style={{ margin: 0, color: "#173b6c" }}>Priority Events</h2>
                <p style={{ margin: "6px 0 0", color: "#64748b", fontWeight: 700 }}>
                  Events with active shortage risk or immediate coverage attention.
                </p>
              </div>
              <Link href="/events" style={actionLinkStyle}>
                Full Event List
              </Link>
            </div>

            <div style={{ display: "grid", gap: "10px", marginTop: "14px" }}>
              {loading ? (
                <div style={eventRowStyle}>Loading priority events...</div>
              ) : priorityEvents.length === 0 ? (
                <div style={{ ...eventRowStyle, color: "#64748b", fontWeight: 700 }}>
                  {mode === "mine"
                    ? "No personal events currently need attention."
                    : "No priority events at the moment."}
                </div>
              ) : (
                priorityEvents.map((event) => {
                  const shortageInfo = shortagePill(Number(event.shortage || 0), Number(event.sp_needed || 0));
                  return (
                    <div key={event.id} style={eventRowStyle}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "12px",
                          flexWrap: "wrap",
                          alignItems: "flex-start",
                        }}
                      >
                        <div style={{ flex: "1 1 320px" }}>
                          <div style={{ color: "#173b6c", fontWeight: 900, fontSize: "18px" }}>
                            {event.name || "Untitled Event"}
                          </div>
                          <div style={{ marginTop: "6px", color: "#64748b", fontWeight: 700 }}>
                            {formatDate(event)} · {event.location || "Location TBD"}
                          </div>
                          <div style={{ marginTop: "8px", color: "#334155", fontWeight: 700 }}>
                            {Number(event.confirmed_assignments || 0)} confirmed / {Number(event.sp_needed || 0)} needed
                          </div>
                          <div style={{ marginTop: "6px", color: "#64748b", fontWeight: 700, fontSize: "13px" }}>
                            Owner: {getOwnershipLabel(event)}
                          </div>
                          {(event.assigned_sp_names || []).length ? (
                            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "8px" }}>
                              {(event.assigned_sp_names || []).slice(0, 3).map((name) => (
                                <span
                                  key={`${event.id}-${name}`}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    padding: "5px 8px",
                                    borderRadius: "999px",
                                    background: "#f8fbff",
                                    border: "1px solid #dbe4ee",
                                    color: "#173b6c",
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
                              display: "inline-flex",
                              alignItems: "center",
                              padding: "7px 10px",
                              borderRadius: "999px",
                              fontWeight: 900,
                              fontSize: "12px",
                              ...shortageInfo.style,
                            }}
                          >
                            {shortageInfo.label}
                          </span>
                          <Link href={`/events/${event.id}`} style={actionLinkStyle}>
                            Open Event
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div style={sectionStyle}>
            <div>
              <h2 style={{ margin: 0, color: "#173b6c" }}>Upcoming Worklist</h2>
              <p style={{ margin: "6px 0 0", color: "#64748b", fontWeight: 700 }}>
                Next events in date order for the current view.
              </p>
            </div>

            <div style={{ display: "grid", gap: "10px", marginTop: "14px" }}>
              {loading ? (
                <div style={eventRowStyle}>Loading upcoming events...</div>
              ) : upcomingEvents.length === 0 ? (
                <div style={{ ...eventRowStyle, color: "#64748b", fontWeight: 700 }}>
                  No events available in this view.
                </div>
              ) : (
                upcomingEvents.map((event) => (
                  <div key={event.id} style={eventRowStyle}>
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
                        <div style={{ color: "#173b6c", fontWeight: 900 }}>
                          {event.name || "Untitled Event"}
                        </div>
                        <div style={{ marginTop: "4px", color: "#64748b", fontWeight: 700 }}>
                          {formatDate(event)} · {event.location || "Location TBD"}
                        </div>
                        <div style={{ marginTop: "6px", color: "#64748b", fontWeight: 700, fontSize: "13px" }}>
                          Owner: {getOwnershipLabel(event)}
                        </div>
                      </div>
                      <Link href={`/events/${event.id}`} style={actionLinkStyle}>
                        Review
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gap: "14px" }}>
          <div style={sectionStyle}>
            <h2 style={{ margin: 0, color: "#173b6c" }}>My Assignments</h2>
            <p style={{ margin: "6px 0 0", color: "#64748b", fontWeight: 700 }}>
              Personal workload based on events currently assigned to your account.
            </p>

            <div style={{ ...statGrid, marginTop: "14px" }}>
              <div style={statCard}>
                <div style={statLabel}>My Event Count</div>
                <div style={statValue}>{loading ? "..." : myWorkload.eventCount}</div>
              </div>
              <div style={statCard}>
                <div style={statLabel}>Need Attention</div>
                <div style={statValue}>{loading ? "..." : myWorkload.needingAttention}</div>
              </div>
              <div style={statCard}>
                <div style={statLabel}>Covered</div>
                <div style={statValue}>{loading ? "..." : myWorkload.covered}</div>
              </div>
              <div style={statCard}>
                <div style={statLabel}>My Open Shortage</div>
                <div style={statValue}>{loading ? "..." : myWorkload.openShortage}</div>
              </div>
            </div>

            <div style={{ display: "grid", gap: "10px", marginTop: "14px" }}>
              {loading ? (
                <div style={eventRowStyle}>Loading personal workload...</div>
              ) : myEvents.length === 0 ? (
                <div style={{ ...eventRowStyle, color: "#64748b", fontWeight: 700 }}>
                  No events are currently assigned to your account.
                </div>
              ) : (
                myEvents.slice(0, 5).map((event) => (
                  <div key={event.id} style={eventRowStyle}>
                    <div style={{ color: "#173b6c", fontWeight: 900 }}>
                      {event.name || "Untitled Event"}
                    </div>
                    <div style={{ marginTop: "4px", color: "#64748b", fontWeight: 700 }}>
                      {formatDate(event)}
                    </div>
                    <div style={{ marginTop: "6px", color: "#64748b", fontWeight: 700, fontSize: "13px" }}>
                      Owner: {getOwnershipLabel(event)}
                    </div>
                    <div style={{ marginTop: "6px", color: "#334155", fontWeight: 700 }}>
                      {Number(event.confirmed_assignments || 0)} confirmed / {Number(event.sp_needed || 0)} needed
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div style={sectionStyle}>
            <h2 style={{ margin: 0, color: "#173b6c" }}>Quick Actions</h2>
            <p style={{ margin: "6px 0 0", color: "#64748b", fontWeight: 700 }}>
              Jump directly into the operational tasks that keep the board moving.
            </p>

            <div style={{ display: "grid", gap: "10px", marginTop: "14px" }}>
              <Link href="/events" style={actionLinkStyle}>Open Events Board</Link>
              <Link href="/events/new" style={actionLinkStyle}>Create New Event</Link>
              <Link href="/events/upload" style={actionLinkStyle}>Import Schedule Workbook</Link>
              <Link href="/sps" style={actionLinkStyle}>Open SP Directory</Link>
              <Link href="/me" style={actionLinkStyle}>My Profile</Link>
            </div>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}

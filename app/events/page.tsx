"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import SiteShell from "../components/SiteShell";

type EventRow = {
  id: string;
  name: string | null;
  status: string | null;
  date_text: string | null;
  location: string | null;
  sp_needed: number | null;
  created_at: string | null;
  total_assignments: number | null;
  confirmed_assignments: number | null;
  shortage: number | null;
};

const cardStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #dbe4ee",
  borderRadius: "24px",
  padding: "22px",
  boxShadow: "0 10px 26px rgba(15, 23, 42, 0.06)",
  marginBottom: "18px",
};

const statGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: "14px",
  marginTop: "14px",
};

const statCard: React.CSSProperties = {
  border: "1px solid #dbe4ee",
  borderRadius: "18px",
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

function parseEventDateValue(event: EventRow): number {
  const candidates = [event.date_text, event.created_at].filter(Boolean) as string[];

  for (const candidate of candidates) {
    const parsed = Date.parse(candidate);
    if (!Number.isNaN(parsed)) return parsed;

    const slashDate = candidate.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
    if (slashDate) {
      const [, month, day, year] = slashDate;
      const fullYear = year
        ? year.length === 2
          ? `20${year}`
          : year
        : String(new Date().getFullYear());

      const retry = Date.parse(
        `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`
      );
      if (!Number.isNaN(retry)) return retry;
    }

    const monthNameDate = candidate.match(
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/i
    );
    if (monthNameDate) {
      const retry = Date.parse(monthNameDate[0]);
      if (!Number.isNaN(retry)) return retry;
    }
  }

  return Number.MAX_SAFE_INTEGER;
}

function sortEventsByDateThenName(a: EventRow, b: EventRow) {
  const aDate = parseEventDateValue(a);
  const bDate = parseEventDateValue(b);

  if (aDate !== bDate) return aDate - bDate;
  return (a.name || "").localeCompare(b.name || "");
}

async function parseApiError(response: Response) {
  try {
    const body = await response.json();
    return String(body?.error || `${response.status} ${response.statusText}`);
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}

async function fetchEventsPageData() {
  try {
    const response = await fetch("/api/events", { cache: "no-store" });

    if (!response.ok) {
      return {
        events: [],
        errorMessage: await parseApiError(response),
      };
    }

    const body = await response.json();
    const eventRows = Array.isArray(body?.events) ? (body.events as EventRow[]) : [];

    return {
      events: [...(eventRows || [])].sort(sortEventsByDateThenName),
      errorMessage: "",
    };
  } catch (error) {
    return {
      events: [],
      errorMessage: error instanceof Error ? error.message : "Could not load events.",
    };
  }
}

export default function EventsPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    const refresh = () => {
      void fetchEventsPageData().then((result) => {
        if (cancelled) return;

        setEvents(result.events);
        setErrorMessage(result.errorMessage);
        setLoading(false);
      });
    };

    refresh();

    window.addEventListener("focus", refresh);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const totalNeeded = events.reduce((sum, event) => sum + Number(event.sp_needed || 0), 0);
  const totalConfirmed = events.reduce(
    (sum, event) => sum + Number(event.confirmed_assignments || 0),
    0
  );
  const totalShortage = Math.max(totalNeeded - totalConfirmed, 0);

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
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: "14px",
          }}
        >
          <div style={statCard}>
            <div style={statLabel}>Total Events</div>
            <div style={statValue}>{events.length}</div>
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
      ) : events.length === 0 ? (
        <div style={cardStyle}>No events found in Supabase.</div>
      ) : (
        events.map((event) => {
          const needed = Number(event.sp_needed || 0);
          const totalAssignments = Number(event.total_assignments || 0);
          const confirmedAssignments = Number(event.confirmed_assignments || 0);
          const shortage = Number(event.shortage || 0);
          const isCovered = shortage === 0 && needed > 0;
          const coverageText =
            needed > 0
              ? `${confirmedAssignments} confirmed / ${needed} needed`
              : `${confirmedAssignments} confirmed`;

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
                  <h2 style={{ margin: 0, fontSize: "34px", color: "#173b6c", lineHeight: 1.15 }}>
                    {event.name || "Untitled Event"}
                  </h2>

                  <div style={{ marginTop: 8, color: "#64748b", fontWeight: 700 }}>
                    {event.status || "No status"}
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <span style={shortagePill(isCovered)}>
                      {needed > 0
                        ? shortage === 0
                          ? "Covered"
                          : `${shortage} short`
                        : "No SP target set"}
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
                  <div style={statValue}>{event.date_text || "—"}</div>
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
                  <div style={statValue}>{coverageText}</div>
                </div>
              </div>

              <div style={{ marginTop: 14, color: "#173b6c", lineHeight: 1.8 }}>
                <div>
                  <strong>Status:</strong> {event.status || "—"}
                </div>
                <div>
                  <strong>Total Saved Assignments:</strong> {totalAssignments}
                </div>
              </div>
            </div>
          );
        })
      )}
    </SiteShell>
  );
}

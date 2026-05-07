"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import SiteShell from "../components/SiteShell";
import { formatHumanDate, getImportedYearHint } from "../lib/eventDateUtils";
import { classifyEventPresentation, getEventBadgeAppearance } from "../lib/eventClassification";
import { formatDisplayTime } from "../lib/timeFormat";

type EventRow = {
  id: string;
  name: string | null;
  status: string | null;
  date_text: string | null;
  location: string | null;
  sp_needed: number | null;
  notes: string | null;
  earliest_session_date?: string | null;
  earliest_session_start?: string | null;
  latest_session_end?: string | null;
  assigned_sp_names?: string[] | null;
  total_assignments?: number | null;
  confirmed_assignments?: number | null;
  shortage?: number | null;
};

type EventsResponse = {
  events?: EventRow[];
  error?: string;
};

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

  const badges = [
    {
      key: presentation.primaryBadgeKind,
      label: presentation.primaryBadgeLabel,
      ...getEventBadgeAppearance(presentation.primaryBadgeKind),
    },
  ];

  if (presentation.isVirtualSp && presentation.primaryBadgeKind !== "virtual_sp") {
    badges.push({
      key: "virtual_sp",
      label: "Virtual",
      ...getEventBadgeAppearance("virtual_sp"),
    });
  }

  return badges;
}

export default function EventsPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadEvents() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch("/api/events", { cache: "no-store" });
        const data = (await response.json()) as EventsResponse;

        if (!response.ok) {
          throw new Error(data.error || "Could not load events.");
        }

        if (!cancelled) {
          setEvents(data.events || []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load events.");
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

  const totals = useMemo(() => {
    return events.reduce(
      (sum, event) => {
        sum.needed += Number(event.sp_needed || 0);
        sum.assigned += Number(event.total_assignments || 0);
        sum.confirmed += Number(event.confirmed_assignments || 0);
        sum.shortage += Number(event.shortage || 0);
        return sum;
      },
      { needed: 0, assigned: 0, confirmed: 0, shortage: 0 }
    );
  }, [events]);

  return (
    <SiteShell
      title="Events"
      subtitle="Browse events, review coverage, and open each event command center."
    >
      <main style={{ padding: 24, display: "grid", gap: 24 }}>
        <section
          style={{
            border: "1px solid #d9e2ec",
            borderRadius: 18,
            padding: 20,
            background: "linear-gradient(180deg, #f8fbfd 0%, #eef5fb 100%)",
          }}
        >
          <h1 style={{ margin: 0, fontSize: 32, color: "#14304f" }}>Event Browser</h1>
          <p style={{ margin: "10px 0 0", color: "#52616b", maxWidth: 780 }}>
            Open any event to jump straight into its command center. Cards below show the date, 12-hour time, location, type, and current SP coverage at a glance.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
              marginTop: 18,
            }}
          >
            <SummaryCard label="Events" value={String(events.length)} />
            <SummaryCard label="SP Needed" value={String(totals.needed)} />
            <SummaryCard label="Assigned" value={String(totals.assigned)} />
            <SummaryCard label="Shortage" value={String(totals.shortage)} tone={totals.shortage > 0 ? "warning" : "default"} />
          </div>
        </section>

        <section
          style={{
            border: "1px solid #d9e2ec",
            borderRadius: 16,
            padding: 18,
            background: "white",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <h2 style={{ margin: 0 }}>Events</h2>
              <p style={{ margin: "6px 0 0", color: "#52616b" }}>Click a card to open the event command center.</p>
            </div>
            <Link
              href="/events/new"
              style={{
                display: "inline-flex",
                alignItems: "center",
                textDecoration: "none",
                borderRadius: 999,
                padding: "10px 14px",
                background: "#173b6c",
                color: "#ffffff",
                fontWeight: 800,
              }}
            >
              New Event
            </Link>
          </div>

          {loading ? <p>Loading events...</p> : null}
          {error ? <p style={{ color: "#b42318" }}>{error}</p> : null}
          {!loading && !error && events.length === 0 ? <p>No events found.</p> : null}

          <div style={{ display: "grid", gap: 14, marginTop: 16 }}>
            {events.map((event) => {
              const badges = getEventBadges(event);
              const needed = Number(event.sp_needed || 0);
              const assigned = Number(event.total_assignments || 0);
              const confirmed = Number(event.confirmed_assignments || 0);
              const shortage = Math.max(Number(event.shortage || 0), 0);

              return (
                <Link
                  key={event.id}
                  href={`/events/${event.id}`}
                  style={{
                    display: "block",
                    textDecoration: "none",
                    color: "inherit",
                    border: "1px solid #d9e2ec",
                    borderRadius: 16,
                    padding: 16,
                    background: "#ffffff",
                    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.05)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ display: "grid", gap: 8 }}>
                      <strong style={{ fontSize: 20, color: "#14304f" }}>{event.name || "Untitled Event"}</strong>
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
                            background: "#f8fafc",
                            border: "1px solid #d9e2ec",
                            color: "#52616b",
                            fontWeight: 800,
                            fontSize: 12,
                          }}
                        >
                          {event.status || "No status"}
                        </span>
                      </div>
                    </div>
                    <div style={{ color: "#52616b", fontWeight: 700, textAlign: "right" }}>
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
                    <MetricBlock label="SP Needed" value={String(needed)} />
                    <MetricBlock label="Assigned" value={String(assigned)} />
                    <MetricBlock label="Confirmed" value={String(confirmed)} />
                    <MetricBlock
                      label="Shortage"
                      value={String(shortage)}
                      valueColor={shortage > 0 ? "#991b1b" : "#166534"}
                    />
                  </div>
                </Link>
              );
            })}
          </div>
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
        border: "1px solid #d9e2ec",
        borderRadius: 14,
        padding: 14,
        background: warning ? "#fff5f5" : "#ffffff",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", color: "#64748b" }}>{props.label}</div>
      <div style={{ marginTop: 6, fontSize: 22, fontWeight: 900, color: warning ? "#991b1b" : "#14304f" }}>{props.value}</div>
    </div>
  );
}

function MetricBlock(props: { label: string; value: string; valueColor?: string }) {
  return (
    <div
      style={{
        border: "1px solid #e5edf5",
        borderRadius: 12,
        padding: 12,
        background: "#f8fbfd",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", color: "#64748b" }}>{props.label}</div>
      <div style={{ marginTop: 6, fontWeight: 900, color: props.valueColor || "#14304f" }}>{props.value}</div>
    </div>
  );
}

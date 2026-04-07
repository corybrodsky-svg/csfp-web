"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import SiteShell from "../components/SiteShell";
import * as planningData from "../lib/planningData";
import {
  EventAssignment,
  ImportedEvent,
  buildImportedEvents,
  loadAssignments,
  slugify,
} from "../lib/cfspData";

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

function getEventMatch(event: ImportedEvent, assignment: EventAssignment) {
  const eventIdKey = slugify(event.id);
  const eventNameKey = slugify(event.name);

  return (
    slugify(assignment.eventId) === eventIdKey ||
    slugify(assignment.eventName) === eventNameKey
  );
}

function countAssignmentsForEvent(
  event: ImportedEvent,
  assignments: EventAssignment[]
) {
  const matching = assignments.filter((a) => getEventMatch(event, a));

  const confirmed = matching.filter((a) => a.confirmed).length;
  const total = matching.length;
  const needed = Number(event.spNeeded || 0);
  const shortage = Math.max(needed - confirmed, 0);

  return {
    total,
    confirmed,
    shortage,
  };
}

function parseEventDateValue(event: ImportedEvent): number {
  const candidates = [
    event.dateText,
    (event as any).date,
    (event as any).firstDate,
    (event as any).startDate,
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    const parsed = Date.parse(candidate);
    if (!Number.isNaN(parsed)) return parsed;

    const match = candidate.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
    if (match) {
      const [, mm, dd, yyyy] = match;
      const fullYear = yyyy.length === 2 ? `20${yyyy}` : yyyy;
      const retry = Date.parse(
        `${fullYear}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`
      );
      if (!Number.isNaN(retry)) return retry;
    }

    const monthNameMatch = candidate.match(
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b/i
    );
    if (monthNameMatch) {
      const retry = Date.parse(monthNameMatch[0]);
      if (!Number.isNaN(retry)) return retry;
    }
  }

  return Number.MAX_SAFE_INTEGER;
}

export default function EventsPage() {
  const events = useMemo(() => {
    const imported = buildImportedEvents(planningData);

    return [...imported].sort((a, b) => {
      const aDate = parseEventDateValue(a);
      const bDate = parseEventDateValue(b);

      if (aDate !== bDate) return aDate - bDate;

      return a.name.localeCompare(b.name);
    });
  }, []);

  const [assignments, setAssignments] = useState<EventAssignment[]>([]);

  useEffect(() => {
    const refresh = () => {
      setAssignments(loadAssignments());
    };

    refresh();

    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);

    return () => {
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const totalNeeded = events.reduce((sum, event) => sum + Number(event.spNeeded || 0), 0);
  const totalConfirmed = events.reduce(
    (sum, event) => sum + countAssignmentsForEvent(event, assignments).confirmed,
    0
  );
  const totalShortage = Math.max(totalNeeded - totalConfirmed, 0);

  return (
    <SiteShell
      title="Events"
      subtitle="Real event list with saved SP assignment coverage, shortage tracking, and clean earliest-date sorting."
    >
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

      {events.map((event) => {
        const counts = countAssignmentsForEvent(event, assignments);
        const needed = Number(event.spNeeded || 0);
        const isCovered = counts.shortage === 0 && needed > 0;
        const coverageText =
          needed > 0
            ? `${counts.confirmed} confirmed / ${needed} needed`
            : `${counts.confirmed} confirmed`;

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
                  {event.name}
                </h2>

                <div style={{ marginTop: 8, color: "#64748b", fontWeight: 700 }}>
                  {event.status || "No status"}
                </div>

                <div style={{ marginTop: 12 }}>
                  <span style={shortagePill(isCovered)}>
                    {needed > 0
                      ? counts.shortage === 0
                        ? "Covered"
                        : `${counts.shortage} short`
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
                <div style={statLabel}>Dates</div>
                <div style={statValue}>{event.dateText || "—"}</div>
              </div>

              <div style={statCard}>
                <div style={statLabel}>Sessions</div>
                <div style={statValue}>{event.sessionCount ?? 0}</div>
              </div>

              <div style={statCard}>
                <div style={statLabel}>Rooms</div>
                <div style={statValue}>{event.roomCount ?? 0}</div>
              </div>

              <div style={statCard}>
                <div style={statLabel}>SP Coverage</div>
                <div style={statValue}>{coverageText}</div>
              </div>
            </div>

            <div style={{ marginTop: 14, color: "#173b6c", lineHeight: 1.8 }}>
              <div>
                <strong>Assigned Sim Ops:</strong> {event.simOp || "—"}
              </div>
              <div>
                <strong>Lead(s):</strong> {event.faculty || "—"}
              </div>
              <div>
                <strong>Rooms:</strong> {event.roomsLabel || "—"}
              </div>
              <div>
                <strong>Total Saved Assignments:</strong> {counts.total}
              </div>
            </div>
          </div>
        );
      })}
    </SiteShell>
  );
}

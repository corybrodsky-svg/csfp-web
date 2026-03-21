"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabaseClient";

type Visibility = "team" | "personal";
type ViewFilter = "all" | Visibility;

type EventRow = {
  id: string;
  name: string | null;
  status: string | null;
  date_text: string | null;
  sp_needed: number | null;
  sp_assigned: number | null;
  visibility: string | null;
  created_at: string | null;
  location?: string | null;
};

const pageStyle: React.CSSProperties = {
  maxWidth: "1100px",
  margin: "0 auto",
  padding: "24px",
  fontFamily: "Arial, Helvetica, sans-serif",
  color: "#111827",
};

const topBarStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  marginBottom: "20px",
  flexWrap: "wrap",
};

const headingStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "34px",
  fontWeight: 800,
  color: "#0f172a",
};

const subTextStyle: React.CSSProperties = {
  marginTop: "6px",
  marginBottom: 0,
  color: "#64748b",
  fontSize: "14px",
};

const actionRowStyle: React.CSSProperties = {
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
};

const primaryLinkStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: "10px",
  textDecoration: "none",
  background: "#111827",
  color: "#ffffff",
  fontWeight: 700,
  border: "1px solid #111827",
};

const secondaryLinkStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: "10px",
  textDecoration: "none",
  background: "#ffffff",
  color: "#111827",
  fontWeight: 700,
  border: "1px solid #d1d5db",
};

const controlsCardStyle: React.CSSProperties = {
  border: "1px solid #d8e0ee",
  borderRadius: "18px",
  padding: "18px",
  background: "#ffffff",
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.05)",
  marginBottom: "18px",
};

const controlsGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "2fr 1fr 1fr",
  gap: "12px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "11px 12px",
  border: "1px solid #cbd5e1",
  borderRadius: "10px",
  fontSize: "14px",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "12px",
  fontWeight: 800,
  color: "#64748b",
  marginBottom: "6px",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const listStyle: React.CSSProperties = {
  display: "grid",
  gap: "14px",
};

const cardStyle: React.CSSProperties = {
  border: "1px solid #d8e0ee",
  borderRadius: "18px",
  padding: "18px",
  background: "#ffffff",
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.05)",
};

const cardTopStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "12px",
  marginBottom: "12px",
  flexWrap: "wrap",
};

const eventNameLinkStyle: React.CSSProperties = {
  fontSize: "22px",
  fontWeight: 800,
  color: "#0f172a",
  textDecoration: "none",
  lineHeight: 1.2,
};

const metaGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: "10px",
  marginTop: "10px",
};

const metaBoxStyle: React.CSSProperties = {
  background: "#f8fafc",
  border: "1px solid #dbe4f0",
  borderRadius: "12px",
  padding: "10px 12px",
};

const metaLabelStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 800,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: "6px",
};

const metaValueStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "#111827",
  lineHeight: 1.4,
  overflowWrap: "anywhere",
};

function textOrDash(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "—";
  const s = String(value).trim();
  return s ? s : "—";
}

function shortage(event: EventRow) {
  const needed = event.sp_needed ?? 0;
  const assigned = event.sp_assigned ?? 0;
  return Math.max(0, needed - assigned);
}

function statusPillStyle(status: string | null): React.CSSProperties {
  const normalized = (status ?? "").trim().toLowerCase();

  if (normalized === "complete") {
    return {
      display: "inline-block",
      borderRadius: "999px",
      padding: "7px 12px",
      fontSize: "13px",
      fontWeight: 800,
      border: "1px solid #86efac",
      background: "#ecfdf3",
      color: "#15803d",
      whiteSpace: "nowrap",
    };
  }

  if (normalized === "in progress") {
    return {
      display: "inline-block",
      borderRadius: "999px",
      padding: "7px 12px",
      fontSize: "13px",
      fontWeight: 800,
      border: "1px solid #93c5fd",
      background: "#eff6ff",
      color: "#1d4ed8",
      whiteSpace: "nowrap",
    };
  }

  if (normalized === "scheduled") {
    return {
      display: "inline-block",
      borderRadius: "999px",
      padding: "7px 12px",
      fontSize: "13px",
      fontWeight: 800,
      border: "1px solid #c4b5fd",
      background: "#f5f3ff",
      color: "#6d28d9",
      whiteSpace: "nowrap",
    };
  }

  return {
    display: "inline-block",
    borderRadius: "999px",
    padding: "7px 12px",
    fontSize: "13px",
    fontWeight: 800,
    border: "1px solid #fde68a",
    background: "#fffbeb",
    color: "#b45309",
    whiteSpace: "nowrap",
  };
}

export default function EventsPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const [searchTerm, setSearchTerm] = useState("");
  const [viewFilter, setViewFilter] = useState<ViewFilter>("all");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    async function loadEvents() {
      setLoading(true);
      setErrorMessage("");

      const { data, error } = await supabase
        .from("events")
        .select(
          `
            id,
            name,
            status,
            date_text,
            sp_needed,
            sp_assigned,
            visibility,
            created_at,
            location
          `
        )
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error loading events:", error);
        setErrorMessage(error.message || "Could not load events.");
        setEvents([]);
      } else {
        setEvents((data as EventRow[]) || []);
      }

      setLoading(false);
    }

    loadEvents();
  }, []);

  const visibleEvents = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();

    return events.filter((event) => {
      const matchesSearch =
        !q ||
        (event.name ?? "").toLowerCase().includes(q) ||
        (event.date_text ?? "").toLowerCase().includes(q) ||
        (event.status ?? "").toLowerCase().includes(q) ||
        (event.location ?? "").toLowerCase().includes(q);

      const matchesVisibility =
        viewFilter === "all" ? true : (event.visibility ?? "") === viewFilter;

      const matchesStatus =
        statusFilter === "all" ? true : (event.status ?? "") === statusFilter;

      return matchesSearch && matchesVisibility && matchesStatus;
    });
  }, [events, searchTerm, viewFilter, statusFilter]);

  return (
    <div style={pageStyle}>
      <div style={topBarStyle}>
        <div>
          <h1 style={headingStyle}>Events</h1>
          <p style={subTextStyle}>Browse, search, and open event details.</p>
        </div>

        <div style={actionRowStyle}>
          <Link href="/dashboard" style={secondaryLinkStyle}>
            ← Dashboard
          </Link>
          <Link href="/events/new" style={primaryLinkStyle}>
            + New Event
          </Link>
        </div>
      </div>

      <div style={controlsCardStyle}>
        <div style={controlsGridStyle}>
          <div>
            <label htmlFor="search" style={labelStyle}>
              Search
            </label>
            <input
              id="search"
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name, date, status, or location"
              style={inputStyle}
            />
          </div>

          <div>
            <label htmlFor="visibilityFilter" style={labelStyle}>
              Visibility
            </label>
            <select
              id="visibilityFilter"
              value={viewFilter}
              onChange={(e) => setViewFilter(e.target.value as ViewFilter)}
              style={inputStyle}
            >
              <option value="all">All</option>
              <option value="team">Team</option>
              <option value="personal">Personal</option>
            </select>
          </div>

          <div>
            <label htmlFor="statusFilter" style={labelStyle}>
              Status
            </label>
            <select
              id="statusFilter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={inputStyle}
            >
              <option value="all">All</option>
              <option value="Needs SPs">Needs SPs</option>
              <option value="Scheduled">Scheduled</option>
              <option value="In Progress">In Progress</option>
              <option value="Complete">Complete</option>
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={cardStyle}>Loading events...</div>
      ) : errorMessage ? (
        <div style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>Could not load events</h2>
          <p style={{ color: "#b91c1c", marginBottom: 0 }}>{errorMessage}</p>
        </div>
      ) : visibleEvents.length === 0 ? (
        <div style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>No events found</h2>
          <p style={{ marginBottom: 0 }}>
            Try changing your filters or create a new event.
          </p>
        </div>
      ) : (
        <div style={listStyle}>
          {visibleEvents.map((event) => (
            <div key={event.id} style={cardStyle}>
              <div style={cardTopStyle}>
                <div>
                  <Link href={`/events/${event.id}`} style={eventNameLinkStyle}>
                    {textOrDash(event.name || "Untitled Event")}
                  </Link>

                  <div
                    style={{ marginTop: "8px", color: "#64748b", fontSize: "14px" }}
                  >
                    {textOrDash(event.date_text)}
                  </div>
                </div>

                <div style={statusPillStyle(event.status)}>
                  {textOrDash(event.status)}
                </div>
              </div>

              <div style={metaGridStyle}>
                <div style={metaBoxStyle}>
                  <div style={metaLabelStyle}>Visibility</div>
                  <div style={metaValueStyle}>{textOrDash(event.visibility)}</div>
                </div>

                <div style={metaBoxStyle}>
                  <div style={metaLabelStyle}>SP Needed</div>
                  <div style={metaValueStyle}>{textOrDash(event.sp_needed ?? 0)}</div>
                </div>

                <div style={metaBoxStyle}>
                  <div style={metaLabelStyle}>SP Assigned</div>
                  <div style={metaValueStyle}>{textOrDash(event.sp_assigned ?? 0)}</div>
                </div>

                <div style={metaBoxStyle}>
                  <div style={metaLabelStyle}>Shortage</div>
                  <div style={metaValueStyle}>{shortage(event)}</div>
                </div>
              </div>

              <div style={{ marginTop: "14px" }}>
                <Link
                  href={`/events/${event.id}`}
                  style={{
                    color: "#1d4ed8",
                    textDecoration: "none",
                    fontWeight: 700,
                  }}
                >
                  Open details →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

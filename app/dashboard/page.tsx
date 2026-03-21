"use client";

import Link from "next/link";

const shellStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#f5f7fb",
  padding: "32px 20px",
};

const containerStyle: React.CSSProperties = {
  maxWidth: 1180,
  margin: "0 auto",
};

const heroStyle: React.CSSProperties = {
  background: "linear-gradient(135deg, #111827, #1f2937)",
  color: "#fff",
  borderRadius: 24,
  padding: "28px 24px",
  marginBottom: 24,
  boxShadow: "0 14px 30px rgba(0,0,0,0.12)",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 18,
};

const cardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #dbe3f0",
  borderRadius: 20,
  padding: 20,
  boxShadow: "0 8px 20px rgba(15,23,42,0.06)",
};

const buttonStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "12px 16px",
  borderRadius: 12,
  textDecoration: "none",
  fontWeight: 700,
  border: "1px solid #c7d2e5",
  color: "#1d4ed8",
  background: "#fff",
};

export default function DashboardPage() {
  return (
    <main style={shellStyle}>
      <div style={containerStyle}>
        <section style={heroStyle}>
          <h1 style={{ margin: 0, fontSize: "2.4rem", lineHeight: 1.05 }}>
            CFSP Dashboard
          </h1>
          <p style={{ marginTop: 12, marginBottom: 0, fontSize: "1.02rem", opacity: 0.94 }}>
            Main navigation for Conflict-Free SP. This is your live hub.
          </p>
        </section>

        <section style={gridStyle}>
          <div style={cardStyle}>
            <h2 style={{ marginTop: 0 }}>Events</h2>
            <p style={{ color: "#5b6472", lineHeight: 1.5 }}>
              Browse all events, search records, and open event details.
            </p>
            <Link href="/events" style={buttonStyle}>
              Open Events
            </Link>
          </div>

          <div style={cardStyle}>
            <h2 style={{ marginTop: 0 }}>Create Event</h2>
            <p style={{ color: "#5b6472", lineHeight: 1.5 }}>
              Add a new event to your events table.
            </p>
            <Link href="/events/new" style={buttonStyle}>
              New Event
            </Link>
          </div>

          <div style={cardStyle}>
            <h2 style={{ marginTop: 0 }}>Import Events</h2>
            <p style={{ color: "#5b6472", lineHeight: 1.5 }}>
              Open the import tool for bringing events into the app.
            </p>
            <Link href="/Import/events" style={buttonStyle}>
              Import Tool
            </Link>
          </div>

          <div style={cardStyle}>
            <h2 style={{ marginTop: 0 }}>Login</h2>
            <p style={{ color: "#5b6472", lineHeight: 1.5 }}>
              Return to the login page or use it as your front-door route.
            </p>
            <Link href="/login" style={buttonStyle}>
              Go to Login
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
